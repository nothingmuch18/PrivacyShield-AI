# PrivacyShield AI — Threat Model & Security Architecture

**Problem Statement:** On-device Visual Perception for Light-weight Browser Agents (SIH26171 — ISRO)  
**Classification:** Defensive Security & Privacy Architecture  

---

## 1. System Overview & Trust Boundaries

PrivacyShield AI treats all external components, remote AI networks, and even the Vision-Language Model (VLM) reasoning tier as **untrusted**. Sensitive identity details, authentication tokens, financial credentials, and user PII must never cross the browser perimeter.

```
+-----------------------------------------------------------------------------------+
|                              TRUSTED CLIENT BOUNDARY                              |
|                                                                                   |
|   +-------------------+      +---------------------+      +-------------------+   |
|   |  Content Script   | ---> |   DOM Sanitizer     | ---> |   Privacy Gate    |   |
|   |  (Page Context)   |      | (Strips values/PII) |      | (Fail-Closed Out) |   |
|   +-------------------+      +---------------------+      +-------------------+   |
|             |                                                       |             |
|             v                                                       v             |
|   +-------------------+      +---------------------+                |             |
|   |  Screen Capture   | ---> |   Offscreen Engine  |                |             |
|   | (Visible Viewport)|      |  (OCR/PII/Secrets)  |                |             |
|   +-------------------+      +---------------------+                |             |
|                                         |                           |             |
|                                         +---------------------------+             |
|                                                       |                           |
+-------------------------------------------------------|---------------------------+
                                                        |
                                       Encrypted HTTPS/WSS (Sanitized Only)
                                                        |
                                                        v
+-----------------------------------------------------------------------------------+
|                             UNTRUSTED REMOTE TIER                                 |
|                                                                                   |
|   +-------------------+      +---------------------+      +-------------------+   |
|   |  FastAPI Backend  | ---> |   VLM Brain (Groq/  | ---> | Suggested Action  |   |
|   |  (Cloud Gateway)  |      |   Ollama Vision)    |      | (click/type/etc.) |   |
|   +-------------------+      +---------------------+      +-------------------+   |
+-------------------------------------------------------|---------------------------+
                                                        |
                                       Untrusted Action Response
                                                        |
                                                        v
+-----------------------------------------------------------------------------------+
|                              TRUSTED CLIENT BOUNDARY                              |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |                        Action Validator & Risk Firewall                   |   |
|   |  - Blocks javascript: and eval injection                                 |   |
|   |  - Classifies Risk: LOW / MEDIUM / HIGH / CRITICAL                        |   |
|   |  - Gates destructive operations behind explicit user confirmation         |   |
|   +---------------------------------------------------------------------------+   |
|                                         |                                         |
|                                         v                                         |
|                           [Safe Execution in Browser DOM]                         |
+-----------------------------------------------------------------------------------+
```

---

## 2. Threat Vector Analysis & Mitigations

| Threat ID | Threat Scenario | Attack Vector | PrivacyShield AI Mitigation |
| :--- | :--- | :--- | :--- |
| **TH-01** | Visual PII Leakage | Raw screenshot transmitted to cloud VLM containing PAN, Aadhaar, names, addresses | Local OCR + pattern matcher draws black redaction bounding boxes before transmission. |
| **TH-02** | Structural DOM Exfiltration | Webpage DOM elements contain form input values, passwords, session tokens | `DOMSanitizer` intercepts `GET_DOM` snapshots; strips values, sensitive data-attributes, and query string tokens. |
| **TH-03** | Residual Redaction Bypass | OCR misses faint text or nested JSON payloads leak via secondary fields | `PrivacyGate` scans serialized outbound payload across all patterns. Fails closed (blocks network payload completely). |
| **TH-04** | Malicious Agent Command Injection | Compromised or prompt-injected VLM sends `javascript:eval(...)` navigation | `ActionValidator` verifies target selectors and URL schemes. Blocks `javascript:`, `data:`, and `vbscript:`. |
| **TH-05** | Destructive Action Execution | VLM triggers "Delete Account", "Confirm Payment", or transfers funds | Risk classification classifies destructive actions as `HIGH`/`CRITICAL` and gates execution behind user modal confirmation. |
| **TH-06** | Secret & API Key Leakage | Developer credentials, JWT tokens, AWS/Groq API keys visible in viewport | `SecretScanner` runs pattern checks and Shannon entropy scoring to mask credentials as `[SECRET:...]`. |
| **TH-07** | Infinite Execution Runaway | Agent gets trapped in an execution loop or runs indefinitely | Step limiters, 5-minute session timeouts, and anti-loop detection enforce automatic stops. |

---

## 3. Defense-in-Depth Verification

* **Layer 1 (Perception):** Tesseract.js OCR, Regex tokenization, local coordinate masking.
* **Layer 2 (Structure):** `DOMSanitizer` eliminating sensitive attributes, hidden form values, and input text.
* **Layer 3 (Network Boundary):** `PrivacyGate` outbound regex & entropy auditor.
* **Layer 4 (Execution):** `ActionValidator` filtering commands, enforcing timeouts, and classifying risk.
