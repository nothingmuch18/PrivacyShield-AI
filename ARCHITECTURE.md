# PrivacyShield AI — System Architecture & Data Flow

**Topic:** On-device Visual Perception for Light-weight Browser Agents  
**ISRO Problem Statement:** SIH26171  

---

## High-Level Component Diagram

```
+-------------------------------------------------------------------------------------------------+
|                                    CHROME BROWSER ENVIRONMENT                                    |
|                                                                                                 |
|   +--------------------------+       +-------------------------+       +--------------------+   |
|   |       POPUP / UI         | <---> |   BACKGROUND SERVICE    | <---> |     SIDE PANEL     |   |
|   |  - Pipeline toggle       |       |         WORKER          |       |  - Goal monitoring |   |
|   |  - Quick stats           |       |  - Lifecycle management |       |  - Live reasoning  |   |
|   +--------------------------+       |  - Action dispatch      |       |  - Privacy metrics |   |
|                                      +-------------------------+       +--------------------+   |
|                                            ^             ^                                      |
|                                            |             |                                      |
|                                            v             v                                      |
|                             +--------------------+  +--------------------+                      |
|                             |  OFFSCREEN ENGINE  |  |   CONTENT SCRIPT   |                      |
|                             |  - Hidden Canvas   |  |  - DOM Extraction  |                      |
|                             |  - Tesseract OCR   |  |  - DOM Sanitizer   |                      |
|                             |  - Secret Scanner  |  |  - Action Executor |                      |
|                             |  - Redaction Draw  |  +--------------------+                      |
|                             +--------------------+                                              |
+-------------------------------------------------------------------------------------------------+
                                               |
                                     Privacy Gate Firewall
                                      (Fail-Closed Check)
                                               |
                                               v
+-------------------------------------------------------------------------------------------------+
|                                     FASTAPI SERVER (PORT 8000)                                  |
|                                                                                                 |
|   +-------------------------+       +--------------------------+       +--------------------+   |
|   |     REST / WS API       | ----> |     Smart Preprocessor   | ----> |  VLM Inference     |   |
|   |  - /api/analyze         |       |  - Anti-loop detector    |       |  - Groq API        |   |
|   |  - /api/chat            |       |  - Deterministic forms   |       |  - Ollama local    |   |
|   |  - /ws/agent            |       +--------------------------+       +--------------------+   |
+-------------------------------------------------------------------------------------------------+
```

---

## 1. Extension Modules (`extension-v2`)

* **`src/content/content.ts`**: Extracts interactive elements, applies `DOMSanitizer` to scrub values and sensitive tokens, executes validated actions from the AI server.
* **`src/offscreen/offscreen.ts`**: Runs offscreen canvas operations, executes OCR text extraction via Tesseract.js, scans for credentials using `SecretScanner`, and draws redaction boxes over sensitive regions.
* **`src/core/dom-sanitizer.ts`**: Strips passwords, credit card inputs, Aadhaar/PAN markers, query string parameters, and sensitive DOM data before exfiltration.
* **`src/core/privacy-gate.ts`**: Outbound network barrier. Intercepts serialized payload right before transmission and blocks payload if unredacted PII is detected.
* **`src/core/action-validator.ts`**: Protects against malicious agent actions, blocks dangerous URI schemes (`javascript:`), validates CSS selectors, and classifies action risk.
* **`src/core/secret-scanner.ts`**: Dual regex and Shannon entropy scanner for API keys, bearer tokens, private keys, and cloud credentials.
* **`src/core/privacy-policy.ts`**: Configurable per-domain redaction rules and safety policies (e.g., banking domains get `STRICT` privacy policies).
* **`src/background/agent-controller.ts`**: Orchestrates client-server communication, binds `PrivacyGate`, and relays telemetry to the Side Panel.

---

## 2. Server Architecture (`server`)

* **FastAPI Backend (`server/main.py`)**: Asynchronous endpoint providing rate limiting, origin checks, anti-loop detection, and VLM connectivity.
* **VLM Integration**: Seamlessly switches between Cloud Groq API (`llama-3.2-11b-vision-preview`) and Local Ollama instances.
* **Deterministic Fallback Engine**: Employs rule-based DOM parsing for common workflows (forms, submit actions) to minimize latency and cloud API costs.
