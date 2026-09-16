/**
 * VisionLite AI v2 — Offscreen Document (ML Engine)
 *
 * This runs in an offscreen document — a hidden page with full DOM/Canvas
 * access that service workers lack. It's the LOCAL ML processing hub.
 *
 * Current (Task 3): Mock PII detection with hardcoded bounding boxes.
 * Future phases will integrate:
 *   - ONNX Runtime Web (WebGPU) → YOLOv8-nano for UI element detection
 *   - Tesseract.js → OCR text extraction
 *   - MediaPipe Face Detection → face region localization
 *
 * Pipeline:
 *   1. Receive base64 screenshot from background service worker
 *   2. Draw screenshot onto hidden <canvas>
 *   3. Run PII detection (mock → real ML in future)
 *   4. Draw black rectangles over PII regions with [TYPE] labels
 *   5. Extract redacted canvas as base64
 *   6. Send result back to background
 */

import type {
  ProcessScreenshotMsg,
  RedactionCompleteMsg,
  PIIDetection,
  RedactionResult,
} from '../types/messages';
import { createWorker, Worker } from 'tesseract.js';
import { SecretScanner } from '../core/secret-scanner';

const secretScanner = new SecretScanner();

// ════════════════════════════════════════════════════════════════
//  CANVAS SETUP
// ════════════════════════════════════════════════════════════════

const canvas = document.getElementById('processingCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

console.log('[VisionLite:Offscreen] ML Engine loaded');

// ════════════════════════════════════════════════════════════════
//  TESSERACT OCR INIT
// ════════════════════════════════════════════════════════════════

let ocrWorker: Worker | null = null;
let isInitializing = false;

async function initTesseract() {
  if (ocrWorker || isInitializing) return ocrWorker;
  isInitializing = true;
  console.log('[VisionLite:Offscreen] Initializing Tesseract.js Worker...');

  try {
    ocrWorker = await createWorker('eng', 1, {
      workerPath: chrome.runtime.getURL('lib/worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract-core.wasm.js'),
      langPath: chrome.runtime.getURL('models'),
      gzip: true,
      logger: (m) => console.log(m),
    });
    console.log('[VisionLite:Offscreen] Tesseract.js Ready.');
  } catch (err) {
    console.error('[VisionLite:Offscreen] Tesseract Initialization Failed:', err);
  } finally {
    isInitializing = false;
  }
  return ocrWorker;
}

// ════════════════════════════════════════════════════════════════
//  IMAGE LOADING
// ════════════════════════════════════════════════════════════════

/**
 * Load a base64 data URL into an Image element.
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = dataUrl;
  });
}

// ════════════════════════════════════════════════════════════════
//  MOCK PII DETECTION (Task 3)
// ════════════════════════════════════════════════════════════════

/**
 * Real PII Detection using Tesseract.js OCR + Regex
 */
async function detectPII(imgWidth: number, imgHeight: number): Promise<PIIDetection[]> {
  const detections: PIIDetection[] = [];

  const worker = await initTesseract();
  if (!worker) {
    console.warn('[VisionLite:Offscreen] OCR Worker not ready, falling back to empty detections.');
    return detections;
  }

  console.log('[VisionLite:Offscreen] Running OCR...');
  const res = await worker.recognize(canvas);
  const pageData = res.data as any;

  console.log(`[VisionLite:Offscreen] OCR Complete. Extracted ${pageData.words?.length || 0} words.`);

  // Simple Regex Patterns
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const phoneRegex = /\+?(\d[\d-. ]+)?(\([\d-. ]+\))?[\d-. ]+\d{4,}\b/;
  const aadhaarRegex = /\b\d{4}\s\d{4}\s\d{4}\b/;
  const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/;
  const accountRegex = /\b\d{10,14}\b/; // Matches account numbers like 501002349876
  const projectCodeRegex = /\bPRJ-[A-Z0-9-]+\b/;

  // We loop through paragraphs or lines to find matches
  const lines = pageData.lines || [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    const bbox = line.bbox;
    // Tesseract bounds: { x0, y0, x1, y1 } -> { x, y, width, height }
    const bounds = {
      x: bbox.x0,
      y: bbox.y0,
      width: bbox.x1 - bbox.x0,
      height: bbox.y1 - bbox.y0,
    };

    if (emailRegex.test(text)) {
      detections.push({ type: 'EMAIL', bounds, confidence: line.confidence / 100, rawText: text, label: '[EMAIL]' });
      continue;
    }

    if (aadhaarRegex.test(text)) {
      detections.push({ type: 'AADHAAR', bounds, confidence: line.confidence / 100, rawText: text, label: '[AADHAAR]' });
      continue;
    }

    if (panRegex.test(text)) {
      detections.push({ type: 'PAN', bounds, confidence: line.confidence / 100, rawText: text, label: '[PAN]' });
      continue;
    }

    if (accountRegex.test(text)) {
      detections.push({ type: 'ACCOUNT_NUMBER', bounds, confidence: line.confidence / 100, rawText: text, label: '[ACCOUNT]' });
      continue;
    }

    if (projectCodeRegex.test(text)) {
      detections.push({ type: 'CONFIDENTIAL', bounds, confidence: line.confidence / 100, rawText: text, label: '[CONFIDENTIAL]' } as any);
      continue;
    }

    // Check for secrets (API keys, JWTs, credentials, high-entropy tokens)
    const secretResults = secretScanner.scan(text);
    if (secretResults.length > 0) {
      const topSecret = secretResults[0];
      detections.push({
        type: 'SECRET',
        bounds,
        confidence: topSecret.confidence,
        rawText: text,
        label: `[SECRET:${topSecret.type.replace(/_/g, ' ')}]`,
      });
      continue;
    }

    // A very loose phone check — Tesseract often breaks numbers into words.
    // In a real production app, we'd use YOLO to detect the form field, then OCR just that field.
    if (phoneRegex.test(text) && /\d{4}/.test(text)) {
      detections.push({ type: 'PHONE', bounds, confidence: line.confidence / 100, rawText: text, label: '[PHONE]' });
      continue;
    }
    // Smart Mock for Face Detection on KYC page
    // If we find 'DOB:', we infer the face is on the left side of the ID card
    if (text.includes('DOB:')) {
      detections.push({
        type: 'FACE',
        bounds: {
          x: Math.max(0, bounds.x - 120), // 120px to the left
          y: Math.max(0, bounds.y - 30),  // Slightly above DOB
          width: 100,
          height: 100
        },
        confidence: 0.99,
        label: '[FACE]'
      });
    }
  }

  return detections;
}

// ════════════════════════════════════════════════════════════════
//  CANVAS REDACTION
// ════════════════════════════════════════════════════════════════

/**
 * Draw redaction rectangles over detected PII regions.
 * - Black filled rectangle covers the PII
 * - White label text identifies the type (e.g., [EMAIL], [FACE])
 */
function redactOnCanvas(detections: PIIDetection[]): void {
  for (const detection of detections) {
    const { x, y, width, height } = detection.bounds;

    // Draw black rectangle over PII region
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, width, height);

    // Draw 1px border for visual clarity
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);

    // Draw label text centered on the black box
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(detection.label, x + width / 2, y + height / 2);
  }

  // Reset text alignment
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ════════════════════════════════════════════════════════════════
//  MAIN PROCESSING PIPELINE
// ════════════════════════════════════════════════════════════════

/**
 * Process a screenshot: detect PII → redact → return result.
 */
async function processScreenshot(
  screenshot: string,
  _task: string,
  cycleIndex: number
): Promise<RedactionResult> {
  const startTime = performance.now();

  // Step 1: Load the screenshot onto the canvas
  const img = await loadImage(screenshot);
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  console.log(`[VisionLite:Offscreen] Canvas: ${img.width}×${img.height} (cycle #${cycleIndex})`);

  // Step 2: Detect PII (Real ML OCR)
  const detections = await detectPII(img.width, img.height);

  // Step 3: Redact PII regions on the canvas
  redactOnCanvas(detections);

  // Step 4: Extract the redacted canvas as base64
  const redactedScreenshot = canvas.toDataURL('image/png');

  const processingTimeMs = Math.round(performance.now() - startTime);

  console.log(
    `[VisionLite:Offscreen] Processing complete: ${detections.length} items redacted in ${processingTimeMs}ms`
  );

  // Strip rawText from detections before returning (privacy: never send raw PII to background/server)
  const sanitizedDetections = detections.map(({ rawText, ...rest }) => rest) as PIIDetection[];

  return {
    redactedScreenshot,
    detections: sanitizedDetections,
    processingTimeMs,
  };
}

// ════════════════════════════════════════════════════════════════
//  MESSAGE LISTENER
// ════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener(
  (message: any, _sender: chrome.runtime.MessageSender, _sendResponse: (resp?: any) => void) => {
    if (message.type === 'PROCESS_SCREENSHOT') {
      const { screenshot, task, cycleIndex } = message as ProcessScreenshotMsg;

      // Process asynchronously
      processScreenshot(screenshot, task, cycleIndex)
        .then((result) => {
          // Send result back to background service worker
          const response: RedactionCompleteMsg = {
            type: 'REDACTION_COMPLETE',
            result,
            cycleIndex,
          };
          chrome.runtime.sendMessage(response);
        })
        .catch((err) => {
          console.error('[VisionLite:Offscreen] Processing failed:', err);
        });

      // Don't use sendResponse — we'll send a new message when done
      return false;
    }
  }
);

console.log('[VisionLite:Offscreen] Ready — awaiting screenshots');

