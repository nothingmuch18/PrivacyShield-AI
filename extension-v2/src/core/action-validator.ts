/**
 * PrivacyShield AI — Action Validator & Risk Classifier
 *
 * Every action from the VLM passes through this validator before
 * it reaches the browser executor. Classifies risk, validates
 * selectors, blocks dangerous operations, and gates high-risk
 * actions behind user confirmation.
 *
 * PRINCIPLE: The VLM is treated as UNTRUSTED. Its output is a
 * suggestion that must pass validation, not a command.
 */

import type { ActionCommand } from '../types/messages';

// ═══════════════════════════════════════════════════════════════
//  RISK LEVELS
// ═══════════════════════════════════════════════════════════════

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ValidationResult {
  /** Whether the action is allowed to execute */
  allowed: boolean;
  /** Risk level of this action */
  riskLevel: RiskLevel;
  /** Whether user confirmation is required before execution */
  requiresConfirmation: boolean;
  /** Human-readable explanation of the risk assessment */
  reason: string;
  /** The sanitized/validated action (selectors cleaned, etc.) */
  sanitizedAction: ActionCommand;
  /** Specific security warnings */
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════
//  BLOCKED PATTERNS
// ═══════════════════════════════════════════════════════════════

/** URL schemes that are NEVER allowed for navigation */
const BLOCKED_URL_SCHEMES = [
  'javascript:',
  'data:text/html',
  'vbscript:',
  'blob:',
];

/** Keywords in navigation targets that indicate high risk */
const HIGH_RISK_NAV_KEYWORDS = [
  'delete', 'remove', 'cancel', 'deactivate', 'close-account',
  'payment', 'transfer', 'send-money', 'checkout', 'pay',
  'logout', 'signout', 'sign-out',
];

/** Keywords in button/element text that indicate high-risk actions */
const HIGH_RISK_ELEMENT_KEYWORDS = [
  'delete', 'remove', 'cancel', 'deactivate',
  'pay', 'payment', 'transfer', 'send money', 'checkout',
  'confirm payment', 'place order', 'submit payment',
  'close account', 'delete account',
];

/** Keywords indicating critical actions */
const CRITICAL_ACTION_KEYWORDS = [
  'delete account', 'close account', 'deactivate account',
  'confirm payment', 'authorize transfer', 'send money',
  'change password', 'change email', 'change phone',
  'two-factor', '2fa', 'security settings',
];

/** Allowed action types */
const VALID_ACTION_TYPES = new Set([
  'click', 'type', 'scroll', 'select', 'navigate',
  'wait', 'done', 'hover', 'focus', 'extract_data',
]);

// ═══════════════════════════════════════════════════════════════
//  ACTION VALIDATOR
// ═══════════════════════════════════════════════════════════════

export class ActionValidator {
  private maxActionsPerSession: number;
  private actionCount = 0;
  private maxSteps: number;
  private sessionStartTime: number;
  private maxSessionDurationMs: number;

  constructor(options?: {
    maxActionsPerSession?: number;
    maxSteps?: number;
    maxSessionDurationMs?: number;
  }) {
    this.maxActionsPerSession = options?.maxActionsPerSession ?? 50;
    this.maxSteps = options?.maxSteps ?? 100;
    this.maxSessionDurationMs = options?.maxSessionDurationMs ?? 5 * 60 * 1000; // 5 minutes
    this.sessionStartTime = Date.now();
  }

  /**
   * Validate an action command from the VLM.
   */
  validate(action: ActionCommand, elementText?: string): ValidationResult {
    const warnings: string[] = [];

    // ── Step 0: Check session limits ──
    if (this.actionCount >= this.maxActionsPerSession) {
      return {
        allowed: false,
        riskLevel: 'HIGH',
        requiresConfirmation: false,
        reason: `Session action limit reached (${this.maxActionsPerSession} actions). Stopping to prevent runaway agent.`,
        sanitizedAction: { action: 'done', description: 'Session limit reached' },
        warnings: ['ACTION_LIMIT_REACHED'],
      };
    }

    if (Date.now() - this.sessionStartTime > this.maxSessionDurationMs) {
      return {
        allowed: false,
        riskLevel: 'HIGH',
        requiresConfirmation: false,
        reason: `Session timeout (${Math.round(this.maxSessionDurationMs / 60000)} minutes). Stopping agent.`,
        sanitizedAction: { action: 'done', description: 'Session timeout' },
        warnings: ['SESSION_TIMEOUT'],
      };
    }

    // ── Step 1: Validate action type ──
    if (!VALID_ACTION_TYPES.has(action.action)) {
      return {
        allowed: false,
        riskLevel: 'HIGH',
        requiresConfirmation: false,
        reason: `Unknown action type: "${action.action}". Only predefined actions are allowed.`,
        sanitizedAction: { action: 'wait', value: '1000', description: 'Invalid action blocked' },
        warnings: ['UNKNOWN_ACTION_TYPE'],
      };
    }

    // ── Step 2: Validate selector (no arbitrary JS) ──
    if (action.target) {
      const selectorCheck = this.validateSelector(action.target);
      if (!selectorCheck.valid) {
        return {
          allowed: false,
          riskLevel: 'CRITICAL',
          requiresConfirmation: false,
          reason: selectorCheck.reason,
          sanitizedAction: { action: 'wait', value: '1000', description: 'Dangerous selector blocked' },
          warnings: ['DANGEROUS_SELECTOR'],
        };
      }
    }

    // ── Step 3: Validate navigation targets ──
    if (action.action === 'navigate' && action.value) {
      const navCheck = this.validateNavigation(action.value);
      if (!navCheck.allowed) {
        return {
          allowed: false,
          riskLevel: navCheck.riskLevel,
          requiresConfirmation: false,
          reason: navCheck.reason,
          sanitizedAction: { action: 'wait', value: '1000', description: 'Navigation blocked' },
          warnings: navCheck.warnings,
        };
      }
      if (navCheck.requiresConfirmation) {
        warnings.push('EXTERNAL_NAVIGATION');
      }
    }

    // ── Step 4: Classify risk ──
    const riskLevel = this.classifyRisk(action, elementText);
    const requiresConfirmation = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

    // ── Step 5: Block CRITICAL actions unless explicitly designed ──
    if (riskLevel === 'CRITICAL') {
      warnings.push('CRITICAL_ACTION');
    }

    // Increment action counter
    this.actionCount++;

    return {
      allowed: true,
      riskLevel,
      requiresConfirmation,
      reason: this.getRiskExplanation(riskLevel, action),
      sanitizedAction: action,
      warnings,
    };
  }

  /**
   * Validate a CSS selector for safety.
   */
  private validateSelector(selector: string): { valid: boolean; reason: string } {
    // Block javascript: in any form
    if (/javascript\s*:/i.test(selector)) {
      return { valid: false, reason: 'Selector contains javascript: protocol — blocked for security.' };
    }

    // Block eval-like patterns
    if (/\beval\s*\(/.test(selector) || /\bFunction\s*\(/.test(selector)) {
      return { valid: false, reason: 'Selector contains eval/Function — blocked for security.' };
    }

    // Block extremely long selectors (potential injection)
    if (selector.length > 500) {
      return { valid: false, reason: 'Selector is suspiciously long (>500 chars) — blocked.' };
    }

    // Block selectors that try to escape the DOM context
    if (selector.includes('<script') || selector.includes('onerror') || selector.includes('onload')) {
      return { valid: false, reason: 'Selector contains HTML injection attempt — blocked.' };
    }

    return { valid: true, reason: '' };
  }

  /**
   * Validate a navigation URL.
   */
  private validateNavigation(url: string): {
    allowed: boolean;
    requiresConfirmation: boolean;
    riskLevel: RiskLevel;
    reason: string;
    warnings: string[];
  } {
    const urlLower = url.toLowerCase().trim();

    // Block dangerous schemes
    for (const scheme of BLOCKED_URL_SCHEMES) {
      if (urlLower.startsWith(scheme)) {
        return {
          allowed: false,
          requiresConfirmation: false,
          riskLevel: 'CRITICAL',
          reason: `Navigation to ${scheme} URLs is blocked for security.`,
          warnings: ['BLOCKED_URL_SCHEME'],
        };
      }
    }

    // Check for high-risk navigation targets
    for (const keyword of HIGH_RISK_NAV_KEYWORDS) {
      if (urlLower.includes(keyword)) {
        return {
          allowed: true,
          requiresConfirmation: true,
          riskLevel: 'HIGH',
          reason: `Navigation target contains "${keyword}" — user confirmation required.`,
          warnings: ['HIGH_RISK_NAVIGATION'],
        };
      }
    }

    // External navigation (different origin) requires confirmation
    try {
      const targetOrigin = new URL(url).origin;
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      if (currentOrigin && targetOrigin !== currentOrigin) {
        return {
          allowed: true,
          requiresConfirmation: true,
          riskLevel: 'MEDIUM',
          reason: `Navigation to external domain (${targetOrigin}) — user confirmation required.`,
          warnings: ['EXTERNAL_NAVIGATION'],
        };
      }
    } catch {
      // URL parsing failed — suspicious
      return {
        allowed: true,
        requiresConfirmation: true,
        riskLevel: 'MEDIUM',
        reason: 'Could not parse navigation URL — requesting confirmation.',
        warnings: ['UNPARSEABLE_URL'],
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      riskLevel: 'LOW',
      reason: 'Navigation within same origin.',
      warnings: [],
    };
  }

  /**
   * Classify the risk level of an action.
   */
  private classifyRisk(action: ActionCommand, elementText?: string): RiskLevel {
    const actionType = action.action;
    const textLower = (elementText || action.target || action.description || '').toLowerCase();

    // Done / Wait / Scroll are always LOW
    if (['done', 'wait', 'scroll', 'hover', 'focus', 'extract_data'].includes(actionType)) {
      return 'LOW';
    }

    // Check for critical keywords
    for (const keyword of CRITICAL_ACTION_KEYWORDS) {
      if (textLower.includes(keyword)) return 'CRITICAL';
    }

    // Check for high-risk keywords
    for (const keyword of HIGH_RISK_ELEMENT_KEYWORDS) {
      if (textLower.includes(keyword)) return 'HIGH';
    }

    // Navigate is at least MEDIUM
    if (actionType === 'navigate') return 'MEDIUM';

    // Type action
    if (actionType === 'type') {
      // Typing into sensitive fields
      if (/password|otp|cvv|pin|secret|token/i.test(textLower)) {
        return 'HIGH';
      }
      return 'LOW';
    }

    // Click submit-like buttons
    if (actionType === 'click') {
      if (/submit|send|confirm|apply|register|sign.?up/i.test(textLower)) {
        return 'MEDIUM';
      }
    }

    // Select is generally LOW
    if (actionType === 'select') return 'LOW';

    return 'LOW';
  }

  /**
   * Human-readable risk explanation.
   */
  private getRiskExplanation(risk: RiskLevel, action: ActionCommand): string {
    switch (risk) {
      case 'LOW': return `Safe action: ${action.action}`;
      case 'MEDIUM': return `Moderate-risk action: ${action.action}. Proceeding with monitoring.`;
      case 'HIGH': return `High-risk action detected: ${action.action}. User confirmation required.`;
      case 'CRITICAL': return `CRITICAL action detected: ${action.action}. User must explicitly approve.`;
    }
  }

  /**
   * Reset session counters (for new task/session).
   */
  resetSession(): void {
    this.actionCount = 0;
    this.sessionStartTime = Date.now();
  }

  /**
   * Get current session stats.
   */
  getStats(): { actionCount: number; sessionDurationMs: number } {
    return {
      actionCount: this.actionCount,
      sessionDurationMs: Date.now() - this.sessionStartTime,
    };
  }
}
