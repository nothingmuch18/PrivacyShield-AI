/**
 * PrivacyShield AI — Dynamic Policy Engine Types
 *
 * Defines configuration schemas, user profiles, domain overrides,
 * and contextual evaluation decisions.
 *
 * Designed for MV3 extensions with fail-closed security.
 */

export type ActiveProfile = 'strict' | 'balanced' | 'performance';

export type ExecutionRoute = 'local_slm' | 'cloud_vlm';

export type RedactionLevel = 'extreme' | 'standard' | 'minimal';

export interface DomainOverride {
  /** Glob or wildcard pattern, e.g. " *.chase.com\, \*.hdfcbank.com\, \*.gov.in\ */
 pattern: string;
 /** Optional profile to force for this domain */
 forcedProfile?: ActiveProfile;
 /** Execution route override */
 executionRoute?: ExecutionRoute;
 /** Redaction level override */
 redactionLevel?: RedactionLevel;
 /** Force human approval for all or certain actions on this domain */
 requiresHumanApproval?: boolean;
 /** Reason for policy escalation / override */
 reason?: string;
}

export interface TaskHeuristicRule {
 /** Descriptive identifier */
 id: string;
 /** Keywords in prompt or target that trigger this escalation */
 keywords: string[];
 /** Force human approval when matched */
 escalateApproval: boolean;
 /** Force execution route */
 forcedRoute?: ExecutionRoute;
 /** Force redaction level */
 forcedRedaction?: RedactionLevel;
 /** Audit reason */
 reason: string;
}

export interface PolicyProfileConfig {
 name: string;
 description: string;
 defaultRoute: ExecutionRoute;
 redactionLevel: RedactionLevel;
 requiresHumanApprovalFor: string[];
}

export interface PolicyConfig {
 /** Active baseline user profile */
 activeProfile: ActiveProfile;
 /** User-defined and preset domain overrides */
 domainOverrides: DomainOverride[];
 /** Task heuristic rules for prompt / intent interception */
 taskHeuristics: TaskHeuristicRule[];
 /** Timestamp of last config update */
 lastUpdated: number;
}

export interface PolicyDecision {
 /** Where to route the agent inference */
 executionRoute: ExecutionRoute;
 /** How aggressively to redact screen and DOM */
 redactionLevel: RedactionLevel;
 /** Whether the next step / action requires explicit user confirmation */
 requiresHumanApproval: boolean;
 /** Active profile name after evaluation */
 effectiveProfile: ActiveProfile;
 /** Why this policy decision was made */
 reasons: string[];
 /** Whether a domain override was triggered */
 domainOverrideActive: boolean;
 /** Whether a task heuristic escalation occurred */
 heuristicTriggered: boolean;
 /** Evaluation timestamp */
 evaluatedAt: number;
}
