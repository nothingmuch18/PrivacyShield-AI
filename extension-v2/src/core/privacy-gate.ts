/**
 * PrivacyShield AI — Privacy Gate
 *
 * Final defense layer before ANY data leaves the browser.
 * Scans outbound payloads for residual PII that may have survived
 * the detection + redaction pipeline. If sensitive data is found,
 * the payload is BLOCKED (fail-closed).
 *
 * PRINCIPLE: The system fails CLOSED — if privacy cannot be
 * guaranteed, transmission is blocked entirely.
 */

// ═══════════════════════════════════════════════════════════════
//  PII SCAN PATTERNS
// ═══════════════════════════════════════════════════════════════

const OUTBOUND_PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  // India-specific identifiers
  { type: 'AADHAAR', pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
  { type: 'PAN', pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: 'VOTER_ID', pattern: /\b[A-Z]{3}\d{7}\b/g },
  { type: 'PASSPORT_IN', pattern: /\b[A-Z]\d{7}\b/g },

  // Financial
  { type: 'CREDIT_CARD', pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g },
  { type: 'ACCOUNT_NUMBER', pattern: /\b\d{10,18}\b/g },

  // Contact
  { type: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { type: 'PHONE_IN', pattern: /\+?91[\s-]?\d{5}[\s-]?\d{5}\b/g },

  // Auth secrets - format requires typical delimiters (hyphen/underscore) or uppercase tokens
  { type: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { type: 'API_KEY', pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|pk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[bpas]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{35})\b/g },
  { type: 'BEARER_TOKEN', pattern: /Bearer\s+[A-Za-z0-9_.-]{20,}/gi },
];

/**
 * Strings that should be EXCLUDED from PII detection (they are tokens/labels, not real PII)
 */
const SAFE_TOKENS = new Set([
  '[AADHAAR]', '[PAN]', '[EMAIL]', '[PHONE]', '[CARD]', '[ACCOUNT]',
  '[SSN]', '[IBAN]', '[FACE]', '[REDACTED]', '[REDACTED_PASSWORD]',
  '[NAME]', '[DOB]', '[ADDRESS]', '[PASSPORT]', '[VOTER_ID]', '[DL]',
  '[IFSC]', '[UPI_ID]', '[PIN]', '[JWT_TOKEN]', '[API_KEY]', '[AWS_KEY]',
  '[PRIVATE_KEY]', '[TOKEN]', '[SECRET]', '[CONFIDENTIAL]',
  '[NAME_1]', '[EMAIL_1]', '[PHONE_1]', '[AADHAAR_1]', '[PAN_1]',
  '[ADDRESS_1]', '[PASSWORD_1]', '[PII_1]',
]);

// ═══════════════════════════════════════════════════════════════
//  GATE RESULT
// ═══════════════════════════════════════════════════════════════

export interface PrivacyGateResult {
  /** Whether the payload passed the privacy gate */
  allowed: boolean;
  /** Violations found (if any) */
  violations: Array<{
    type: string;
    match: string;
    location: string;
  }>;
  /** Summary for logging (no sensitive values) */
  summary: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════
//  PRIVACY GATE
// ═══════════════════════════════════════════════════════════════

export class PrivacyGate {
  private violationCount = 0;
  private allowedCount = 0;

  /**
   * Scan an outbound payload for residual PII.
   * Returns { allowed: false } if ANY sensitive data is detected.
   *
   * IMPORTANT: This operates on the SERIALIZED payload string, not the
   * structured object. This ensures nothing slips through nested fields.
   */
  scan(payload: unknown, context: string = 'unknown'): PrivacyGateResult {
    const startTime = performance.now();
    const violations: PrivacyGateResult['violations'] = [];

    // Serialize the entire payload to a flat string for scanning
    let serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Strip base64 image payloads (they are visually redacted by Canvas and contain random base64 byte sequences)
    serialized = serialized.replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, '"[REDACTED_IMAGE_BASE64]"');

    // Remove known-safe tokens before scanning
    let cleanedForScan = serialized;
    for (const token of SAFE_TOKENS) {
      cleanedForScan = cleanedForScan.split(token).join('');
    }

    // Scan for each PII pattern
    for (const { type, pattern } of OUTBOUND_PII_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(cleanedForScan)) !== null) {
        const matchedText = match[0];

        // Skip very short matches that are likely false positives
        if (type === 'ACCOUNT_NUMBER' && matchedText.length < 10) continue;
        if (type === 'PASSPORT_IN' && matchedText.length < 8) continue;

        // Skip values that look like they are coordinates, timestamps, or pixel values
        if (this.isLikelyFalsePositive(matchedText, type, cleanedForScan, match.index)) continue;

        violations.push({
          type,
          match: this.redactMatch(matchedText),
          location: context,
        });
      }
    }

    const processingTimeMs = Math.round(performance.now() - startTime);
    const allowed = violations.length === 0;

    if (allowed) {
      this.allowedCount++;
    } else {
      this.violationCount++;
    }

    return {
      allowed,
      violations,
      summary: allowed
        ? `Privacy Gate PASSED (${context})`
        : `Privacy Gate BLOCKED: ${violations.length} violation(s) in ${context} — ${violations.map(v => v.type).join(', ')}`,
      processingTimeMs,
    };
  }

  /**
   * Filter out common false positives.
   */
  private isLikelyFalsePositive(match: string, type: string, context: string, index: number): boolean {
    // Pixel values (100, 200, etc.) in bounding boxes
    if (type === 'ACCOUNT_NUMBER') {
      const surroundingStart = Math.max(0, index - 30);
      const surrounding = context.substring(surroundingStart, index + match.length + 30);

      // Common JSON keys that contain numbers but aren't PII
      if (/("x"|"y"|"width"|"height"|"timestamp"|"cycleIndex"|"step"|"confidence"|"latency"|bounds|viewport)/i.test(surrounding)) {
        return true;
      }
    }

    // Timestamps that look like phone numbers
    if (type === 'PHONE_IN' && /^\d{13}$/.test(match)) {
      return true; // Unix timestamp in ms
    }

    return false;
  }

  /**
   * Partially redact a match for safe logging.
   * Shows first 2 and last 2 characters only.
   */
  private redactMatch(match: string): string {
    if (match.length <= 4) return '***';
    return match.slice(0, 2) + '*'.repeat(match.length - 4) + match.slice(-2);
  }

  /**
   * Get gate statistics.
   */
  getStats(): { allowed: number; blocked: number } {
    return { allowed: this.allowedCount, blocked: this.violationCount };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.allowedCount = 0;
    this.violationCount = 0;
  }
}
