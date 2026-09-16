/* ================================================================
   PrivacyShield AI — Agent Controller
   The intelligent brain on the client side.
   Handles task planning, smart element finding, action execution
   with verification, token substitution, and anti-loop protection.
   ================================================================ */

window.AgentController = (function () {
  'use strict';

  // ================================================================
  //  CONSTANTS
  // ================================================================
  const STATES = {
    IDLE: 'IDLE',
    PLANNING: 'PLANNING',
    EXECUTING: 'EXECUTING',
    WAITING: 'WAITING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR'
  };

  const MAX_ACTIONS = 50;
  const MAX_RETRIES = 1;
  const LOOP_THRESHOLD = 3;
  const TYPE_DELAY_MS = 40;
  const ACTION_PREVIEW_MS = 2000;

  // ================================================================
  //  STATE
  // ================================================================
  let state = STATES.IDLE;
  let currentTask = null;
  let serverUrl = 'http://localhost:8000';
  let plan = null;
  let currentStepIndex = 0;
  let actionHistory = [];
  let totalActionsExecuted = 0;
  let taskStartTime = 0;
  let latestPiiData = [];        // Set externally by content.js
  let latestManifestTokens = {}; // Token → PII value reverse map

  // Event listeners
  const listeners = {};

  // ================================================================
  //  EVENT SYSTEM (pub/sub)
  // ================================================================

  function emit(event, data) {
    console.log(`[AgentController] Event: ${event}`, data);
    if (listeners[event]) {
      listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`[AgentController] Listener error:`, e); }
      });
    }
  }

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  function off(event, callback) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(cb => cb !== callback);
  }

  // ================================================================
  //  STATE MACHINE
  // ================================================================

  function setState(newState) {
    const prev = state;
    state = newState;
    console.log(`[AgentController] State: ${prev} → ${newState}`);
    emit('agent:state-changed', { from: prev, to: newState });
  }

  function getState() { return state; }

  function getProgress() {
    if (!plan) return { step: 0, total: 0, percent: 0, description: '' };
    const total = plan.steps ? plan.steps.length : 0;
    const step = Math.min(currentStepIndex + 1, total);
    return {
      step,
      total,
      percent: total > 0 ? Math.round((step / total) * 100) : 0,
      description: plan.steps && plan.steps[currentStepIndex]
        ? plan.steps[currentStepIndex].description || ''
        : ''
    };
  }

  function getActionHistory() {
    return [...actionHistory];
  }

  // ================================================================
  //  TASK PLANNING
  // ================================================================

  async function startTask(task, url) {
    if (state === STATES.EXECUTING || state === STATES.PLANNING) {
      console.warn('[AgentController] Already running a task. Stop first.');
      return;
    }

    currentTask = task;
    if (url) serverUrl = url;
    currentStepIndex = 0;
    actionHistory = [];
    totalActionsExecuted = 0;
    taskStartTime = performance.now();
    plan = null;

    console.log(`[AgentController] Starting task: "${task}"`);
    setState(STATES.PLANNING);

    try {
      // Request a plan from the server
      const resp = await fetch(`${serverUrl}/api/task-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: task,
          page_structure: getDOMSnapshot(),
          url: window.location.href,
          title: document.title
        })
      });

      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }

      plan = await resp.json();
      console.log(`[AgentController] Plan received: ${plan.steps ? plan.steps.length : 0} steps`);
      emit('agent:plan-received', { plan, totalSteps: plan.steps ? plan.steps.length : 0 });

      // Start executing
      setState(STATES.WAITING);
      await executeNextStep();

    } catch (err) {
      console.error('[AgentController] Planning failed:', err);
      // Fallback: create a simple single-step plan
      plan = {
        task: task,
        steps: [{ step: 1, action: 'wait', description: 'Server unavailable — waiting for manual commands' }],
        estimated_actions: 1,
        complexity: 'unknown'
      };
      emit('agent:plan-received', { plan, totalSteps: 1 });
      setState(STATES.WAITING);
    }
  }

  async function executeNextStep() {
    if (state === STATES.PAUSED) return;
    if (state === STATES.COMPLETED || state === STATES.ERROR) return;

    if (!plan || !plan.steps || currentStepIndex >= plan.steps.length) {
      // All steps done
      const totalTime = Math.round(performance.now() - taskStartTime);
      setState(STATES.COMPLETED);
      emit('agent:task-completed', {
        totalSteps: plan ? plan.steps.length : 0,
        totalTime,
        success: true,
        actionsExecuted: totalActionsExecuted
      });
      return;
    }

    if (totalActionsExecuted >= MAX_ACTIONS) {
      setState(STATES.ERROR);
      emit('agent:error', { message: `Maximum actions (${MAX_ACTIONS}) reached. Stopping to prevent infinite loop.`, step: currentStepIndex });
      return;
    }

    const step = plan.steps[currentStepIndex];
    console.log(`[AgentController] Step ${currentStepIndex + 1}/${plan.steps.length}: ${step.description || step.action}`);
    emit('agent:step-started', { stepIndex: currentStepIndex, step, description: step.description || '' });

    const stepStart = performance.now();

    try {
      const action = {
        type: step.action || 'wait',
        target: step.target || null,
        value: step.value || null,
        position: step.position || null,
        reasoning: step.description || ''
      };

      const result = await executeAction(action);

      const duration = Math.round(performance.now() - stepStart);
      emit('agent:step-completed', { stepIndex: currentStepIndex, step, success: result.success, duration });

      currentStepIndex++;
      totalActionsExecuted++;

      // Small delay between steps for visual feedback
      await sleep(500);

      // Execute next step
      if (state !== STATES.PAUSED) {
        await executeNextStep();
      }

    } catch (err) {
      console.error(`[AgentController] Step ${currentStepIndex + 1} failed:`, err);
      emit('agent:step-completed', { stepIndex: currentStepIndex, step, success: false, duration: 0 });
      // Move to next step on failure
      currentStepIndex++;
      totalActionsExecuted++;
      if (state !== STATES.PAUSED) {
        await executeNextStep();
      }
    }
  }

  function getDOMSnapshot() {
    try {
      if (window.DOMReader) return window.DOMReader.readDOM();
    } catch (e) {}
    return { url: window.location.href, title: document.title, elements: [], summary: '' };
  }

  // ================================================================
  //  SMART ELEMENT FINDER
  // ================================================================

  function findElement(selector, position) {
    if (!selector && !position) return { element: null, strategy: 'none', confidence: 0 };

    const strategies = [];

    if (selector) {
      // a) Exact ID
      strategies.push({
        name: 'id',
        fn: () => document.getElementById(selector),
        confidence: 1.0
      });

      // b) CSS selector
      strategies.push({
        name: 'css-selector',
        fn: () => { try { return document.querySelector(selector); } catch (e) { return null; } },
        confidence: 0.95
      });

      // c) Aria-label
      strategies.push({
        name: 'aria-label',
        fn: () => {
          try {
            return document.querySelector(`[aria-label="${selector}"]`) ||
                   document.querySelector(`[aria-label*="${selector}" i]`);
          } catch (e) { return null; }
        },
        confidence: 0.85
      });

      // d) Visible text content (buttons, links)
      strategies.push({
        name: 'text-content',
        fn: () => {
          const searchText = selector.toLowerCase().trim();
          const candidates = document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]');
          for (const el of candidates) {
            const text = (el.textContent || el.value || '').toLowerCase().trim();
            if (text === searchText || text.includes(searchText)) {
              return el;
            }
          }
          return null;
        },
        confidence: 0.8
      });

      // e) Input name or placeholder
      strategies.push({
        name: 'input-name-placeholder',
        fn: () => {
          const searchText = selector.toLowerCase().trim();
          const inputs = document.querySelectorAll('input, textarea, select');
          for (const el of inputs) {
            const name = (el.name || '').toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const label = (el.getAttribute('aria-label') || '').toLowerCase();
            if (name.includes(searchText) || placeholder.includes(searchText) || label.includes(searchText)) {
              return el;
            }
          }
          // Also try matching by associated label text
          const labels = document.querySelectorAll('label');
          for (const lbl of labels) {
            if ((lbl.textContent || '').toLowerCase().includes(searchText)) {
              const forId = lbl.getAttribute('for');
              if (forId) return document.getElementById(forId);
              const input = lbl.querySelector('input, textarea, select');
              if (input) return input;
            }
          }
          return null;
        },
        confidence: 0.75
      });

      // g) Fuzzy text match (broader search)
      strategies.push({
        name: 'fuzzy-text',
        fn: () => {
          const searchText = selector.toLowerCase().trim();
          const allEls = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [onclick]');
          let bestMatch = null;
          let bestScore = 0;
          for (const el of allEls) {
            const text = (el.textContent || el.value || el.placeholder || el.name || '').toLowerCase();
            if (!text) continue;
            // Simple substring score
            if (text.includes(searchText) || searchText.includes(text)) {
              const score = Math.min(searchText.length, text.length) / Math.max(searchText.length, text.length);
              if (score > bestScore && isVisible(el)) {
                bestScore = score;
                bestMatch = el;
              }
            }
          }
          return bestScore > 0.3 ? bestMatch : null;
        },
        confidence: 0.5
      });
    }

    // f) Position-based (always available as last resort)
    if (position && position.x !== undefined && position.y !== undefined) {
      strategies.push({
        name: 'position',
        fn: () => document.elementFromPoint(position.x, position.y),
        confidence: 0.6
      });
    }

    // Try each strategy in order
    for (const strat of strategies) {
      try {
        const el = strat.fn();
        if (el && isVisible(el)) {
          console.log(`[AgentController] Found element via "${strat.name}" (confidence: ${strat.confidence})`);
          return { element: el, strategy: strat.name, confidence: strat.confidence };
        }
      } catch (e) {
        // Skip failed strategy
      }
    }

    console.warn(`[AgentController] Element not found: "${selector}"`);
    return { element: null, strategy: 'none', confidence: 0 };
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // ================================================================
  //  TOKEN SUBSTITUTION
  // ================================================================

  function updatePiiData(piiItems, manifestTokens) {
    latestPiiData = piiItems || [];
    latestManifestTokens = manifestTokens || {};
  }

  function substituteTokens(value) {
    if (!value || typeof value !== 'string') return value;

    // Match tokens like [NAME_1], [EMAIL_1], [AADHAAR_1], [PHONE_1], etc.
    const tokenPattern = /\[([A-Z_]+_\d+)\]/g;
    let substituted = value;

    substituted = substituted.replace(tokenPattern, (match, tokenName) => {
      // Search in PII data for matching type
      const tokenType = tokenName.replace(/_\d+$/, '').toLowerCase();
      const tokenIndex = parseInt(tokenName.match(/_(\d+)$/)?.[1] || '1') - 1;

      // Find PII items of this type
      const matchingItems = latestPiiData.filter(item => {
        const itemType = (item.type || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
        return itemType === tokenName.replace(/_\d+$/, '') ||
               (item.type || '').toLowerCase() === tokenType;
      });

      if (matchingItems[tokenIndex] && matchingItems[tokenIndex].value) {
        console.log(`[AgentController] Token ${match} → substituted locally (value hidden from logs for privacy)`);
        return matchingItems[tokenIndex].value;
      }

      // If no match found, return the token as-is
      console.warn(`[AgentController] Token ${match} — no local PII data found, keeping token`);
      return match;
    });

    return substituted;
  }

  // ================================================================
  //  ANTI-LOOP PROTECTION
  // ================================================================

  function isLooping(action) {
    if (actionHistory.length < LOOP_THRESHOLD) return false;

    const key = `${action.type}:${action.target || ''}`;
    const recent = actionHistory.slice(-LOOP_THRESHOLD);
    const allSame = recent.every(h => `${h.type}:${h.target || ''}` === key);

    if (allSame) {
      console.warn(`[AgentController] Loop detected: "${key}" repeated ${LOOP_THRESHOLD} times`);
      return true;
    }
    return false;
  }

  // ================================================================
  //  ACTION EXECUTOR
  // ================================================================

  async function executeAction(action) {
    if (!action || !action.type) {
      return { success: false, reason: 'No action provided' };
    }

    // Anti-loop check
    if (isLooping(action)) {
      emit('agent:error', { message: `Loop detected for action "${action.type}" on "${action.target}". Skipping.` });
      return { success: false, reason: 'Loop detected' };
    }

    // Substitute tokens in values
    if (action.value) {
      action.value = substituteTokens(action.value);
    }

    setState(STATES.EXECUTING);
    emit('agent:action-executing', { action, target: action.target });

    console.log(`[AgentController] Executing: ${action.type} → "${action.target || ''}" ${action.value ? '(has value)' : ''}`);

    let result;
    try {
      switch (action.type) {
        case 'click':
          result = await doClick(action);
          break;
        case 'type':
          result = await doType(action);
          break;
        case 'scroll':
          result = await doScroll(action);
          break;
        case 'select':
          result = await doSelect(action);
          break;
        case 'navigate':
          result = await doNavigate(action);
          break;
        case 'open_tab':
          result = await doOpenTab(action);
          break;
        case 'hover':
          result = await doHover(action);
          break;
        case 'focus':
          result = await doFocus(action);
          break;
        case 'scrape_table':
        case 'extract_data':
          result = await doScrapeTable(action);
          break;
        case 'extract_pdf':
        case 'download_and_analyze':
          result = await doExtractPdf(action);
          break;
        case 'export_csv':
          result = await doExportCsv(action);
          break;
        case 'wait':
          await sleep(parseInt(action.value) || 1000);
          result = { success: true };
          break;
        case 'done':
          result = { success: true };
          break;
        default:
          console.warn(`[AgentController] Unknown action: ${action.type}`);
          result = { success: false, reason: `Unknown action: ${action.type}` };
      }
    } catch (err) {
      console.error(`[AgentController] Action "${action.type}" threw:`, err);
      result = { success: false, reason: err.message };
    }

    // Record in history
    actionHistory.push({
      type: action.type,
      target: action.target,
      success: result.success,
      timestamp: Date.now(),
      strategy: result.strategy || 'unknown'
    });
    if (actionHistory.length > 20) actionHistory.shift();

    setState(STATES.WAITING);
    return result;
  }

  // --- Click ---
  async function doClick(action) {
    const found = findElement(action.target, action.position);
    if (!found.element) {
      return { success: false, reason: `Element not found: "${action.target}"`, strategy: found.strategy };
    }

    const el = found.element;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    // Green highlight
    const origOutline = el.style.outline;
    const origOutlineOffset = el.style.outlineOffset;
    el.style.outline = '3px solid #22c55e';
    el.style.outlineOffset = '2px';
    await sleep(300);

    // Store page state before click
    const urlBefore = window.location.href;

    el.click();
    // Also dispatch mouse events for frameworks that listen for them
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Restore outline
    setTimeout(() => {
      el.style.outline = origOutline;
      el.style.outlineOffset = origOutlineOffset;
    }, 500);

    await sleep(300);

    // Verify: did anything change?
    const urlChanged = window.location.href !== urlBefore;
    console.log(`[AgentController] Click executed. URL changed: ${urlChanged}`);

    return { success: true, strategy: found.strategy, urlChanged };
  }

  // --- Type ---
  async function doType(action) {
    const found = findElement(action.target, action.position);
    if (!found.element) {
      return { success: false, reason: `Input not found: "${action.target}"`, strategy: found.strategy };
    }

    const el = found.element;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    el.focus();

    // Highlight
    const origOutline = el.style.outline;
    el.style.outline = '3px solid #6366f1';

    // Clear existing value
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Substitute PII tokens with actual values
    let textToType = action.value || '';
    
    // Check if the text contains any tokens like [AADHAAR_1]
    const tokenRegex = /\[[A-Z0-9_]+\]/g;
    textToType = textToType.replace(tokenRegex, (match) => {
      // Look up the actual value in our local manifest
      // Need to find the token key that corresponds to this value
      for (const [key, tokenObj] of Object.entries(latestManifestTokens)) {
        if (tokenObj.token === match) {
          console.log(`[AgentController] Substituted token ${match} with actual PII value.`);
          return tokenObj.originalValue; // Inject the real value locally
        }
      }
      return match; // If not found, just use the token string
    });

    // Type character by character
    for (let i = 0; i < textToType.length; i++) {
      el.value += textToType[i];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: textToType[i], bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: textToType[i], bubbles: true }));
      await sleep(TYPE_DELAY_MS);
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    // Restore outline
    setTimeout(() => { el.style.outline = origOutline; }, 500);

    // Verify
    const valueMatches = el.value === text;
    if (!valueMatches) {
      console.warn(`[AgentController] Type verification: expected "${text.substring(0, 10)}..." but got "${el.value.substring(0, 10)}..."`);
    }

    return { success: valueMatches, strategy: found.strategy, verified: valueMatches };
  }

  // --- Scroll ---
  async function doScroll(action) {
    const scrollBefore = window.scrollY;
    const amount = parseInt(action.value) || 300;

    window.scrollBy({ top: amount, behavior: 'smooth' });
    await sleep(500);

    const scrollAfter = window.scrollY;
    const didScroll = Math.abs(scrollAfter - scrollBefore) > 5;

    return { success: didScroll, scrolled: scrollAfter - scrollBefore };
  }

  // --- Select ---
  async function doSelect(action) {
    const found = findElement(action.target, action.position);
    if (!found.element) {
      return { success: false, reason: `Select not found: "${action.target}"` };
    }

    const el = found.element;
    if (action.value !== undefined) {
      // Try to find option by value or text
      let optionFound = false;
      for (const opt of el.options) {
        if (opt.value === action.value || opt.textContent.trim().toLowerCase() === action.value.toLowerCase()) {
          el.value = opt.value;
          optionFound = true;
          break;
        }
      }
      if (!optionFound) {
        el.selectedIndex = parseInt(action.value) || 0;
      }
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, strategy: found.strategy };
  }

  // --- Navigate ---
  async function doNavigate(action) {
    if (action.value) {
      window.location.href = action.value;
      return { success: true };
    }
    return { success: false, reason: 'No URL provided for navigation' };
  }

  // --- Open Tab ---
  async function doOpenTab(action) {
    if (action.value) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'open_tab', url: action.value },
          (response) => {
            if (response && response.success) {
              resolve({ success: true, tabId: response.tabId });
            } else {
              resolve({ success: false, reason: 'Failed to open tab' });
            }
          }
        );
      });
    }
    return { success: false, reason: 'No URL provided for open_tab' };
  }

  // --- Hover ---
  async function doHover(action) {
    const found = findElement(action.target, action.position);
    if (!found.element) {
      return { success: false, reason: `Element not found: "${action.target}"` };
    }

    const el = found.element;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    return { success: true, strategy: found.strategy };
  }

  // --- Focus ---
  async function doFocus(action) {
    const found = findElement(action.target, action.position);
    if (!found.element) {
      return { success: false, reason: `Element not found: "${action.target}"` };
    }

    const el = found.element;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    return { success: true, strategy: found.strategy };
  }

  // --- Scrape Table ---
  async function doScrapeTable(action) {
    console.log(`[AgentController] Scraping tables on page...`);
    if (!window.DOMReader || !window.DOMReader.scrapeTables) {
      return { success: false, reason: 'DOMReader.scrapeTables not available' };
    }

    const scraped = window.DOMReader.scrapeTables(action.target);
    if (!scraped.success || scraped.count === 0) {
      return { success: false, reason: 'No tables found on page' };
    }

    // Send to backend server for storage/caching
    try {
      const resp = await fetch(`${serverUrl}/api/data/scrape-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          title: document.title,
          tables: scraped.tables
        })
      });
      const data = await resp.json();
      console.log(`[AgentController] Scraped ${scraped.count} table(s). Server response:`, data);
      return { success: true, count: scraped.count, tables: scraped.tables, summary: data.summary };
    } catch (err) {
      console.warn(`[AgentController] Table scraped locally, server endpoint failed:`, err);
      return { success: true, count: scraped.count, tables: scraped.tables };
    }
  }

  // --- Extract PDF ---
  async function doExtractPdf(action) {
    let pdfUrl = action.value || action.target;
    if (!pdfUrl) {
      const found = findElement(action.target);
      if (found.element && found.element.href) {
        pdfUrl = found.element.href;
      }
    }

    if (!pdfUrl) {
      return { success: false, reason: 'No PDF URL specified or found' };
    }

    console.log(`[AgentController] Extracting PDF from: ${pdfUrl}`);

    try {
      const resp = await fetch(`${serverUrl}/api/data/extract-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pdfUrl })
      });

      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }

      const pdfData = await resp.json();
      console.log(`[AgentController] PDF Extracted successfully (${pdfData.pages_count} pages):`, pdfData.summary);
      return { success: true, pdfData };
    } catch (err) {
      console.error(`[AgentController] PDF extraction failed:`, err);
      return { success: false, reason: err.message };
    }
  }

  // --- Export CSV ---
  async function doExportCsv(action) {
    console.log(`[AgentController] Exporting collected data to CSV...`);
    try {
      const resp = await fetch(`${serverUrl}/api/data/export-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: action.value || 'scraped_data.csv' })
      });

      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = action.value || 'scraped_data.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      return { success: true, filename: action.value || 'scraped_data.csv' };
    } catch (err) {
      console.error(`[AgentController] CSV export failed:`, err);
      return { success: false, reason: err.message };
    }
  }

  // ================================================================
  //  CONTROL METHODS
  // ================================================================

  function pause() {
    if (state === STATES.EXECUTING || state === STATES.WAITING) {
      setState(STATES.PAUSED);
      console.log('[AgentController] Agent paused');
    }
  }

  function resume() {
    if (state === STATES.PAUSED) {
      setState(STATES.WAITING);
      console.log('[AgentController] Agent resumed');
      executeNextStep();
    }
  }

  function stop() {
    setState(STATES.IDLE);
    plan = null;
    currentStepIndex = 0;
    currentTask = null;
    console.log('[AgentController] Agent stopped');
  }

  // ================================================================
  //  UTILITY
  // ================================================================

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================================================================
  //  PUBLIC API
  // ================================================================

  return {
    // Task management
    startTask,
    executeAction,
    stop,
    pause,
    resume,

    // Element finding
    findElement,

    // State
    getState,
    getProgress,
    getActionHistory,
    STATES,

    // Events
    on,
    off,

    // PII / Token
    updatePiiData,
    substituteTokens,
  };
})();

console.log('[AgentController] Loaded ✅');
