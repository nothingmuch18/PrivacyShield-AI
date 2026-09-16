/**
 * PrivacyShield AI — Dynamic Policy Engine
 *
 * Senior Security Architecture:
 * Provides fail-closed, contextual policy enforcement across 3 tiers:
 * 1. User Baseline Profile (Strict / Balanced / Performance)
 * 2. Domain Context (Wildcard / Glob matching for sensitive portals)
 * 3. Task Heuristics (Pre-execution prompt & intent risk escalation)
 */

import type {
  ActiveProfile,
  DomainOverride,
  PolicyConfig,
  PolicyDecision,
  PolicyProfileConfig,
  TaskHeuristicRule,
} from '../types/policy';

// ═════════════════════════════════════════════════════════════════
// 1. DEFAULT BASELINE PROFILES
// ═════════════════════════════════════════════════════════════════

export const DEFAULT_PROFILES: Record<ActiveProfile, PolicyProfileConfig> = {
  strict: {
    name: 'Maximum Security (Strict)',
    description: 'Zero data leaves device. Local SLM only, extreme redaction, mandatory human approval.',
    defaultRoute: 'local_slm',
    redactionLevel: 'extreme',
    // Human approval required for ALL actions except scrolling and reading/waiting
    requiresHumanApprovalFor: ['click', 'type', 'select', 'navigate', 'submit'],
  },
  balanced: {
    name: 'Balanced (Default)',
    description: 'Cloud VLM permitted for complex reasoning, standard PII redaction, approval for form mutations.',
    defaultRoute: 'cloud_vlm',
    redactionLevel: 'standard',
    // Human approval required only for form mutations and submissions
    requiresHumanApprovalFor: ['submit', 'type', 'click'],
  },
  performance: {
    name: 'Speed (Performance)',
    description: 'High-speed cloud inference, minimal redaction (passwords only), approval on destructive actions.',
    defaultRoute: 'cloud_vlm',
    redactionLevel: 'minimal',
    // Approval only required if destructive keywords are detected
    requiresHumanApprovalFor: [],
  },
};

// ═════════════════════════════════════════════════════════════════
// 2. PRESET SENSITIVE DOMAINS (BANKING, GOV, HEALTHCARE)
// ═════════════════════════════════════════════════════════════════

export const DEFAULT_DOMAIN_OVERRIDES: DomainOverride[] = [
  // Indian Banking & Payment Portals
  { pattern: '*banking.hdfc.com*', forcedProfile: 'strict', reason: 'High-security financial institution (HDFC)' },
  { pattern: '*hdfcbank.com*', forcedProfile: 'strict', reason: 'HDFC Banking portal' },
  { pattern: '*onlinesbi.sbi*', forcedProfile: 'strict', reason: 'High-security financial institution (SBI)' },
  { pattern: '*icicibank.com*', forcedProfile: 'strict', reason: 'High-security financial institution (ICICI)' },
  { pattern: '*axisbank.com*', forcedProfile: 'strict', reason: 'High-security financial institution (Axis Bank)' },
  { pattern: '*paytm.com*', forcedProfile: 'strict', reason: 'Financial payment portal (Paytm)' },
  { pattern: '*phonepe.com*', forcedProfile: 'strict', reason: 'Financial payment portal (PhonePe)' },

  // Global Financial Portals
  { pattern: '*chase.com*', forcedProfile: 'strict', reason: 'Banking & Financial portal (Chase)' },
  { pattern: '*bankofamerica.com*', forcedProfile: 'strict', reason: 'Banking & Financial portal (BofA)' },
  { pattern: '*wellsfargo.com*', forcedProfile: 'strict', reason: 'Banking & Financial portal (Wells Fargo)' },
  { pattern: '*paypal.com*', forcedProfile: 'strict', reason: 'Payment gateway (PayPal)' },
  { pattern: '*stripe.com*', forcedProfile: 'strict', reason: 'Payment infrastructure (Stripe)' },

  // Government & Sensitive Identity Portals
  { pattern: '*.gov.in*', forcedProfile: 'strict', reason: 'Government of India digital services portal' },
  { pattern: '*uidai.gov.in*', forcedProfile: 'strict', reason: 'Aadhaar Identity system (UIDAI)' },
  { pattern: '*incometax.gov.in*', forcedProfile: 'strict', reason: 'Tax and financial identity records' },
];

// ═════════════════════════════════════════════════════════════════
// 3. TASK HEURISTICS (RISK ESCALATION PATTERNS)
// ═════════════════════════════════════════════════════════════════

export const DEFAULT_TASK_HEURISTICS: TaskHeuristicRule[] = [
  {
    id: 'financial_transfer',
    keywords: ['transfer', 'send money', 'wire', 'pay', 'checkout', 'upi', 'neft', 'rtgs', 'imps', 'payment'],
    escalateApproval: true,
    forcedRedaction: 'extreme',
    reason: 'Financial transaction intent detected in task or action',
  },
  {
    id: 'destructive_action',
    keywords: ['delete', 'remove', 'terminate', 'cancel subscription', 'deactivate', 'wipe', 'close account', 'drop'],
    escalateApproval: true,
    reason: 'Irreversible or destructive modification intent detected',
  },
  {
    id: 'credential_exposure',
    keywords: ['password', 'otp', 'pin', 'cvv', 'secret', 'token', 'private key', 'api key', 'seed phrase'],
    escalateApproval: true,
    forcedRoute: 'local_slm',
    forcedRedaction: 'extreme',
    reason: 'Authentication credential or high-value secret handling requested',
  },
];

export const STORAGE_KEY_POLICY = 'privacyshield_policy_config';

// ═════════════════════════════════════════════════════════════════
// 4. POLICY ENGINE IMPLEMENTATION
// ═════════════════════════════════════════════════════════════════

export class PolicyEngine {
  private config: PolicyConfig;
  private isLoaded = false;

  constructor(initialConfig?: Partial<PolicyConfig>) {
    this.config = {
      activeProfile: initialConfig?.activeProfile || 'balanced',
      domainOverrides: initialConfig?.domainOverrides || DEFAULT_DOMAIN_OVERRIDES,
      taskHeuristics: initialConfig?.taskHeuristics || DEFAULT_TASK_HEURISTICS,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Initializes policy configuration from Chrome Sync Storage with Local Storage fallback.
   * Auto-listens for changes so policies update in real-time across components without reload.
   */
  async init(): Promise<void> {
    try {
      const stored = await this.readStorage();
      if (stored) {
        this.config = { ...this.config, ...stored };
      }
      this.isLoaded = true;

      // Listen for runtime updates from Options UI or Popup
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if ((areaName === 'sync' || areaName === 'local') && changes[STORAGE_KEY_POLICY]) {
            const newConfig = changes[STORAGE_KEY_POLICY].newValue;
            if (newConfig) {
              console.log('[PolicyEngine] Dynamic policy configuration updated:', newConfig);
              this.config = { ...this.config, ...newConfig };
            }
          }
        });
      }
    } catch (err) {
      console.error('[PolicyEngine] Error during init — defaulting to Maximum Security (fail-closed):', err);
      this.config.activeProfile = 'strict';
    }
  }

  /**
   * Evaluates the active environment, domain, user prompt, and proposed action.
   * FAIL-CLOSED: Any exception defaults to strict Maximum Security mode.
   */
  evaluateContext(
    url: string = '',
    userPrompt: string = '',
    proposedAction?: { action: string; target?: string; value?: string }
  ): PolicyDecision {
    const evaluatedAt = Date.now();
    const reasons: string[] = [];

    try {
      const activeBaseline = this.config.activeProfile || 'balanced';
      let effectiveProfile: ActiveProfile = activeBaseline;
      const baseProfileConfig = DEFAULT_PROFILES[activeBaseline] || DEFAULT_PROFILES.strict;

      let executionRoute = baseProfileConfig.defaultRoute;
      let redactionLevel = baseProfileConfig.redactionLevel;
      let requiresHumanApproval = false;
      let domainOverrideActive = false;
      let heuristicTriggered = false;

      // ── Step 1: Check Domain Context (Overrides) ──
      const domainMatch = this.findMatchingDomainRule(url);
      if (domainMatch) {
        domainOverrideActive = true;
        reasons.push('Domain rule triggered for pattern "' + domainMatch.pattern + '": ' + (domainMatch.reason || 'Restricted domain'));

        if (domainMatch.forcedProfile) {
          effectiveProfile = domainMatch.forcedProfile;
          const forcedCfg = DEFAULT_PROFILES[effectiveProfile];
          executionRoute = forcedCfg.defaultRoute;
          redactionLevel = forcedCfg.redactionLevel;
        }

        if (domainMatch.executionRoute) {
          executionRoute = domainMatch.executionRoute;
        }
        if (domainMatch.redactionLevel) {
          redactionLevel = domainMatch.redactionLevel;
        }
        if (domainMatch.requiresHumanApproval !== undefined) {
          requiresHumanApproval = domainMatch.requiresHumanApproval;
        }
      }

      // ── Step 2: Evaluate Proposed Action against Profile Rules ──
      const currentProfileConfig = DEFAULT_PROFILES[effectiveProfile] || DEFAULT_PROFILES.strict;
      if (proposedAction) {
        const actionType = (proposedAction.action || '').toLowerCase();
        if (currentProfileConfig.requiresHumanApprovalFor.includes(actionType)) {
          requiresHumanApproval = true;
          reasons.push('Action "' + actionType + '" requires human approval under "' + currentProfileConfig.name + '"');
        }
      }

      // ── Step 3: Evaluate Task & Intent Heuristics (Risk Escalation) ──
      const combinedInput = (userPrompt + ' ' + (proposedAction?.target || '') + ' ' + (proposedAction?.value || '')).toLowerCase();

      for (const rule of this.config.taskHeuristics) {
        const matched = rule.keywords.some((kw) => combinedInput.includes(kw.toLowerCase()));
        if (matched) {
          heuristicTriggered = true;
          reasons.push('Risk escalation [' + rule.id + ']: ' + rule.reason);

          if (rule.escalateApproval) {
            requiresHumanApproval = true;
          }
          if (rule.forcedRoute) {
            executionRoute = rule.forcedRoute;
          }
          if (rule.forcedRedaction) {
            redactionLevel = this.escalateRedaction(redactionLevel, rule.forcedRedaction);
          }
        }
      }

      // If no custom reason recorded, add baseline profile info
      if (reasons.length === 0) {
        reasons.push('Evaluated under baseline profile: ' + currentProfileConfig.name);
      }

      return {
        executionRoute,
        redactionLevel,
        requiresHumanApproval,
        effectiveProfile,
        reasons,
        domainOverrideActive,
        heuristicTriggered,
        evaluatedAt,
      };
    } catch (err) {
      console.error('[PolicyEngine] Critical evaluation failure. Falling back to Maximum Security (fail-closed):', err);
      return {
        executionRoute: 'local_slm',
        redactionLevel: 'extreme',
        requiresHumanApproval: true,
        effectiveProfile: 'strict',
        reasons: ['FAIL-CLOSED: Context evaluation failed; Maximum Security enforced'],
        domainOverrideActive: false,
        heuristicTriggered: true,
        evaluatedAt,
      };
    }
  }

  /**
   * Helper: Matches URL hostname or href against wildcard/glob patterns.
   */
  private findMatchingDomainRule(url: string): DomainOverride | null {
    if (!url) return null;
    let target = url.toLowerCase();
    try {
      const parsed = new URL(url);
      target = parsed.hostname.toLowerCase();
    } catch {
      // url might be partial or custom string
    }

    for (const rule of this.config.domainOverrides) {
      if (this.matchWildcard(target, rule.pattern.toLowerCase()) || this.matchWildcard(url.toLowerCase(), rule.pattern.toLowerCase())) {
        return rule;
      }
    }
    return null;
  }

  private matchWildcard(str: string, pattern: string): boolean {
    const escaped = pattern.split('*').map(s => s.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&')).join('.*');
    return new RegExp('^' + escaped + '$', 'i').test(str);
  }

  private escalateRedaction(current: RedactionLevel, target: RedactionLevel): RedactionLevel {
    const rank: Record<RedactionLevel, number> = { minimal: 1, standard: 2, extreme: 3 };
    return rank[target] > rank[current] ? target : current;
  }

  private async readStorage(): Promise<Partial<PolicyConfig> | null> {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve(null);
        return;
      }
      const storageArea = chrome.storage.sync || chrome.storage.local;
      storageArea.get([STORAGE_KEY_POLICY], (result) => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.get([STORAGE_KEY_POLICY], (localRes) => {
            resolve(localRes?.[STORAGE_KEY_POLICY] || null);
          });
        } else {
          resolve(result?.[STORAGE_KEY_POLICY] || null);
        }
      });
    });
  }

  async updateConfig(partial: Partial<PolicyConfig>): Promise<PolicyConfig> {
    this.config = {
      ...this.config,
      ...partial,
      lastUpdated: Date.now(),
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storageArea = chrome.storage.sync || chrome.storage.local;
      await new Promise((resolve) => {
        storageArea.set({ [STORAGE_KEY_POLICY]: this.config }, () => {
          chrome.storage.local.set({ [STORAGE_KEY_POLICY]: this.config }, () => resolve(true));
        });
      });
    }

    return this.config;
  }

  getConfig(): PolicyConfig {
    return { ...this.config };
  }
}
