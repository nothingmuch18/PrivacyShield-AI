/* ================================================================
   PrivacyShield AI — OCR Web Worker
   Attempts to load Tesseract.js, falls back gracefully if blocked
   by Chrome Extension MV3 CSP (no external script loading allowed)
   ================================================================ */

let tesseractWorker = null;
let ocrReady = false;
let ocrLoading = false;
let ocrAvailable = false; // Whether Tesseract actually loaded

function sendStatus(status, progress = 0) {
  self.postMessage({ type: 'ocr_status', status, progress });
}

async function initOCR() {
  if (ocrLoading || ocrReady) return;
  ocrLoading = true;
  sendStatus('loading', 10);

  // Load Tesseract.js using the injected extension URL
  try {
    if (typeof __ext_url__ !== 'undefined') {
      importScripts(__ext_url__ + 'workers/libs/tesseract.min.js');
    } else {
      throw new Error('__ext_url__ is not defined. Worker must be spawned with extension URL context.');
    }
  } catch (cspError) {
    console.warn('[OCRWorker] Cannot load Tesseract.js:', cspError.message);
    ocrAvailable = false;
    ocrReady = true;
    ocrLoading = false;
    sendStatus('ready', 100);
    return;
  }

  // If importScripts succeeded, initialize Tesseract
  try {
    console.log('[OCRWorker] Tesseract.js loaded, initializing...');
    sendStatus('loading', 30);

    tesseractWorker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.progress) {
          sendStatus('loading', 30 + Math.round(m.progress * 70));
        }
      },
      workerPath: __ext_url__ + 'workers/libs/worker.min.js',
      corePath: __ext_url__ + 'workers/libs/tesseract-core.wasm.js',
      langPath: __ext_url__ + 'workers/libs',
      cachePath: __ext_url__ + 'workers/libs',
    });

    ocrAvailable = true;
    ocrReady = true;
    ocrLoading = false;
    sendStatus('ready', 100);
    console.log('[OCRWorker] Tesseract.js ready ✅');

  } catch (error) {
    console.error('[OCRWorker] Tesseract init failed:', error);
    ocrAvailable = false;
    ocrReady = true;
    ocrLoading = false;
    // Still report ready — DOM-based PII detection works without OCR
    sendStatus('ready', 100);
  }
}

async function runOCR(imageBase64) {
  // If Tesseract isn't available, return empty results gracefully
  // The PII detector in content.js still scans DOM elements independently
  if (!ocrAvailable || !tesseractWorker) {
    return { text: '', words: [], processingTime: 0 };
  }

  if (!ocrReady) {
    if (!ocrLoading) await initOCR();
    if (!ocrAvailable) return { text: '', words: [], processingTime: 0 };
  }

  try {
    const startTime = performance.now();

    const result = await tesseractWorker.recognize(imageBase64);

    const processingTime = Math.round(performance.now() - startTime);

    // Extract words with bounding boxes
    const words = (result.data.words || []).map(w => ({
      text: w.text,
      bbox: {
        x0: w.bbox.x0,
        y0: w.bbox.y0,
        x1: w.bbox.x1,
        y1: w.bbox.y1
      },
      confidence: Math.round(w.confidence)
    }));

    const fullText = result.data.text || '';

    console.log(`[OCRWorker] Extracted ${words.length} words in ${processingTime}ms`);

    return {
      text: fullText,
      words: words,
      processingTime: processingTime
    };

  } catch (error) {
    console.error('[OCRWorker] OCR error:', error);
    return { text: '', words: [], processingTime: 0 };
  }
}

// Message handler
self.onmessage = async function (e) {
  const msg = e.data;

  if (msg.type === 'init') {
    await initOCR();
  }

  if (msg.type === 'process') {
    if (!ocrReady && !ocrLoading) {
      await initOCR();
    }

    const result = await runOCR(msg.image);

    self.postMessage({
      type: 'ocr_result',
      text: result.text,
      words: result.words,
      processingTime: result.processingTime,
      timestamp: Date.now()
    });
  }
};
