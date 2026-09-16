/**
 * PrivacyShield AI — DOM Sanitizer
 *
 * Strips sensitive data from DOM snapshots BEFORE they are transmitted
 * to the remote AI server. This is one of the most critical privacy
 * components — the screenshot redaction is useless if raw form values,
 * hidden fields, and auth tokens leak through the DOM.
 *
 * PRINCIPLE: The VLM should know "there is a sensitive identity field"
 * but must NEVER know "the identity number is 123456789012".
 */

import type { DOMElement, DOMSnapshot } from '../types/messages';

// ═══════════════════════════════════════════════════════════════
//  PII REGEX PATTERNS (for DOM text/value scanning)
// ═══════════════════════════════════════════════════════════════

const PII_PATTERNS: Array<{ type: string; pattern: RegExp; token: string }> = [
  // India-specific
  { type: 'AADHAAR', pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/, token: '[AADHAAR]' },
  { type: 'PAN', pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/, token: '[PAN]' },
  { type: 'VOTER_ID', pattern: /\b[A-Z]{3}\d{7}\b/, token: '[VOTER_ID]' },
  { type: 'DRIVING_LICENSE', pattern: /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{7}\b/, token: '[DL]' },
  { type: 'PASSPORT', pattern: /\b[A-Z]\d{7}\b/, token: '[PASSPORT]' },
  { type: 'IFSC', pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/, token: '[IFSC]' },
  { type: 'UPI_ID', pattern: /\b[\w.-]+@[a-z]{2,}\b/i, token: '[UPI_ID]' },
  { type: 'INDIAN_PHONE', pattern: /\+?91[\s-]?\d{5}[\s-]?\d{5}\b/, token: '[PHONE]' },
  { type: 'PIN_CODE', pattern: /\b[1-9]\d{5}\b/, token: '[PIN]' },

  // Global
  { type: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, token: '[EMAIL]' },
  { type: 'PHONE', pattern: /\+?\d[\d\s()-]{7,}\d\b/, token: '[PHONE]' },
  { type: 'CREDIT_CARD', pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/, token: '[CARD]' },
  { type: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/, token: '[SSN]' },
  { type: 'IBAN', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/, token: '[IBAN]' },
  { type: 'ACCOUNT_NUMBER', pattern: /\b\d{9,18}\b/, token: '[ACCOUNT]' },

  // Secrets
  { type: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, token: '[JWT_TOKEN]' },
  { type: 'API_KEY', pattern: /\b(sk|pk|gsk|ghp|glpat|xox[bpas]|AKIA|AIza)[A-Za-z0-9_-]{10,}\b/, token: '[API_KEY]' },
  { type: 'AWS_KEY', pattern: /\bAKIA[A-Z0-9]{16}\b/, token: '[AWS_KEY]' },
  { type: 'PRIVATE_KEY', pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/, token: '[PRIVATE_KEY]' },
];

// ═══════════════════════════════════════════════════════════════
//  SENSITIVE ATTRIBUTES & FIELD TYPES
// ═══════════════════════════════════════════════════════════════

/** Attributes that should NEVER be transmitted */
const BLOCKED_ATTRIBUTES = new Set([
  'value',        // Input values may contain PII
  'data-token',
  'data-secret',
  'data-api-key',
  'data-session',
  'data-auth',
  'data-csrf',
  'data-nonce',
  'data-password',
  'data-account',
]);

/** Input types whose values are always sensitive */
const SENSITIVE_INPUT_TYPES = new Set([
  'password',
  'hidden',
  'tel',
  'email',
]);

/** Field names / placeholders that indicate sensitive content */
const SENSITIVE_FIELD_KEYWORDS = [
  'password', 'passwd', 'pass', 'pwd',
  'otp', 'pin', 'cvv', 'cvc',
  'ssn', 'aadhaar', 'aadhar', 'pan',
  'account', 'routing', 'ifsc',
  'secret', 'token', 'auth', 'csrf',
  'credit', 'debit', 'card',
  'social_security',
];

// ═══════════════════════════════════════════════════════════════
//  SANITIZATION RESULTS
// ═══════════════════════════════════════════════════════════════

export interface SanitizationResult {
  /** The sanitized DOM snapshot */
  sanitizedSnapshot: DOMSnapshot;
  /** Count of elements that had values stripped */
  valuesStripped: number;
  /** Count of PII patterns found and replaced in text/names */
  piiTokensReplaced: number;
  /** Count of attributes removed */
  attributesRemoved: number;
  /** Total sensitive elements detected */
  sensitiveElementsDetected: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════
//  DOM SANITIZER
// ═══════════════════════════════════════════════════════════════

export class DOMSanitizer {
  private stats = {
    valuesStripped: 0,
    piiTokensReplaced: 0,
    attributesRemoved: 0,
    sensitiveElementsDetected: 0,
  };

  /**
   * Sanitize a DOM snapshot, removing all sensitive data before transmission.
   * Returns a new sanitized snapshot — does NOT modify the original.
   */
  sanitize(snapshot: DOMSnapshot): SanitizationResult {
    const startTime = performance.now();
    this.stats = { valuesStripped: 0, piiTokensReplaced: 0, attributesRemoved: 0, sensitiveElementsDetected: 0 };

    const sanitizedElements = snapshot.elements.map(el => this.sanitizeElement(el));

    const sanitizedSnapshot: DOMSnapshot = {
      url: this.sanitizeUrl(snapshot.url),
      title: this.sanitizeText(snapshot.title),
      viewport: { ...snapshot.viewport },
      elements: sanitizedElements,
      timestamp: snapshot.timestamp,
    };

    return {
      sanitizedSnapshot,
      ...this.stats,
      processingTimeMs: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Sanitize a single DOM element.
   */
  private sanitizeElement(el: DOMElement): DOMElement {
    const isSensitive = this.isElementSensitive(el);
    if (isSensitive) this.stats.sensitiveElementsDetected++;

    const sanitized: DOMElement = {
      selector: el.selector,
      role: el.role,
      name: this.sanitizeElementName(el),
      bounds: { ...el.bounds },
      tag: el.tag,
    };

    // Handle values
    if (el.value !== undefined) {
      if (isSensitive || el.role === 'password') {
        sanitized.value = '[REDACTED]';
        this.stats.valuesStripped++;
      } else if (this.containsPII(el.value)) {
        sanitized.value = this.tokenizePII(el.value);
        this.stats.piiTokensReplaced++;
      } else {
        sanitized.value = el.value;
      }
    }

    // Handle attributes
    if (el.attributes) {
      sanitized.attributes = this.sanitizeAttributes(el.attributes, isSensitive);
    }

    return sanitized;
  }

  /**
   * Check if an element is sensitive based on its type, role, and attributes.
   */
  private isElementSensitive(el: DOMElement): boolean {
    // Password fields are always sensitive
    if (el.role === 'password') return true;

    // Check input type
    const inputType = el.attributes?.type?.toLowerCase();
    if (inputType && SENSITIVE_INPUT_TYPES.has(inputType)) return true;

    // Check field name/placeholder against sensitive keywords
    const fieldIdentifiers = [
      el.attributes?.name,
      el.attributes?.placeholder,
      el.attributes?.autocomplete,
      el.name,
    ].filter(Boolean).map(s => s!.toLowerCase());

    for (const identifier of fieldIdentifiers) {
      for (const keyword of SENSITIVE_FIELD_KEYWORDS) {
        if (identifier.includes(keyword)) return true;
      }
    }

    return false;
  }

  /**
   * Sanitize the element's accessible name (visible text / label).
   */
  private sanitizeElementName(el: DOMElement): string {
    if (!el.name) return el.name;

    // For sensitive elements, keep the label but redact any embedded values
    if (this.isElementSensitive(el)) {
      return this.tokenizePII(el.name);
    }

    // For all elements, scan for PII in the visible text
    if (this.containsPII(el.name)) {
      return this.tokenizePII(el.name);
      }

    return el.name;
  }

  /**
   * Sanitize element attributes, removing blocked and sensitive ones.
   */
  private sanitizeAttributes(
    attrs: Record<string, string>,
    isSensitive: boolean
  ): Record<string, string> | undefined {
    const cleaned: Record<string, string> = {};

    for (const [key, value] of Object.entries(attrs)) {
      // Always block certain attributes
      if (BLOCKED_ATTRIBUTES.has(key)) {
        this.stats.attributesRemoved++;
        continue;
      }

      // For sensitive elements, only keep structural attributes
      if (isSensitive) {
        if (['type', 'role', 'name'].includes(key)) {
          cleaned[key] = value;
        } else {
          this.stats.attributesRemoved++;
        }
        continue;
      }

      // Scan attribute values for PII
      if (this.containsPII(value)) {
        cleaned[key] = this.tokenizePII(value);
        this.stats.piiTokensReplaced++;
      } else {
        cleaned[key] = value;
      }
    }

    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  /**
   * Check if a string contains PII patterns.
   */
  private containsPII(text: string): boolean {
    if (!text || text.length < 3) return false;
    return PII_PATTERNS.some(({ pattern }) => pattern.test(text));
  }

  /**
   * Replace PII patterns in text with tokens.
   */
  private tokenizePII(text: string): string {
    let result = text;
    for (const { pattern, token } of PII_PATTERNS) {
      result = result.replace(new RegExp(pattern.source, pattern.flags + 'g'), token);
    }
    return result;
  }

  /**
   * Sanitize arbitrary text (e.g. document title) by tokenizing PII.
   */
  sanitizeText(text: string): string {
    if (!text) return text;
    return this.tokenizePII(text);
  }

  /**
   * Sanitize a URL — remove query params that might contain tokens/credentials.
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const sensitiveParams = ['token', 'auth', 'key', 'secret', 'session', 'sid', 'csrf', 'password', 'otp'];
      for (const param of sensitiveParams) {
        if (parsed.searchParams.has(param)) {
          parsed.searchParams.set(param, '[REDACTED]');
        }
      }
      // Also redact any param that looks like it contains a token
      for (const [key, value] of parsed.searchParams.entries()) {
        if (value.length > 20 && /^[A-Za-z0-9_-]+$/.test(value)) {
          parsed.searchParams.set(key, '[TOKEN]');
        }
      }
      return parsed.toString();
    } catch {
      return url; // If URL parsing fails, return as-is
    }
  }
}
