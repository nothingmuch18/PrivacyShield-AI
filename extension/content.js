/* ================================================================
   PrivacyShield AI — Content Script
   The main pipeline: capture → detect → OCR → PII → redact → send
   Runs on every webpage when the extension is enabled.
   ================================================================ */

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__privacyShieldInjected) return;
  window.__privacyShieldInjected = true;

  console.log('[PrivacyShield] Content script injected');

  // ================================================================
  //  STATE
  // ================================================================
  let isEnabled = false;
  let captureIntervalId = null;
  let captureCanvas = null;
  let captureCtx = null;
  let overlayCanvas = null;
  let overlayCtx = null;
  let overlayVisible = false;
  let cycleCount = 0;
  let isCapturing = false;
  let domObserver = null;
  let captureTimeout = null;
  let lastScreenshotHash = null;

  // Workers
  let detectionWorker = null;
  let ocrWorker = null;
  let redactionWorker = null;
  let workersInitialized = false;
  let isIdle = true;
  let idleTimeout = null;

  // Track worker model status globally to sync side panel if it connects late
  let latestDetectionStatus = { status: 'loading', progress: 0 };
  let latestOcrStatus = { status: 'loading', progress: 0 };

  function ensureWorkersInitialized() {
    if (!workersInitialized) {
      initWorkers();
      workersInitialized = true;
    }
  }

  function wakeUp() {
    if (isIdle) {
      isIdle = false;
      ensureWorkersInitialized();
      console.log('[PrivacyShield] Waking up, pipeline active');
    }
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      if (!currentTask) {
        isIdle = true;
        console.log('[PrivacyShield] Pipeline idle');
      }
    }, 5000);
  }

  window.addEventListener('mousemove', wakeUp, { passive: true });
  window.addEventListener('keydown', wakeUp, { passive: true });
  window.addEventListener('scroll', wakeUp, { passive: true });

  // Detection results (latest)
  let lastFaces = [];
  let lastOcrResult = null;
  let lastPiiItems = [];
  let lastDomElements = [];
  let lastDomSummary = "";
  let lastRedactedBase64 = null;

  // Task
  let currentTask = null;

  // Server connection
  let serverSocket = null;
  let serverConnected = false;
  let reconnectTimeout = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;
  let offlineQueue = [];

  // Agent State
  let isAgentPaused = false;
  let pendingAction = null;
  let pendingActionTimeout = null;

  // Performance tracking
  let metrics = {
    captureTime: 0,
    detectionTime: 0,
    ocrTime: 0,
    piiScanTime: 0,
    redactTime: 0,
    serverTime: 0,
    totalTime: 0
  };

  // Floating badge element
  let floatingBadge = null;

  // Sound settings
  let soundEnabled = true;
  let audioCtx = null;
  let hasAlertedHighPii = false;

  // ================================================================
  //  INITIALIZATION
  // ================================================================

  // Load saved state
  chrome.storage.local.get(['extensionEnabled', 'currentTask', 'overlayVisible'], (result) => {
    if (result.overlayVisible !== undefined) {
      overlayVisible = result.overlayVisible;
    }
    if (result.extensionEnabled) {
      startPipeline();
    }
    if (result.currentTask) {
      currentTask = result.currentTask;
    }
  });

  // Listen for messages from popup and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggle_overlay') {
      overlayVisible = message.visible !== undefined ? message.visible : !overlayVisible;
      if (overlayCanvas) {
        overlayCanvas.style.display = overlayVisible ? 'block' : 'none';
        if (!overlayVisible && overlayCtx) {
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        } else if (overlayVisible) {
          drawOverlay(lastFaces, lastPiiItems);
        }
      }
      chrome.storage.local.set({ overlayVisible });
      sendResponse && sendResponse({ overlayVisible });
      console.log(`[PrivacyShield] Overlay ${overlayVisible ? 'shown' : 'hidden'}`);
    }

    if (message.type === 'toggle_extension') {
      if (message.enabled) {
        startPipeline();
      } else {
        stopPipeline();
      }
    }

    if (message.type === 'task_updated') {
      currentTask = message.task;
      console.log('[PrivacyShield] Task updated:', currentTask);
      if (currentTask) {
        wakeUp();
      }
      if (window.AgentController && currentTask) {
        window.AgentController.startTask(currentTask, 'http://localhost:8000');
      }
    }

    if (message.type === 'sound_toggled') {
      soundEnabled = message.enabled;
      console.log(`[PrivacyShield] Sounds ${soundEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    if (message.type === 'pause_agent') {
      isAgentPaused = true;
      if (window.AgentController) window.AgentController.pause();
      console.log('[PrivacyShield] Agent paused');
    }

    if (message.type === 'resume_agent') {
      isAgentPaused = false;
      if (window.AgentController) window.AgentController.resume();
      console.log('[PrivacyShield] Agent resumed');
    }

    if (message.type === 'cancel_action') {
      console.log('[PrivacyShield] Action cancelled by user');
      if (pendingActionTimeout) {
        clearTimeout(pendingActionTimeout);
        pendingActionTimeout = null;
      }
      pendingAction = null;
    }

    if (message.type === 'confirm_action') {
      console.log('[PrivacyShield] Action confirmed by user');
      if (pendingActionTimeout) {
        clearTimeout(pendingActionTimeout);
        pendingActionTimeout = null;
      }
      if (pendingAction) {
        const actionToExecute = pendingAction;
        pendingAction = null;
        executeAction(actionToExecute);
      }
    }
  });

  // Keyboard shortcut: Ctrl+Shift+D to toggle overlay
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      overlayVisible = !overlayVisible;
      if (overlayCanvas) {
        overlayCanvas.style.display = overlayVisible ? 'block' : 'none';
      }
      console.log(`[PrivacyShield] Overlay ${overlayVisible ? 'shown' : 'hidden'}`);
    }
  });

  // ================================================================
  //  PIPELINE CONTROL
  // ================================================================

  function startPipeline() {
    if (isEnabled) return;
    isEnabled = true;
    console.log('[PrivacyShield] Pipeline STARTED');

    // Initialize workers immediately
    ensureWorkersInitialized();

    // Create capture canvas (hidden)
    captureCanvas = document.createElement('canvas');
    captureCtx = captureCanvas.getContext('2d');

    // Create overlay canvas
    createOverlay();

    // Create floating badge
    createFloatingBadge();

    // Connect to server
    connectToServer();

    // Setup event-driven capture loop
    domObserver = new MutationObserver(debouncedCapture);
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener('scroll', debouncedCapture, { passive: true });
    window.addEventListener('scroll', liveScrollHandler, { passive: true });
    window.addEventListener('resize', debouncedCapture, { passive: true });
    window.addEventListener('resize', liveScrollHandler, { passive: true });
    triggerCapture();

    // When the pipeline starts, hook into AgentController events
    if (window.AgentController) {
      window.AgentController.on('agent:plan-received', (data) => {
        chrome.runtime.sendMessage({
          type: 'agent_update',
          data: { event: 'plan_received', ...data }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      });

      window.AgentController.on('agent:step-started', (data) => {
        chrome.runtime.sendMessage({
          type: 'agent_update',
          data: { event: 'step_started', ...data }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      });

      window.AgentController.on('agent:step-completed', (data) => {
        chrome.runtime.sendMessage({
          type: 'agent_update',
          data: { event: 'step_completed', ...data }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      });
      
      window.AgentController.on('agent:action-preview', (data) => {
        chrome.runtime.sendMessage({
          type: 'action_preview',
          data: { action: data.action, state: 'PENDING_EXECUTION', countdown: data.countdown }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      });
      
      window.AgentController.on('agent:task-completed', (data) => {
        playSound('success');
        chrome.runtime.sendMessage({
          type: 'agent_update',
          data: { event: 'task_completed', ...data }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      });

      window.AgentController.on('agent:error', (data) => {
        playSound('warning');
        chrome.runtime.sendMessage({
          type: 'agent_update',
          data: { event: 'error', ...data }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      });
    }
  }

  function stopPipeline() {
    isEnabled = false;
    console.log('[PrivacyShield] Pipeline STOPPED');

    // Stop capture loop
    if (captureIntervalId) {
      clearTimeout(captureIntervalId);
      captureIntervalId = null;
    }
    if (captureTimeout) {
      clearTimeout(captureTimeout);
      captureTimeout = null;
    }
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    window.removeEventListener('scroll', debouncedCapture);
    window.removeEventListener('scroll', liveScrollHandler);
    window.removeEventListener('resize', debouncedCapture);
    window.removeEventListener('resize', liveScrollHandler);

    // Remove overlay
    if (overlayCanvas && overlayCanvas.parentNode) {
      overlayCanvas.parentNode.removeChild(overlayCanvas);
      overlayCanvas = null;
    }

    // Remove floating badge
    if (floatingBadge && floatingBadge.parentNode) {
      floatingBadge.parentNode.removeChild(floatingBadge);
      floatingBadge = null;
    }

    // Terminate workers
    if (detectionWorker) {
      detectionWorker.terminate();
      detectionWorker = null;
    }
    if (ocrWorker) {
      ocrWorker.terminate();
      ocrWorker = null;
    }

    // Disconnect from server
    if (serverSocket) {
      serverSocket.close();
      serverSocket = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Reset state
    lastFaces = [];
    lastOcrResult = null;
    lastPiiItems = [];
    lastDomElements = [];
    lastDomSummary = "";
    lastRedactedBase64 = null;
    cycleCount = 0;

    // Clear the side panel UI
    chrome.runtime.sendMessage({ type: 'clear_side_panel' }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
  }

  // ================================================================
  //  CAPTURE LOOP
  // ================================================================

  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  function debouncedCapture() {
    if (!isEnabled || isCapturing) return;
    if (captureTimeout) clearTimeout(captureTimeout);
    const delay = (currentTask || !isIdle) ? 500 : 1500;
    captureTimeout = setTimeout(() => {
      triggerCapture();
    }, delay);
  }

  async function triggerCapture() {
    if (!isEnabled || isCapturing) return;
    isCapturing = true;
    try {
      await runCaptureLoop();
    } finally {
      isCapturing = false;
    }
  }

  async function runCaptureLoop() {
    if (!isEnabled) return;

    const cycleStart = performance.now();
    cycleCount++;

    try {
      // Step 1: Capture screenshot
      const capStart = performance.now();
      const screenshotData = await requestScreenCapture();
      metrics.captureTime = Math.round(performance.now() - capStart);

      if (!screenshotData) {
        console.warn('[PrivacyShield] No screenshot data received');
        return;
      }

      // Check frame hash to skip detection if unchanged
      const currentHash = cyrb53(screenshotData).toString();
      if (currentHash === lastScreenshotHash && lastRedactedBase64) {
        console.log('[PrivacyShield] Frame unchanged, skipping detection');
        if (overlayVisible) {
          drawOverlay(lastFaces, lastPiiItems);
        }
        return;
      }
      lastScreenshotHash = currentHash;

      // Draw screenshot onto hidden canvas
      const img = await loadImage(screenshotData);
      captureCanvas.width = img.width;
      captureCanvas.height = img.height;
      captureCtx.drawImage(img, 0, 0);

      // Step 2: Run detection tasks in parallel
      const parallelTasks = [];

      // Face detection (every cycle - combine worker + visible DOM portrait elements)
      const detStart = performance.now();
      parallelTasks.push(
        (detectionWorker ? runFaceDetection(screenshotData) : Promise.resolve([])).then(workerFaces => {
          const domFaces = scanDomFaces();
          const allFaces = [...domFaces];
          (workerFaces || []).forEach(wf => {
            if (wf.y < 80) return; // Exclude false positive face blobs in top header bar
            const overlap = allFaces.some(df => Math.abs(df.x - wf.x) < 50 && Math.abs(df.y - wf.y) < 50);
            if (!overlap) allFaces.push(wf);
          });
          metrics.detectionTime = Math.round(performance.now() - detStart);
          lastFaces = allFaces;
        })
      );

      // OCR (capped to prevent freezing UI cycle)
      if (ocrWorker && cycleCount % 3 === 0) {
        const ocrStart = performance.now();
        parallelTasks.push(
          runOCR(screenshotData).then(result => {
            metrics.ocrTime = Math.round(performance.now() - ocrStart);
            lastOcrResult = result;
          })
        );
      }

      // DOM analysis (every cycle — it's fast)
      const domStart = performance.now();
      const domResult = window.DOMReader.readDOM();
      lastDomElements = domResult.elements;
      lastDomSummary = domResult.summary;
      const domTime = Math.round(performance.now() - domStart);

      // Wait for parallel tasks
      await Promise.allSettled(parallelTasks);

      // Step 3: PII detection
      const piiStart = performance.now();
      lastPiiItems = window.PIIDetector.detectPII(
        lastOcrResult ? lastOcrResult.text : '',
        lastDomElements
      );
      metrics.piiScanTime = Math.round(performance.now() - piiStart);

      // Build Redaction Manifest
      const manifestResult = window.ManifestBuilder ? window.ManifestBuilder.buildManifest({
        faces: lastFaces,
        piiItems: lastPiiItems
      }) : { total: 0, tokens: {} };

      
      const highPii = lastPiiItems.find(item => item.severity === 'high');
      if (highPii && !hasAlertedHighPii) {
          hasAlertedHighPii = true;
          playSound('shield');
          chrome.runtime.sendMessage({ 
             type: 'show_notification', 
             title: '🛡️ PrivacyShield',
             message: `${highPii.label || 'Sensitive data'} detected and redacted`
          }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      }

      if (window.AgentController) {
        window.AgentController.updatePiiData(lastPiiItems, manifestResult.tokens);
      }

      // Step 4: Redaction
      const redactStart = performance.now();
      let redactionResult = null;
      try {
        if (redactionWorker) {
          redactionResult = await runRedaction(screenshotData, {
            faces: lastFaces,
            piiItems: lastPiiItems
          }, window.devicePixelRatio || 1);
        } else if (window.Redactor) {
          // Fallback to main-thread redaction if worker isn't available
          redactionResult = await window.Redactor.redactFrame(captureCanvas, {
            faces: lastFaces,
            piiItems: lastPiiItems
          });
        }
      } catch (redactError) {
        console.warn('[PrivacyShield] Redaction failed, continuing without:', redactError);
      }
      metrics.redactTime = Math.round(performance.now() - redactStart);

      // Null-safe fallback for redactionResult
      const safeRedactionResult = redactionResult || {
        redactedBase64: null,
        structuralDescription: { redactions: [], summary: '0 faces and 0 PII items were redacted' }
      };
      
      if (safeRedactionResult.redactedBase64) {
        lastRedactedBase64 = safeRedactionResult.redactedBase64;
      }

      // Step 5: Draw overlay on page
      drawOverlay(lastFaces, lastPiiItems);

      // Step 6: Update floating badge
      updateBadge(lastFaces.length + lastPiiItems.length);

      // Calculate total time
      metrics.totalTime = Math.round(performance.now() - cycleStart);

      // Build combined detection result
      const detectionResult = {
        timestamp: Date.now(),
        url: window.location.href,
        pageTitle: document.title,
        faces: lastFaces,
        piiItems: lastPiiItems,
        pageStructure: {
          url: window.location.href,
          title: document.title,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          elementCount: lastDomElements.length,
          elements: lastDomElements.slice(0, 50), // top 50 for side panel
          summary: lastDomSummary
        },
        redactions: safeRedactionResult.structuralDescription,
        metrics: { ...metrics },
        modelStatus: latestDetectionStatus,
        ocrStatus: latestOcrStatus,
        originalScreenshot: screenshotData.substring(0, 100) + '...', // thumbnail reference
        redactedScreenshot: lastRedactedBase64 ? lastRedactedBase64.substring(0, 100) + '...' : null,
        // Send full images only to side panel
        _originalFull: screenshotData,
        _redactedFull: lastRedactedBase64
      };

      // Send to side panel via background
      chrome.runtime.sendMessage({
        type: 'detection_update',
        data: detectionResult
      }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

      // Send stats to popup
      chrome.runtime.sendMessage({
        type: 'stats_update',
        data: {
          detected: lastFaces.length + lastPiiItems.length,
          protected: safeRedactionResult.structuralDescription.redactions.length,
          latency: metrics.totalTime
        }
      }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

      // Step 7: Send to server (redacted data only!)
      const payload = {
        redacted_screenshot: lastRedactedBase64,
        page_structure: {
          url: window.location.href,
          title: document.title,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          elements: lastDomElements.slice(0, 100),
          summary: lastDomSummary
        },
        redaction_manifest: manifestResult,
        redactions: safeRedactionResult.structuralDescription.redactions,
        url: window.location.href,
        title: document.title,
        task: currentTask || 'Help the user navigate this page',
        metrics: {
          faces_detected: lastFaces.length,
          pii_items_found: lastPiiItems.length,
          processing_time_ms: metrics.totalTime
        }
      };

      if (serverConnected && lastRedactedBase64 && !isAgentPaused) {
        const serverStart = performance.now();
        sendToServer(payload);
        metrics.serverTime = Math.round(performance.now() - serverStart);
      } else if (!serverConnected && lastRedactedBase64 && !isAgentPaused) {
        offlineQueue.push(payload);
        if (offlineQueue.length > 5) offlineQueue.shift();
      }

      // Console logging
      console.log(
        `[PrivacyShield] Cycle #${cycleCount} complete: ` +
        `${lastFaces.length} faces, ${lastPiiItems.length} PII items, ` +
        `total: ${metrics.totalTime}ms ` +
        `(cap:${metrics.captureTime} det:${metrics.detectionTime} ` +
        `ocr:${metrics.ocrTime} pii:${metrics.piiScanTime} ` +
        `red:${metrics.redactTime}ms)`
      );

    } catch (error) {
      console.error('[PrivacyShield] Capture loop error:', error);
    }
  }

  // ================================================================
  //  SCREEN CAPTURE
  // ================================================================

  function requestScreenCapture() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'capture_screen' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[PrivacyShield] Capture error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (response && response.success) {
          resolve(response.dataUrl);
        } else {
          resolve(null);
        }
      });
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ================================================================
  //  FACE DETECTION (Web Worker)
  // ================================================================

  async function createWorkerFromExtension(url) {
    try {
      const response = await fetch(url);
      let text = await response.text();
      const extUrl = chrome.runtime.getURL('');
      text = `const __ext_url__ = '${extUrl}';\n` + text;
      const blob = new Blob([text], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    } catch (e) {
      console.error('[PrivacyShield] Failed to create worker:', url, e);
      return null;
    }
  }

  async function initWorkers() {
    try {
      // Detection worker
      const detWorkerUrl = chrome.runtime.getURL('workers/detection-worker.js');
      detectionWorker = await createWorkerFromExtension(detWorkerUrl);
      if (detectionWorker) {
        detectionWorker.onmessage = handleDetectionWorkerMessage;
        detectionWorker.onerror = (e) => {
          console.error('[PrivacyShield] Detection worker error:', e.message);
        };
        detectionWorker.postMessage({ type: 'init' });
      }

      // OCR worker
      const ocrWorkerUrl = chrome.runtime.getURL('workers/ocr-worker.js');
      ocrWorker = await createWorkerFromExtension(ocrWorkerUrl);
      if (ocrWorker) {
        ocrWorker.onmessage = handleOCRWorkerMessage;
        ocrWorker.onerror = (e) => {
          console.error('[PrivacyShield] OCR worker error:', e.message);
        };
        ocrWorker.postMessage({ type: 'init' });
      }

      // Redaction worker
      const redactWorkerUrl = chrome.runtime.getURL('workers/redaction-worker.js');
      redactionWorker = await createWorkerFromExtension(redactWorkerUrl);
      if (redactionWorker) {
        redactionWorker.onmessage = handleRedactionWorkerMessage;
        redactionWorker.onerror = (e) => {
          console.error('[PrivacyShield] Redaction worker error:', e.message);
        };
      }

      console.log('[PrivacyShield] Workers initialized via Blob workaround');
    } catch (error) {
      console.error('[PrivacyShield] Worker initialization failed:', error);
    }
  }

  // Detection worker message handlers
  let detectionResolve = null;
  function handleDetectionWorkerMessage(e) {
    const msg = e.data;
    if (msg.type === 'model_status') {
      latestDetectionStatus = msg;
      console.log(`[PrivacyShield] Detection model: ${msg.status} (${msg.progress}%)`);
      chrome.runtime.sendMessage({
        type: 'detection_update',
        data: { modelStatus: msg }
      }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
    }
    if (msg.type === 'detection_result') {
      if (detectionResolve) {
        detectionResolve(msg.faces || []);
        detectionResolve = null;
      }
    }
  }

  function runFaceDetection(screenshotBase64) {
    return new Promise((resolve) => {
      detectionResolve = resolve;
      detectionWorker.postMessage({
        type: 'detect',
        image: screenshotBase64
      });
      // Timeout after 5 seconds
      setTimeout(() => {
        if (detectionResolve) {
          detectionResolve([]);
          detectionResolve = null;
        }
      }, 5000);
    }).then(faces => {
      if (faces && faces.length > 0) {
        const dpr = window.devicePixelRatio || 1;
        faces.forEach(f => {
          f.x = f.x / dpr;
          f.y = f.y / dpr;
          f.width = f.width / dpr;
          f.height = f.height / dpr;
        });
        const positions = faces.map(f => `[${Math.round(f.x)}, ${Math.round(f.y)}, ${Math.round(f.width)}, ${Math.round(f.height)}]`);
        console.log(`Detected ${faces.length} faces at positions ${positions.join(', ')}`);
      }
      return faces;
    });
  }

  // OCR worker message handlers
  let ocrResolve = null;
  function handleOCRWorkerMessage(e) {
    const msg = e.data;
    if (msg.type === 'ocr_status') {
      latestOcrStatus = msg;
      console.log(`[PrivacyShield] OCR model: ${msg.status} (${msg.progress}%)`);
      chrome.runtime.sendMessage({
        type: 'detection_update',
        data: { ocrStatus: msg }
      }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
    }
    if (msg.type === 'ocr_result') {
      if (ocrResolve) {
        ocrResolve(msg);
        ocrResolve = null;
      }
    }
  }

  function runOCR(screenshotBase64) {
    return new Promise((resolve) => {
      ocrResolve = resolve;
      ocrWorker.postMessage({
        type: 'process',
        image: screenshotBase64
      });
      // Timeout after 600ms to keep capture cycle under 150ms
      setTimeout(() => {
        if (ocrResolve) {
          ocrResolve({ text: '', words: [], processingTime: 600 });
          ocrResolve = null;
        }
      }, 600);
    });
  }

  // ================================================================
  //  DOM READER (moved to utils/dom-reader.js)
  // ================================================================

  // ================================================================
  //  PII DETECTOR (moved to utils/pii-detector.js)
  // ================================================================

  // ================================================================
  //  REDACTION ENGINE (Web Worker)
  // ================================================================

  let redactionResolve = null;
  function handleRedactionWorkerMessage(e) {
    const msg = e.data;
    if (msg.type === 'redact_result' || msg.type === 'redact_error') {
      if (redactionResolve) {
        redactionResolve(msg.result || null);
        redactionResolve = null;
      }
    }
  }

  function runRedaction(screenshotBase64, detections, dpr) {
    return new Promise((resolve) => {
      redactionResolve = resolve;
      redactionWorker.postMessage({
        type: 'redact',
        image: screenshotBase64,
        detections: detections,
        dpr: dpr
      });
      setTimeout(() => {
        if (redactionResolve) {
          redactionResolve(null);
          redactionResolve = null;
        }
      }, 5000);
    });
  }

  // ================================================================
  //  OVERLAY (detection boxes on the webpage)
  // ================================================================

  function createOverlay() {
    if (overlayCanvas) return;
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'privacyshield-overlay';
    overlayCanvas.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 999999; pointer-events: none;
      background: transparent;
      display: ${overlayVisible ? 'block' : 'none'};
    `;
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
    overlayCtx = overlayCanvas.getContext('2d');
    document.body.appendChild(overlayCanvas);

    // Resize handler
    window.addEventListener('resize', () => {
      if (overlayCanvas) {
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;
      }
    });
  }

  function scanDomFaces() {
    const domFaces = [];
    const selectors = [
      'img.profile-image', 'img.member-image', '#profileImage', '#familyImage',
      'img[alt*="Profile" i]', 'img[alt*="Family" i]', 'img[alt*="Photo" i]', 'img[alt*="Avatar" i]'
    ];
    try {
      document.querySelectorAll(selectors.join(',')).forEach((img) => {
        const rect = img.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < window.innerHeight) {
          domFaces.push({
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            confidence: 0.95,
            label: 'face',
            elementId: img.id || null
          });
        }
      });
    } catch (e) {}
    return domFaces;
  }

  function liveScrollHandler() {
    if (overlayVisible && (lastFaces.length > 0 || lastPiiItems.length > 0)) {
      requestAnimationFrame(() => drawOverlay(lastFaces, lastPiiItems));
    }
  }

  function drawOverlay(faces, piiItems) {
    if (!overlayCtx || !overlayVisible || !overlayCanvas) return;

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Draw face detection boxes
    (faces || []).forEach((face) => {
      let { x, y, width, height, confidence, elementId } = face;

      if (elementId) {
        const el = document.getElementById(elementId);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.bottom <= 0 || r.top >= window.innerHeight) return;
          x = r.x; y = r.y; width = r.width; height = r.height;
        }
      }

      if (x === undefined || y === undefined || width <= 0 || height <= 0) return;
      if (y + height < 0 || y > window.innerHeight) return;

      // Pulsing red border
      overlayCtx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
      overlayCtx.lineWidth = 2.5;
      overlayCtx.setLineDash([6, 3]);
      overlayCtx.strokeRect(x, y, width, height);
      overlayCtx.setLineDash([]);

      // Semi-transparent fill
      overlayCtx.fillStyle = 'rgba(244, 63, 94, 0.15)';
      overlayCtx.fillRect(x, y, width, height);

      // Label
      const label = `Face ${Math.round((confidence || 0.9) * 100)}%`;
      overlayCtx.fillStyle = 'rgba(244, 63, 94, 0.9)';
      const labelWidth = overlayCtx.measureText(label).width + 12;
      overlayCtx.fillRect(x, Math.max(0, y - 20), labelWidth, 18);
      overlayCtx.fillStyle = '#ffffff';
      overlayCtx.font = 'bold 11px Inter, sans-serif';
      overlayCtx.fillText(label, x + 6, Math.max(14, y - 6));
    });

    // Draw PII indicator boxes
    (piiItems || []).forEach((pii) => {
      let x = pii.position?.x;
      let y = pii.position?.y;
      let width = pii.position?.width;
      let height = pii.position?.height;

      if (pii.elementId) {
        const el = document.getElementById(pii.elementId);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.bottom <= 0 || r.top >= window.innerHeight) return;
          x = r.x; y = r.y; width = r.width; height = r.height;
        }
      }

      if (x === undefined || y === undefined || width <= 0 || height <= 0) return;
      if (y + height < 0 || y > window.innerHeight) return;

      const color = pii.severity === 'high' ? '#f43f5e' :
                    pii.severity === 'medium' ? '#f59e0b' : '#22c55e';

      overlayCtx.strokeStyle = color;
      overlayCtx.lineWidth = 2;
      overlayCtx.strokeRect(x, y, width, height);

      // Small label with background
      const piiLabel = pii.label || 'PII';
      overlayCtx.font = 'bold 9px Inter, sans-serif';
      const labelWidth = overlayCtx.measureText(piiLabel).width + 6;
      overlayCtx.fillStyle = color;
      overlayCtx.fillRect(x, Math.max(0, y - 14), labelWidth, 14);
      overlayCtx.fillStyle = '#ffffff';
      overlayCtx.fillText(piiLabel, x + 3, Math.max(10, y - 4));
    });
  }

  // ================================================================
  //  FLOATING BADGE
  // ================================================================

  function createFloatingBadge() {
    if (floatingBadge) return;

    floatingBadge = document.createElement('div');
    floatingBadge.id = 'privacyshield-badge';
    floatingBadge.innerHTML = '🛡️ <span id="ps-badge-count">0</span> items protected';
    floatingBadge.style.cssText = `
      position: fixed; bottom: 20px; left: 20px;
      background: linear-gradient(135deg, #0a0a1a, #1a1a3e);
      color: #22c55e; font-family: Inter, sans-serif; font-size: 13px;
      font-weight: 600; padding: 10px 16px; border-radius: 24px;
      z-index: 999998; cursor: pointer; user-select: none;
      border: 1px solid rgba(34, 197, 94, 0.3);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(34, 197, 94, 0.15);
      transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;
      animation: ps-badge-pulse 2s ease-in-out infinite;
    `;

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes ps-badge-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(34,197,94,0.15); }
        50% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 30px rgba(34,197,94,0.4); }
      }
    `;
    document.head.appendChild(style);

    floatingBadge.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'open_side_panel' });
    });

    document.body.appendChild(floatingBadge);
  }

  function updateBadge(count) {
    const countEl = document.getElementById('ps-badge-count');
    if (countEl) countEl.textContent = count;
  }

  // ================================================================
  //  SERVER CONNECTION (WebSocket)
  // ================================================================

  function connectToServer() {
    try {
      serverSocket = new WebSocket('ws://localhost:8000/ws/agent');

      serverSocket.onopen = () => {
        serverConnected = true;
        reconnectDelay = 1000;
        console.log('[PrivacyShield] Server connected ✅');
        chrome.runtime.sendMessage({
          type: 'detection_update',
          data: { serverStatus: 'connected' }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

        // Flush offline queue
        if (offlineQueue.length > 0) {
          console.log(`[PrivacyShield] Flushing ${offlineQueue.length} queued frames to server...`);
          const mostRecent = offlineQueue[offlineQueue.length - 1];
          sendToServer(mostRecent);
          offlineQueue = [];
        }
      };

      serverSocket.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          handleServerResponse(response);
        } catch (e) {
          console.error('[PrivacyShield] Invalid server response:', e);
        }
      };

      serverSocket.onclose = () => {
        serverConnected = false;
        console.log('[PrivacyShield] Server disconnected');
        chrome.runtime.sendMessage({
          type: 'detection_update',
          data: { serverStatus: 'disconnected' }
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

        playSound('warning');
        chrome.runtime.sendMessage({ 
             type: 'show_notification', 
             title: '⚠️ PrivacyShield',
             message: 'Server disconnected. Local protection continues.'
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

        // Auto-reconnect with exponential backoff
        if (isEnabled) {
          reconnectTimeout = setTimeout(() => {
            console.log(`[PrivacyShield] Reconnecting in ${reconnectDelay}ms...`);
            connectToServer();
          }, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }
      };

      serverSocket.onerror = (error) => {
        console.warn('[PrivacyShield] WebSocket error (server may not be running)');
      };

    } catch (error) {
      console.warn('[PrivacyShield] Server connection failed:', error.message);
    }
  }

  function sendToServer(data) {
    if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(JSON.stringify(data));
    }
  }

  function handleServerResponse(response) {
    if (isAgentPaused) return;

    console.log('[PrivacyShield] Server action:', response);

    // Send to side panel for display
    chrome.runtime.sendMessage({
      type: 'detection_update',
      data: {
        serverAction: response,
        serverStatus: 'connected'
      }
    }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

    // Execute the action with AgentController
    if (response.action && window.AgentController) {
       window.AgentController.executeAction(response.action).then((result) => {
         console.log(`[PrivacyShield] Action result:`, result);
         // Send verification back to LangGraph server
         sendToServer({
           action_result: {
             type: response.action.type,
             target: response.action.target,
             success: result ? result.success : false
           }
         });
       }).catch(err => {
         console.error('[PrivacyShield] Action execution failed:', err);
         sendToServer({
           action_result: {
             type: response.action.type,
             target: response.action.target,
             success: false
           }
         });
       });
    }
  }



  // ================================================================
  //  SOUND EFFECTS (Web Audio API)
  // ================================================================

  function playSound(type) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new AudioContext();

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

      if (type === 'click') {
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.type = 'sine';
      } else if (type === 'shield') {
        oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        oscillator.type = 'sine';
      } else if (type === 'success') {
        oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.15);
        oscillator.type = 'triangle';
      } else if (type === 'warning') {
        oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
        oscillator.type = 'sawtooth';
      }

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // Audio not available — silent fail
    }
  }

})();
