/**
 * VisionLite AI v2 — Background Service Worker
 *
 * Orchestrates the entire pipeline:
 *  1. Captures the visible tab screenshot
 *  2. Manages the offscreen document lifecycle
 *  3. Routes screenshots to the offscreen doc for local ML + redaction
 *  4. Receives redacted results and relays stats to popup
 *  5. (Future) Sends sanitized data to FastAPI server for AI reasoning
 *  6. (Future) Routes action commands to the content script
 */

import type {
  StartPipelineMsg,
  StopPipelineMsg,
  ProcessScreenshotMsg,
  RedactionCompleteMsg,
  StatsUpdateMsg,
  PipelineStatusMsg,
  GetDOMMsg,
  ExecuteActionMsg,
  DOMSnapshot,
} from '../types/messages';
import { AgentController } from './agent-controller';
import { ActionValidator } from '../core/action-validator';
import { PolicyEngine } from '../services/PolicyEngine';

const actionValidator = new ActionValidator();
export const policyEngine = new PolicyEngine();
policyEngine.init();

// ════════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════════

let pipelineActive = false;
let currentTask: string | null = null;
let cycleCount = 0;
let pipelineIntervalId: ReturnType<typeof setInterval> | null = null;

const CYCLE_INTERVAL_MS = 6000; // Run pipeline every 6 seconds to allow AI reasoning
const pendingDOMSnapshots = new Map<number, DOMSnapshot>();
const agent = new AgentController();

console.log('[VisionLite] Background service worker loaded');

// ════════════════════════════════════════════════════════════════
//  OFFSCREEN DOCUMENT MANAGEMENT
// ════════════════════════════════════════════════════════════════

const OFFSCREEN_URL = 'offscreen/offscreen.html';

/**
 * Ensures the offscreen document exists. Creates it if missing.
 * Offscreen documents are needed because service workers can't access
 * the DOM or Canvas API — the offscreen doc runs our ML models.
 */
async function ensureOffscreenDocument(): Promise<void> {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  } catch {
    // hasDocument() might not exist in older Chrome — try creating directly
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS' as chrome.offscreen.Reason],
      justification: 'Run local ML models (YOLO, Tesseract, MediaPipe) for on-device PII detection and redaction',
    });
    console.log('[VisionLite] Offscreen document created');
  } catch (err: any) {
    // Document might already exist (race condition)
    if (!err.message?.includes('already exists')) {
      console.error('[VisionLite] Failed to create offscreen document:', err);
      throw err;
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  SCREEN CAPTURE
// ════════════════════════════════════════════════════════════════

/**
 * Captures the currently visible tab as a PNG base64 data URL.
 */
async function captureScreen(): Promise<string | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90,
    });
    return dataUrl;
  } catch (error: any) {
    console.error('[VisionLite] Screen capture failed:', error.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  PIPELINE LOOP
// ════════════════════════════════════════════════════════════════

/**
 * Runs one full pipeline cycle:
 *  Capture → Send to Offscreen → (await redaction result)
 */
async function runPipelineCycle(): Promise<void> {
  if (!pipelineActive || !currentTask) return;

  const cycleIndex = ++cycleCount;
  console.log(`[VisionLite] Pipeline cycle #${cycleIndex}`);

  // Step 1: Capture screenshot
  const screenshot = await captureScreen();
  if (!screenshot) {
    console.warn('[VisionLite] No screenshot — skipping cycle');
    return;
  }

  // Step 2: Get DOM Snapshot from active tab
  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, resolve);
  });
  const activeTab = tabs[0];
  
  if (activeTab?.id) {
    try {
      const msg: GetDOMMsg = { type: 'GET_DOM' };
      const domResponse = await new Promise<any>((resolve, reject) => {
        chrome.tabs.sendMessage(activeTab.id!, msg, (response) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(response);
        });
      });
      if (domResponse?.snapshot) {
        pendingDOMSnapshots.set(cycleIndex, domResponse.snapshot);
      }
    } catch (err) {
      console.warn('[VisionLite] Failed to get DOM:', err);
    }
  }

  // Step 3: Ensure offscreen document is alive
  await ensureOffscreenDocument();

  // Step 4: Send screenshot to offscreen document for processing
  const msg: ProcessScreenshotMsg = {
    type: 'PROCESS_SCREENSHOT',
    screenshot,
    task: currentTask,
    cycleIndex,
  };

  try {
    chrome.runtime.sendMessage(msg);
    console.log(`[VisionLite] Screenshot sent to offscreen (cycle #${cycleIndex})`);
  } catch (err) {
    console.error('[VisionLite] Failed to send to offscreen:', err);
  }
}

function startPipeline(task: string): void {
  if (pipelineActive) stopPipeline();

  currentTask = task;
  pipelineActive = true;
  cycleCount = 0;

  console.log(`[VisionLite] Pipeline STARTED — task: "${task}"`);

  // Run first cycle immediately
  runPipelineCycle();

  // Then run on interval
  pipelineIntervalId = setInterval(runPipelineCycle, CYCLE_INTERVAL_MS);

  // Broadcast status
  broadcastStatus();
}

function stopPipeline(): void {
  pipelineActive = false;
  currentTask = null;

  if (pipelineIntervalId) {
    clearInterval(pipelineIntervalId);
    pipelineIntervalId = null;
  }

  console.log('[VisionLite] Pipeline STOPPED');
  broadcastStatus();
}

function broadcastStatus(): void {
  const msg: PipelineStatusMsg = {
    type: 'PIPELINE_STATUS',
    active: pipelineActive,
    task: currentTask || undefined,
    cycleCount,
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ════════════════════════════════════════════════════════════════
//  MESSAGE ROUTING
// ════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    // ---- From Popup: Start pipeline ----
    if (message.type === 'START_PIPELINE') {
      const { task } = message as StartPipelineMsg;
      startPipeline(task);
      sendResponse({ success: true });
      return false;
    }

    // ---- From Popup: Stop pipeline ----
    if (message.type === 'STOP_PIPELINE') {
      stopPipeline();
      sendResponse({ success: true });
      return false;
    }

    // ---- From Popup: Get current status ----
    if (message.type === 'GET_STATUS') {
      sendResponse({
        active: pipelineActive,
        task: currentTask,
        cycleCount,
      });
      return false;
    }

    // ---- From Offscreen: Redaction complete ----
    if (message.type === 'REDACTION_COMPLETE') {
      const { result, cycleIndex } = message as RedactionCompleteMsg;
      console.log(
        `[VisionLite] Redaction complete (cycle #${cycleIndex}):`,
        `${result.detections.length} PII items, ${result.processingTimeMs}ms`
      );

      // Relay stats to popup
      const statsMsg: StatsUpdateMsg = {
        type: 'STATS_UPDATE',
        detected: result.detections.length,
        protected: result.detections.length,
        latencyMs: result.processingTimeMs,
        pipelineActive,
      };
      chrome.runtime.sendMessage(statsMsg).catch(() => {});

      // Step 5: Evaluate Context with Dynamic Policy Engine before LLM reasoning
      if (currentTask) {
        const domSnapshot = pendingDOMSnapshots.get(cycleIndex);
        pendingDOMSnapshots.delete(cycleIndex);

        if (domSnapshot) {
          const pageUrl = domSnapshot.url || '';
          // ── POLICY INTERCEPTION 1: Pre-inference Route & Redaction check ──
          const policyDecision = policyEngine.evaluateContext(pageUrl, currentTask);
          console.log(`[VisionLite:Policy] Decision for ${pageUrl}:`, policyDecision);

          // Broadcast policy status to UI
          chrome.runtime.sendMessage({
            type: 'POLICY_DECISION_UPDATE',
            decision: policyDecision,
          }).catch(() => {});

          agent.getNextAction(currentTask, result.redactedScreenshot, domSnapshot, policyDecision).then((actionResponse) => {
            if (actionResponse && actionResponse.action) {
              if (actionResponse.action.action === 'done') {
                console.log('[VisionLite] AI signaled task is DONE.');
                stopPipeline();
              } else {
                // ── POLICY INTERCEPTION 2: Pre-execution Action & Human-in-the-Loop check ──
                const postActionPolicy = policyEngine.evaluateContext(pageUrl, currentTask, actionResponse.action);

                // Validate action structure and security boundaries
                const validation = actionValidator.validate(actionResponse.action);
                if (!validation.allowed) {
                  console.warn('[VisionLite] Action blocked by validator:', validation.reason);
                  agent.broadcastState(currentTask, 'error', undefined, undefined, `Action Blocked: ${validation.reason}`);
                  return;
                }

                const requiresApproval = validation.requiresConfirmation || postActionPolicy.requiresHumanApproval;

                if (requiresApproval) {
                  const policyReasons = postActionPolicy.reasons.join('; ');
                  console.warn(`[VisionLite] Action requires human approval under dynamic policy:`, policyReasons);
                  agent.broadcastState(
                    currentTask,
                    'executing',
                    `Action gated by Policy Engine: ${policyReasons}`,
                    `[Requires Approval: ${postActionPolicy.effectiveProfile.toUpperCase()}] ${actionResponse.action.action} ${actionResponse.action.target || ''}`
                  );
                  // Human approval required — do not blindly execute
                  return;
                }

                // Execute sanitized action on content script
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs[0]?.id) {
                    const execMsg: ExecuteActionMsg = {
                      type: 'EXECUTE_ACTION',
                      action: validation.sanitizedAction,
                    };
                    chrome.tabs.sendMessage(tabs[0].id, execMsg);
                  }
                });
              }
            }
          });
        } else {
          console.warn(`[VisionLite] No DOM snapshot found for cycle #${cycleIndex}`);
        }
      }

      return false;
    }

    // ---- Policy Engine: Request active context evaluation ----
    if (message.type === 'GET_POLICY_DECISION') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = message.url || tabs[0]?.url || '';
        const task = message.task || currentTask || '';
        const decision = policyEngine.evaluateContext(url, task);
        sendResponse({ decision });
      });
      return true;
    }

    // ---- From Content Script: capture request (legacy compat) ----
    if (message.type === 'capture_screen') {
      captureScreen().then((dataUrl) => {
        sendResponse({ success: !!dataUrl, dataUrl });
      });
      return true; // async response
    }
  }
);

// ════════════════════════════════════════════════════════════════
//  SIDE PANEL MANAGEMENT
// ════════════════════════════════════════════════════════════════

try {
  chrome.sidePanel.setOptions({ enabled: true });
} catch {
  // sidePanel API might not be available
}

// ════════════════════════════════════════════════════════════════
//  INSTALL HANDLER
// ════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener((details: { reason: string }) => {
  if (details.reason === 'install') {
    console.log('[VisionLite] Extension installed');
    chrome.storage.local.set({ extensionEnabled: false });
  }
});

