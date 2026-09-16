/**
 * PrivacyShield AI — Privacy Audit Logger
 *
 * Records privacy events, detections, and actions in a structured,
 * privacy-safe format. NEVER logs sensitive values — only event
 * types, categories, confidence scores, and decisions.
 *
 * Used for both internal debugging and the Privacy Dashboard UI.
 */

// ═══════════════════════════════════════════════════════════════
//  EVENT TYPES
// ═══════════════════════════════════════════════════════════════

export type PrivacyEventType =
  | 'PII_DETECTED'
  | 'FACE_DETECTED'
  | 'SECRET_DETECTED'
  | 'REDACTION_APPLIED'
  | 'REDACTION_FAILED'
  | 'REDACTION_VERIFIED'
  | 'DOM_SANITIZED'
  | 'PRIVACY_GATE_PASSED'
  | 'PRIVACY_GATE_BLOCKED'
  | 'ACTION_VALIDATED'
  | 'ACTION_BLOCKED'
  | 'ACTION_CONFIRMED'
  | 'ACTION_EXECUTED'
  | 'ACTION_FAILED'
  | 'AGENT_LOOP_DETECTED'
  | 'AGENT_TIMEOUT'
  | 'AGENT_STEP_LIMIT'
  | 'MODEL_ERROR'
  | 'NETWORK_ERROR'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'PIPELINE_CYCLE';

// ═══════════════════════════════════════════════════════════════
//  AUDIT EVENT
// ═══════════════════════════════════════════════════════════════

export interface AuditEvent {
  timestamp: number;
  sessionId: string;
  eventType: PrivacyEventType;
  domain: string;
  category?: string;       // PII type, action type, etc.
  confidence?: number;
  decision?: string;       // ALLOW, BLOCK, MASK, CONFIRM, etc.
  riskLevel?: string;      // LOW, MEDIUM, HIGH, CRITICAL
  details?: string;        // Human-readable description (NO sensitive values)
  metrics?: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════
//  SESSION METRICS
// ═══════════════════════════════════════════════════════════════

export interface SessionMetrics {
  piiDetected: number;
  facesDetected: number;
  secretsDetected: number;
  redactionsApplied: number;
  redactionsFailed: number;
  domFieldsSanitized: number;
  privacyGateBlocks: number;
  actionsExecuted: number;
  actionsBlocked: number;
  actionsConfirmed: number;
  modelErrors: number;
  totalPipelineCycles: number;
  avgProcessingTimeMs: number;
  payloadSizeReduction: number; // percentage
}

// ═══════════════════════════════════════════════════════════════
//  AUDIT LOGGER
// ═══════════════════════════════════════════════════════════════

export class AuditLogger {
  private events: AuditEvent[] = [];
  private sessionId: string;
  private domain: string;
  private maxEvents = 500; // Ring buffer — keep last N events
  private processingTimes: number[] = [];

  // Aggregate counters
  private counters: SessionMetrics = {
    piiDetected: 0,
    facesDetected: 0,
    secretsDetected: 0,
    redactionsApplied: 0,
    redactionsFailed: 0,
    domFieldsSanitized: 0,
    privacyGateBlocks: 0,
    actionsExecuted: 0,
    actionsBlocked: 0,
    actionsConfirmed: 0,
    modelErrors: 0,
    totalPipelineCycles: 0,
    avgProcessingTimeMs: 0,
    payloadSizeReduction: 0,
  };

  constructor(domain: string = 'unknown') {
    this.sessionId = this.generateSessionId();
    this.domain = domain;
  }

  /**
   * Log a privacy event.
   */
  log(event: Omit<AuditEvent, 'timestamp' | 'sessionId' | 'domain'>): void {
    const fullEvent: AuditEvent = {
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      domain: this.domain,
    };

    // Add to ring buffer
    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Update counters
    this.updateCounters(fullEvent);

    // Log to console (debug level)
    console.log(`[PrivacyShield:Audit] ${fullEvent.eventType}${fullEvent.category ? ` (${fullEvent.category})` : ''} — ${fullEvent.decision || 'recorded'}`);
  }

  /**
   * Update aggregate counters based on event type.
   */
  private updateCounters(event: AuditEvent): void {
    switch (event.eventType) {
      case 'PII_DETECTED': this.counters.piiDetected++; break;
      case 'FACE_DETECTED': this.counters.facesDetected++; break;
      case 'SECRET_DETECTED': this.counters.secretsDetected++; break;
      case 'REDACTION_APPLIED': this.counters.redactionsApplied++; break;
      case 'REDACTION_FAILED': this.counters.redactionsFailed++; break;
      case 'DOM_SANITIZED': this.counters.domFieldsSanitized += event.metrics?.fieldsStripped || 0; break;
      case 'PRIVACY_GATE_BLOCKED': this.counters.privacyGateBlocks++; break;
      case 'ACTION_EXECUTED': this.counters.actionsExecuted++; break;
      case 'ACTION_BLOCKED': this.counters.actionsBlocked++; break;
      case 'ACTION_CONFIRMED': this.counters.actionsConfirmed++; break;
      case 'MODEL_ERROR': this.counters.modelErrors++; break;
      case 'PIPELINE_CYCLE':
        this.counters.totalPipelineCycles++;
        if (event.metrics?.processingTimeMs) {
          this.processingTimes.push(event.metrics.processingTimeMs);
          this.counters.avgProcessingTimeMs = Math.round(
            this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
          );
        }
        break;
    }
  }

  /**
   * Get current session metrics.
   */
  getMetrics(): SessionMetrics {
    return { ...this.counters };
  }

  /**
   * Get recent events (for Privacy Inspector UI).
   */
  getRecentEvents(count: number = 20): AuditEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get all events for the current session.
   */
  getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  /**
   * Calculate the privacy protection score.
   * Based on measurable metrics, not arbitrary numbers.
   *
   * Formula:
   *   score = weighted_average(
   *     pii_redaction_rate,
   *     gate_pass_rate,
   *     action_block_rate,
   *     dom_sanitization_coverage
   *   )
   */
  getPrivacyScore(): { score: number; breakdown: Record<string, number> } {
    const totalDetections = this.counters.piiDetected + this.counters.facesDetected + this.counters.secretsDetected;
    const totalRedactions = this.counters.redactionsApplied;
    const totalGateChecks = this.counters.totalPipelineCycles;
    const gateBlocks = this.counters.privacyGateBlocks;

    // Component scores (0-100)
    const redactionRate = totalDetections > 0
      ? Math.round((totalRedactions / totalDetections) * 100)
      : 100; // No detections = nothing to redact

    const gatePassRate = totalGateChecks > 0
      ? Math.round(((totalGateChecks - gateBlocks) / totalGateChecks) * 100)
      : 100;

    const actionSafetyRate = (this.counters.actionsExecuted + this.counters.actionsBlocked) > 0
      ? Math.round(((this.counters.actionsExecuted) / (this.counters.actionsExecuted + this.counters.actionsBlocked)) * 100)
      : 100;

    const breakdown = {
      redactionCoverage: redactionRate,
      privacyGatePassRate: gatePassRate,
      actionSafetyRate,
      domSanitization: this.counters.domFieldsSanitized > 0 ? 100 : 0,
    };

    // Weighted score
    const score = Math.round(
      redactionRate * 0.40 +
      gatePassRate * 0.25 +
      actionSafetyRate * 0.20 +
      breakdown.domSanitization * 0.15
    );

    return { score: Math.min(100, score), breakdown };
  }

  /**
   * Update domain for subsequent events.
   */
  setDomain(domain: string): void {
    this.domain = domain;
  }

  /**
   * Record payload size reduction metric.
   */
  recordPayloadReduction(rawSizeBytes: number, sanitizedSizeBytes: number): void {
    if (rawSizeBytes > 0) {
      this.counters.payloadSizeReduction = Math.round(
        ((rawSizeBytes - sanitizedSizeBytes) / rawSizeBytes) * 100
      );
    }
  }

  /**
   * Start a new session.
   */
  newSession(domain: string): void {
    this.sessionId = this.generateSessionId();
    this.domain = domain;
    this.events = [];
    this.processingTimes = [];
    this.counters = {
      piiDetected: 0,
      facesDetected: 0,
      secretsDetected: 0,
      redactionsApplied: 0,
      redactionsFailed: 0,
      domFieldsSanitized: 0,
      privacyGateBlocks: 0,
      actionsExecuted: 0,
      actionsBlocked: 0,
      actionsConfirmed: 0,
      modelErrors: 0,
      totalPipelineCycles: 0,
      avgProcessingTimeMs: 0,
      payloadSizeReduction: 0,
    };

    this.log({ eventType: 'SESSION_STARTED' });
  }

  /**
   * Generate a non-PII session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `ps_${timestamp}_${random}`;
  }
}
