# PrivacyShield AI — Security Policy & Controls

**Standard:** Manifest V3 Security Best Practices, OWASP Top 10 for LLMs, Zero-Trust Perception  
**Repository:** `PrivacyShield AI — SIH26171`  

---

## 1. Zero-Trust VLM Philosophy

PrivacyShield AI treats the AI model as an **untrusted reasoning agent**. The AI model is provided solely with:
1. Anonymized, redacted viewport screenshots with black bounding overlays.
2. Abstracted DOM accessibility trees stripped of form values and credential attributes.
3. Pseudonymized replacement tokens (e.g. `[AADHAAR_1]`, `[EMAIL_1]`).

Under no circumstances is raw user input or unredacted visuals shared with third-party inference endpoints.

---

## 2. Mandatory Security Controls

### 2.1 Content Security & Script Injection Mitigation
* Extension execution strictly obeys Manifest V3 guarantees.
* Content scripts and offscreen documents are strictly bundled as self-contained IIFE modules using `esbuild`. No remote code loading is permitted (`unsafe-eval` is disabled).
* All actions executed by the agent pass through `ActionValidator.validateSelector()` and `ActionValidator.validateNavigation()` to disallow `javascript:`, `data:`, and DOM clobbering.

### 2.2 Network Security & Firewall
* Outbound REST requests from `AgentController` must pass `PrivacyGate.scan()`.
* If unredacted PII or secret patterns (Aadhaar, PAN, Card Numbers, JWTs, API Keys) match the outbound payload, the network request is aborted immediately with `allowed: false`.

### 2.3 Destructive Action Gating
* Clicks or submissions targeting payment gateways, balance transfers, deletion dialogues, or sensitive settings are categorized as `HIGH` or `CRITICAL`.
* High-risk actions halt automation until user explicitly approves the operation.

---

## 3. Reporting a Vulnerability

If you discover a potential privacy bypass or security defect:
1. Open an issue flagged with `[Security Review]`.
2. Provide reproducible steps on a test page (without transmitting real personal credentials).
