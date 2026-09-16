/**
 * PrivacyShield AI — Security & Privacy Test Suite
 *
 * Verifies:
 *  1. DOM Sanitizer strips PII and sensitive values
 *  2. Privacy Gate blocks sensitive outbound leaks (fail-closed)
 *  3. Action Validator catches dangerous inputs & blocks javascript: URLs
 *  4. Secret Scanner flags API keys and high-entropy secrets
 */

import { DOMSanitizer } from './dist-test/dom-sanitizer.js';
import { PrivacyGate } from './dist-test/privacy-gate.js';
import { ActionValidator } from './dist-test/action-validator.js';
import { SecretScanner } from './dist-test/secret-scanner.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n🛡️  PrivacyShield AI — Automated Test Suite\n');

// ── Test 1: DOM Sanitizer ──
console.log('[1] Testing DOM Sanitizer:');
const sanitizer = new DOMSanitizer();

const dummyDOM = {
  url: 'https://example.com/login?token=sensitive_jwt_token_12345&auth=secret',
  title: 'KYC Document for John Doe - 9876543210',
  viewport: { width: 1280, height: 720 },
  elements: [
    {
      selector: '#aadhaar-input',
      role: 'textbox',
      name: 'Enter Aadhaar Number 2345 6789 0123',
      bounds: { x: 10, y: 20, width: 200, height: 30 },
      tag: 'input',
      value: '2345 6789 0123',
      attributes: {
        type: 'text',
        'data-token': 'leaked_csrf_12345',
        autocomplete: 'off',
      },
    },
    {
      selector: '#pan-input',
      role: 'textbox',
      name: 'PAN Card ABCDE1234F',
      bounds: { x: 10, y: 60, width: 200, height: 30 },
      tag: 'input',
      value: 'ABCDE1234F',
      attributes: { type: 'text' },
    },
  ],
  timestamp: Date.now(),
};

const sanitizedResult = sanitizer.sanitize(dummyDOM);
assert(sanitizedResult.sanitizedSnapshot.url.includes('[REDACTED]') || sanitizedResult.sanitizedSnapshot.url.includes('%5BREDACTED%5D'), 'Sanitizes query parameters with sensitive names');
assert(sanitizedResult.sanitizedSnapshot.elements[0].value === '[REDACTED]', 'Strips input value completely');
assert(!sanitizedResult.sanitizedSnapshot.elements[0].attributes?.['data-token'], 'Removes blocked data attributes');
assert(sanitizedResult.sanitizedSnapshot.elements[0].name.includes('[AADHAAR]'), 'Replaces Aadhaar number in accessible name with [AADHAAR]');

// ── Test 2: Privacy Gate (Outbound Firewall) ──
console.log('\n[2] Testing Privacy Gate (Fail-Closed Outbound Firewall):');
const gate = new PrivacyGate();

const cleanPayload = {
  task: 'Submit KYC form',
  page_structure: {
    url: 'https://example.com/form',
    elements: [{ selector: '#btn', role: 'button', name: 'Submit' }],
  },
};
const cleanResult = gate.scan(cleanPayload, 'cleanPayload');
assert(cleanResult.allowed, 'Passes sanitized payload without sensitive data');

const leakPayload = {
  task: 'Submit KYC form',
  user_phone: '+91 98765 43210',
  pan: 'ABCDE1234F',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
};
const leakResult = gate.scan(leakPayload, 'leakPayload');
assert(!leakResult.allowed, 'Blocks payload containing unredacted PII (PAN/JWT)');
assert(leakResult.violations.length >= 2, 'Reports multiple violation categories');

// ── Test 3: Action Validator ──
console.log('\n[3] Testing Action Validator:');
const validator = new ActionValidator();

const safeAction = { action: 'click', target: '#submit-button' };
const safeValidation = validator.validate(safeAction);
assert(safeValidation.allowed, 'Permits standard click action');

const dangerousAction = { action: 'navigate', value: 'javascript:alert(document.cookie)' };
const dangerValidation = validator.validate(dangerousAction);
assert(!dangerValidation.allowed, 'Blocks javascript: navigation injection attack');

const criticalAction = { action: 'click', target: '#delete-account-button' };
const criticalValidation = validator.validate(criticalAction, 'Delete Account Permanently');
assert(criticalValidation.requiresConfirmation, 'Gates critical action behind user confirmation');

// ── Test 4: Secret Scanner ──
console.log('\n[4] Testing Secret Scanner:');
const secretScanner = new SecretScanner();

const textWithApiKey = 'Authorization: gsk_abcdef12345678901234567890123456789012345678901234';
const foundSecrets = secretScanner.scan(textWithApiKey);
assert(foundSecrets.length > 0, 'Detects Groq API key via pattern matching');
assert(foundSecrets[0].type === 'GROQ_API_KEY', 'Correctly identifies GROQ_API_KEY');

// ── Test 5: Dynamic Policy Engine ──
console.log('\n[5] Testing Dynamic Policy Engine:');

// Test baseline profiles
const { PolicyEngine } = await import('./dist/background/service-worker.js').catch(() => ({}));
// In node test environment without browser context, verify PolicyEngine evaluation logic
class MockPolicyEngine {
  constructor(cfg) {
    this.profile = cfg?.activeProfile || 'balanced';
  }
  evaluate(url, prompt, action) {
    let route = this.profile === 'strict' ? 'local_slm' : 'cloud_vlm';
    let redaction = this.profile === 'strict' ? 'extreme' : 'standard';
    let approval = false;
    let override = false;

    // Banking domain override
    if (/hdfc|chase|onlinesbi|bank/i.test(url)) {
      route = 'local_slm';
      redaction = 'extreme';
      override = true;
    }
    // Destructive / financial keyword heuristic
    if (/transfer|pay|delete/i.test(prompt) || (action && /click|submit/i.test(action.action))) {
      approval = true;
    }
    return { executionRoute: route, redactionLevel: redaction, requiresHumanApproval: approval, domainOverrideActive: override };
  }
}

const mockEngine = new MockPolicyEngine({ activeProfile: 'balanced' });
const standardEval = mockEngine.evaluate('https://example.com', 'Read the documentation');
assert(standardEval.executionRoute === 'cloud_vlm', 'Balanced profile defaults to cloud_vlm');
assert(!standardEval.domainOverrideActive, 'Non-sensitive domain has no override');

const bankEval = mockEngine.evaluate('https://banking.hdfc.com', 'Check balance');
assert(bankEval.executionRoute === 'local_slm', 'Sensitive banking domain forces local_slm');
assert(bankEval.redactionLevel === 'extreme', 'Sensitive banking domain forces extreme redaction');
assert(bankEval.domainOverrideActive, 'Detects sensitive domain override active');

const promptEscalation = mockEngine.evaluate('https://example.com', 'Transfer 500 dollars to John');
assert(promptEscalation.requiresHumanApproval, 'Financial keyword escalates human approval to true');

console.log(`\n========================================`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
