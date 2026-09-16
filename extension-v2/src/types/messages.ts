/**
 * VisionLite AI — Shared Message Types
 *
 * Discriminated union types for all inter-component messages.
 * Each component imports these types for compile-time safety.
 * At runtime, esbuild inlines only the type erasures (zero bytes).
 */

// ═══════════════════════════════════════════════════════════════
//  DETECTION TYPES
// ═══════════════════════════════════════════════════════════════

/** A detected PII region on the screenshot */
export interface PIIDetection {
  /** Category of PII found */
  type: 'EMAIL' | 'PHONE' | 'AADHAAR' | 'PAN' | 'NAME' | 'DOB' | 'CREDIT_CARD' | 'ADDRESS' | 'FACE' | 'ACCOUNT_NUMBER' | 'VOTER_ID' | 'PASSPORT' | 'IFSC' | 'UPI_ID' | 'SECRET' | 'CONFIDENTIAL' | 'UNKNOWN';
  /** Bounding box in screenshot pixel coordinates */
  bounds: { x: number; y: number; width: number; height: number };
  /** Detection confidence 0-1 */
  confidence: number;
  /** The raw text that was detected (before redaction) — only kept locally, never sent to server */
  rawText?: string;
  /** Redaction label shown on the black box */
  label: string;
}

/** Summary of a redaction pass */
export interface RedactionResult {
  /** Base64 PNG of the redacted screenshot */
  redactedScreenshot: string;
  /** All PII items that were detected and redacted */
  detections: PIIDetection[];
  /** Processing time in ms */
  processingTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════
//  DOM TYPES
// ═══════════════════════════════════════════════════════════════

/** A single interactive DOM element extracted by the content script */
export interface DOMElement {
  /** Unique selector or XPath for this element */
  selector: string;
  /** Semantic role (button, textbox, link, heading, etc.) */
  role: string;
  /** Accessible name / visible text */
  name: string;
  /** Bounding box relative to viewport */
  bounds: { x: number; y: number; width: number; height: number };
  /** Element tag name */
  tag: string;
  /** Current value (for inputs) */
  value?: string;
  /** Additional attributes */
  attributes?: Record<string, string>;
}

/** Full DOM snapshot sent to the server */
export interface DOMSnapshot {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  elements: DOMElement[];
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
//  ACTION TYPES (from AI server)
// ═══════════════════════════════════════════════════════════════

export interface ActionCommand {
  action: 'click' | 'type' | 'scroll' | 'select' | 'navigate' | 'wait' | 'done';
  target?: string;
  value?: string;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGE TYPES (inter-component communication)
// ═══════════════════════════════════════════════════════════════

// ---- Popup → Background ----

export interface StartPipelineMsg {
  type: 'START_PIPELINE';
  task: string;
}

export interface StopPipelineMsg {
  type: 'STOP_PIPELINE';
}

export interface GetStatusMsg {
  type: 'GET_STATUS';
}

// ---- Background → Offscreen ----

export interface ProcessScreenshotMsg {
  type: 'PROCESS_SCREENSHOT';
  screenshot: string;   // base64 data URL
  task: string;
  cycleIndex: number;
}

// ---- Offscreen → Background ----

export interface RedactionCompleteMsg {
  type: 'REDACTION_COMPLETE';
  result: RedactionResult;
  cycleIndex: number;
}

/** 
 * Broadcasted when the Agent Controller is about to send the payload to the server.
 * Intercepted by the Debug View.
 */
export interface DebugPayloadMsg {
  type: 'DEBUG_PAYLOAD';
  payload: {
    imageBase64: string;
    domState: any;
  };
}

// ---- Background → Content Script ----

export interface GetDOMMsg {
  type: 'GET_DOM';
}

export interface ExecuteActionMsg {
  type: 'EXECUTE_ACTION';
  action: ActionCommand;
}

export interface ToggleExtensionMsg {
  type: 'TOGGLE_EXTENSION';
  enabled: boolean;
}

// ---- Content Script → Background ----

export interface DOMSnapshotMsg {
  type: 'DOM_SNAPSHOT';
  snapshot: DOMSnapshot;
}

export interface ActionResultMsg {
  type: 'ACTION_RESULT';
  success: boolean;
  description: string;
  error?: string;
}

// ---- Background → Popup ----

export interface StatsUpdateMsg {
  type: 'STATS_UPDATE';
  detected: number;
  protected: number;
  latencyMs: number;
  pipelineActive: boolean;
}

export interface PipelineStatusMsg {
  type: 'PIPELINE_STATUS';
  active: boolean;
  task?: string;
  cycleCount: number;
}

// ---- Background → Side Panel ----

export interface AgentStateUpdateMsg {
  type: 'AGENT_STATE_UPDATE';
  task: string | null;
  status: 'idle' | 'analyzing' | 'executing' | 'done' | 'error';
  reasoning?: string;
  actionDescription?: string;
  error?: string;
  metrics?: {
    localLatencyMs?: number;
    piiCount?: number;
    cloudLatencyMs?: number;
  };
}

// ---- Side Panel → Background ----

export interface SidePanelChatMsg {
  type: 'SIDEPANEL_CHAT';
  message: string;
}

// ---- Union of all messages ----

export type ExtensionMessage =
  | StartPipelineMsg
  | StopPipelineMsg
  | GetStatusMsg
  | ProcessScreenshotMsg
  | RedactionCompleteMsg
  | GetDOMMsg
  | ExecuteActionMsg
  | ToggleExtensionMsg
  | DOMSnapshotMsg
  | ActionResultMsg
  | StatsUpdateMsg
  | PipelineStatusMsg
  | AgentStateUpdateMsg
  | SidePanelChatMsg;

