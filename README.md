# PrivacyShield AI (SIH26171)

**On-device Visual Perception for Light-weight Browser Agents**  
*SIH Problem Statement SIH26171 — Indian Space Research Organisation (ISRO)*

PrivacyShield AI is an industry-grade, security-first, privacy-preserving browser automation platform. It enables remote Vision-Language Models (VLMs) to navigate and interact with web pages **without ever seeing or receiving the user's personal sensitive data**.

---

## Key Features

1. **On-Device PII & Secret Redaction**: Runs local OCR (Tesseract.js) and entropy-based secret scanning in a sandboxed offscreen document. Visual PII (faces, Aadhaar, PAN, emails, account numbers, API keys) is masked locally before any network egress.
2. **DOM Sanitizer Layer**: Intercepts DOM trees before transmission, stripping form input values, passwords, authentication attributes, and sensitive URL query parameters.
3. **Fail-Closed Privacy Gate**: Final network outbound barrier scanning serialized payloads. If unredacted PII or secret signatures are detected, transmission is immediately blocked.
4. **Action Validator & Risk Classifier**: Treats VLM output as untrusted suggestions. Classifies action risk (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), blocks `javascript:`/`eval` execution, and gates destructive actions behind explicit user approval.
5. **Multi-Tier Architecture**: Supports high-speed Cloud VLM reasoning (Groq) or fully offline local execution (Ollama), with intelligent deterministic fallbacks for common form-filling tasks.

---

## Project Structure

* `/extension-v2`: Modern TypeScript Manifest V3 extension containing the local perception engine, DOM sanitizer, privacy gate, side panel, and action validator.
* `/server`: Production FastAPI server managing rate-limiting, conversation memory, anti-loop detection, and VLM integration.
* `/demo-page`: Realistic KYC portal containing synthetic PII for testing and verification.
* `ARCHITECTURE.md`: Complete system architecture and data flow diagrams.
* `THREAT_MODEL.md`: Detailed threat vector analysis and defensive mitigations.
* `SECURITY.md`: Security controls and vulnerability disclosure policies.

---

## Setup & Running Locally

### 1. Build Extension (`extension-v2`)
```bash
cd extension-v2
npm install
npm run build
npm test  # Runs 12 automated unit tests for DOM Sanitizer, Privacy Gate, & Action Validator
```
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select `extension-v2/dist`.

### 2. Run the FastAPI Backend (`server`)
```bash
cd server
python -m venv venv
venv\Scripts\activate  # Or source venv/bin/activate on Linux/Mac
pip install -r requirements.txt
cp .env.example .env   # Configure your GROQ API key
python -m uvicorn main:app --reload --port 8000
```

### 3. Verification & Demo
1. Open `demo-page/index.html` in Chrome.
2. Open the **PrivacyShield AI** extension popup or side panel.
3. Observe real-time local redaction, privacy scores, and automated browser assistance with zero sensitive data egress.
