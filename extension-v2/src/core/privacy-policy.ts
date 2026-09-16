/**
 * PrivacyShield AI — Privacy Policy Engine
 *
 * Configurable, per-domain privacy policies that control detection,
 * redaction, and transmission behavior. Centralizes all privacy
 * decisions rather than hardcoding them throughout the codebase.
 */

// ═══════════════════════════════════════════════════════════════
//  DATA CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

export type DataClassification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'PERSONAL'
  | 'SENSITIVE_PERSONAL'
  | 'AUTHENTICATION_SECRET'
  | 'BIOMETRIC'
  | 'FINANCIAL'
  | 'HEALTH'
  | 'RESTRICTED';

export type RedactionAction =
  | 'ALLOW'        // Transmit as-is
  | 'MASK'         // Replace with [TYPE] token
  | 'BLUR'         // Gaussian blur (visual only)
  | 'REPLACE'      // Replace with synthetic data
  | 'REMOVE'       // Remove entirely from payload
  | 'BLOCK'        // Block the entire payload
  | 'NEVER_CAPTURE'; // Don't even capture this data

// ═══════════════════════════════════════════════════════════════
//  PII CATEGORY → CLASSIFICATION MAPPING
// ═══════════════════════════════════════════════════════════════

export const DATA_CLASSIFICATION_MAP: Record<string, DataClassification> = {
  // Biometric
  FACE: 'BIOMETRIC',

  // Identity Documents (India)
  AADHAAR: 'RESTRICTED',
  PAN: 'SENSITIVE_PERSONAL',
  VOTER_ID: 'SENSITIVE_PERSONAL',
  DRIVING_LICENSE: 'SENSITIVE_PERSONAL',
  PASSPORT: 'RESTRICTED',

  // Financial
  CREDIT_CARD: 'FINANCIAL',
  DEBIT_CARD: 'FINANCIAL',
  ACCOUNT_NUMBER: 'FINANCIAL',
  IFSC: 'FINANCIAL',
  UPI_ID: 'FINANCIAL',
  IBAN: 'FINANCIAL',
  SSN: 'RESTRICTED',

  // Personal
  EMAIL: 'PERSONAL',
  PHONE: 'PERSONAL',
  NAME: 'PERSONAL',
  DOB: 'PERSONAL',
  ADDRESS: 'PERSONAL',
  PIN_CODE: 'PERSONAL',

  // Auth
  PASSWORD: 'AUTHENTICATION_SECRET',
  OTP: 'AUTHENTICATION_SECRET',
  API_KEY: 'AUTHENTICATION_SECRET',
  JWT_TOKEN: 'AUTHENTICATION_SECRET',
  SESSION_ID: 'AUTHENTICATION_SECRET',
  OAUTH_TOKEN: 'AUTHENTICATION_SECRET',
  PRIVATE_KEY: 'AUTHENTICATION_SECRET',
  AWS_KEY: 'AUTHENTICATION_SECRET',
  CLOUD_CREDENTIAL: 'AUTHENTICATION_SECRET',

  // Health
  MEDICAL: 'HEALTH',
  PATIENT_ID: 'HEALTH',

  // Other
  CONFIDENTIAL: 'RESTRICTED',
  UNKNOWN: 'INTERNAL',
};

// ═══════════════════════════════════════════════════════════════
//  PRIVACY POLICY
// ═══════════════════════════════════════════════════════════════

export interface PrivacyPolicy {
  name: string;
  description: string;

  /** Default action for each PII type */
  rules: Record<string, RedactionAction>;

  /** Actions that require user confirmation */
  confirmActions: string[];

  /** Actions that are completely blocked */
  blockedActions: string[];

  /** Maximum risk level allowed without confirmation */
  maxAutoRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ═══════════════════════════════════════════════════════════════
//  BUILT-IN POLICIES
// ═══════════════════════════════════════════════════════════════

const STRICT_POLICY: PrivacyPolicy = {
  name: 'STRICT',
  description: 'Maximum privacy — suitable for government, banking, healthcare portals',
  rules: {
    FACE: 'BLUR',
    AADHAAR: 'MASK',
    PAN: 'MASK',
    VOTER_ID: 'MASK',
    DRIVING_LICENSE: 'MASK',
    PASSPORT: 'MASK',
    CREDIT_CARD: 'MASK',
    DEBIT_CARD: 'MASK',
    ACCOUNT_NUMBER: 'MASK',
    IFSC: 'MASK',
    UPI_ID: 'MASK',
    IBAN: 'MASK',
    SSN: 'MASK',
    EMAIL: 'MASK',
    PHONE: 'MASK',
    NAME: 'MASK',
    DOB: 'MASK',
    ADDRESS: 'MASK',
    PIN_CODE: 'MASK',
    PASSWORD: 'NEVER_CAPTURE',
    OTP: 'NEVER_CAPTURE',
    API_KEY: 'NEVER_CAPTURE',
    JWT_TOKEN: 'NEVER_CAPTURE',
    SESSION_ID: 'REMOVE',
    OAUTH_TOKEN: 'NEVER_CAPTURE',
    PRIVATE_KEY: 'NEVER_CAPTURE',
    AWS_KEY: 'NEVER_CAPTURE',
    CLOUD_CREDENTIAL: 'NEVER_CAPTURE',
    MEDICAL: 'MASK',
    PATIENT_ID: 'MASK',
    CONFIDENTIAL: 'MASK',
  },
  confirmActions: ['submit', 'navigate', 'download', 'upload'],
  blockedActions: ['type_sensitive_data'],
  maxAutoRiskLevel: 'LOW',
};

const STANDARD_POLICY: PrivacyPolicy = {
  name: 'STANDARD',
  description: 'Balanced privacy — suitable for general browsing',
  rules: {
    FACE: 'BLUR',
    AADHAAR: 'MASK',
    PAN: 'MASK',
    CREDIT_CARD: 'MASK',
    ACCOUNT_NUMBER: 'MASK',
    PASSWORD: 'NEVER_CAPTURE',
    OTP: 'NEVER_CAPTURE',
    API_KEY: 'NEVER_CAPTURE',
    JWT_TOKEN: 'NEVER_CAPTURE',
    SESSION_ID: 'REMOVE',
    EMAIL: 'MASK',
    PHONE: 'MASK',
    NAME: 'ALLOW',
    DOB: 'MASK',
    ADDRESS: 'MASK',
    MEDICAL: 'MASK',
  },
  confirmActions: ['submit', 'download'],
  blockedActions: [],
  maxAutoRiskLevel: 'MEDIUM',
};

const DEVELOPMENT_POLICY: PrivacyPolicy = {
  name: 'DEVELOPMENT',
  description: 'Minimal privacy — for local testing with synthetic data only',
  rules: {
    FACE: 'BLUR',
    PASSWORD: 'NEVER_CAPTURE',
    OTP: 'NEVER_CAPTURE',
    API_KEY: 'NEVER_CAPTURE',
  },
  confirmActions: [],
  blockedActions: [],
  maxAutoRiskLevel: 'HIGH',
};

export const BUILT_IN_POLICIES: Record<string, PrivacyPolicy> = {
  STRICT: STRICT_POLICY,
  STANDARD: STANDARD_POLICY,
  DEVELOPMENT: DEVELOPMENT_POLICY,
};

// ═══════════════════════════════════════════════════════════════
//  DOMAIN → POLICY MAPPING
// ═══════════════════════════════════════════════════════════════

const DOMAIN_POLICY_MAP: Record<string, string> = {
  // Government / sensitive
  'gov.in': 'STRICT',
  'nic.in': 'STRICT',
  'india.gov.in': 'STRICT',
  'uidai.gov.in': 'STRICT',
  'incometax.gov.in': 'STRICT',
  'digilocker.gov.in': 'STRICT',

  // Banking
  'onlinesbi.sbi': 'STRICT',
  'netbanking': 'STRICT',
  'banking': 'STRICT',

  // Healthcare
  'hospital': 'STRICT',
  'health': 'STRICT',
  'medical': 'STRICT',

  // Demo/local
  'localhost': 'DEVELOPMENT',
  '127.0.0.1': 'DEVELOPMENT',
};

// ═══════════════════════════════════════════════════════════════
//  POLICY ENGINE
// ═══════════════════════════════════════════════════════════════

export class PrivacyPolicyEngine {
  private currentPolicy: PrivacyPolicy;
  private customPolicies: Record<string, PrivacyPolicy> = {};

  constructor(defaultPolicyName: string = 'STANDARD') {
    this.currentPolicy = BUILT_IN_POLICIES[defaultPolicyName] || STANDARD_POLICY;
  }

  /**
   * Get the appropriate policy for a given domain.
   */
  getPolicyForDomain(domain: string): PrivacyPolicy {
    // Check exact domain match
    if (this.customPolicies[domain]) return this.customPolicies[domain];

    // Check suffix matches
    for (const [pattern, policyName] of Object.entries(DOMAIN_POLICY_MAP)) {
      if (domain.includes(pattern)) {
        return BUILT_IN_POLICIES[policyName] || this.currentPolicy;
      }
    }

    return this.currentPolicy;
  }

  /**
   * Get the redaction action for a PII type under the current policy.
   */
  getRedactionAction(piiType: string, domain?: string): RedactionAction {
    const policy = domain ? this.getPolicyForDomain(domain) : this.currentPolicy;
    return policy.rules[piiType] || 'MASK'; // Default to MASK for unknown types
  }

  /**
   * Check if an action requires user confirmation under the current policy.
   */
  requiresConfirmation(actionType: string, domain?: string): boolean {
    const policy = domain ? this.getPolicyForDomain(domain) : this.currentPolicy;
    return policy.confirmActions.includes(actionType);
  }

  /**
   * Check if an action is blocked under the current policy.
   */
  isActionBlocked(actionType: string, domain?: string): boolean {
    const policy = domain ? this.getPolicyForDomain(domain) : this.currentPolicy;
    return policy.blockedActions.includes(actionType);
  }

  /**
   * Set a custom per-domain policy.
   */
  setDomainPolicy(domain: string, policy: PrivacyPolicy): void {
    this.customPolicies[domain] = policy;
  }

  /**
   * Switch the default active policy.
   */
  setActivePolicy(policyName: string): void {
    this.currentPolicy = BUILT_IN_POLICIES[policyName] || this.currentPolicy;
  }

  getActivePolicy(): PrivacyPolicy {
    return this.currentPolicy;
  }

  getClassification(piiType: string): DataClassification {
    return DATA_CLASSIFICATION_MAP[piiType] || 'INTERNAL';
  }
}
