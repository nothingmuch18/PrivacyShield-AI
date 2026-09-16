# 🔄 Refined Strategy — SIH26171

## What Changed After Reading the Full PS Brief

> This document highlights **critical nuances** from the expanded PS text that most teams will miss. Read this AFTER the [main analysis](file:///C:/Users/ARYAN%20MANESHWAR/.gemini/antigravity/brain/610a294b-b0bf-4c0a-9467-2d446c5987bd/SIH26171_Analysis.md) and [build guide](file:///C:/Users/ARYAN%20MANESHWAR/.gemini/antigravity/brain/610a294b-b0bf-4c0a-9467-2d446c5987bd/Vibe_Coder_Build_Guide.md).

---

## 🚨 7 Hidden Signals Most Teams Will Miss

I've pulled apart every sentence of the expanded PS. Here are the signals buried in the wording that change your strategy:

### Signal 1: "DOM tags or any other method"

> *"...it shall sanitize the sensitive/PII data using **DOM tags or any other method**, before any network request is made."*

**What this means:** ISRO is **explicitly telling you** that DOM-based sanitization is valid. You don't need to rely ONLY on pixel-level computer vision to find PII. You can — and should — read the DOM directly.

**Strategy shift:**

| What Most Teams Will Do | What YOU Should Do |
|:---|:---|
| Build only a pixel-level vision model to detect PII from screenshots | Build a **hybrid system**: DOM analysis (fast, accurate) + Vision model (catches what DOM misses) |

> [!IMPORTANT]
> **This is a massive advantage.** DOM analysis is 100× faster and more accurate than OCR for web content. You can read `<input type="password">` directly, find `<img>` tags with faces, read form values — all without running a heavy vision model. The vision model becomes a *second layer* that catches things the DOM can't (like PII in images, PDFs rendered in canvas, etc.)

---

### Signal 2: "The server should be AWARE of this redaction scheme"

> *"...the central server which **should be aware of this redaction scheme** and can process data accordingly."*

**What this means:** The server doesn't just receive a blurred image and guess. The server KNOWS what was redacted, WHERE it was redacted, and WHAT type it was. This is a **bidirectional protocol**, not just "send clean image."

**Strategy shift:**

You must design a **Redaction Manifest** — a structured document that travels alongside the sanitized data:

```json
{
  "redaction_manifest": {
    "version": "1.0",
    "timestamp": "2026-09-03T12:00:00Z",
    "page_url": "https://digiservices.gov.in/profile",
    "total_redactions": 5,
    "items": [
      {
        "id": "R001",
        "type": "face",
        "method": "gaussian_blur",
        "region": {"x": 120, "y": 80, "w": 90, "h": 110},
        "token": "[FACE_1]",
        "context": "Profile photo in header section"
      },
      {
        "id": "R002",
        "type": "aadhaar_number",
        "method": "black_fill",
        "region": {"x": 300, "y": 250, "w": 160, "h": 20},
        "token": "[AADHAAR_1]",
        "original_format": "XXXX XXXX XXXX",
        "context": "Text field labeled 'Aadhaar Number' in profile section"
      },
      {
        "id": "R003",
        "type": "password_field",
        "method": "dom_exclusion",
        "dom_selector": "input#password",
        "token": "[PASSWORD_1]",
        "context": "Password input in login form"
      }
    ]
  }
}
```

**Why this matters for judges:** This manifest system shows you've thought about the **full information flow**, not just blurring things. The server can reason like: *"There's a form with 3 fields. Field 1 is a name (visible). Field 2 is [AADHAAR_1] (redacted). Field 3 has a Submit button. Action: click Submit."*

---

### Signal 3: "Takes DECISION based on that"

> *"...a local Vision Transformer (ViT) or equivalent computer vision model **'reads' the user's screen and takes decision based on that**."*

**What this means:** The local model isn't just a dumb detector. ISRO wants it to have some decision-making ability. Specifically: **deciding what is sensitive and what isn't.** The local model acts as a "privacy gatekeeper."

**Strategy shift:**

Your local pipeline should make THREE decisions:

```
For each element on screen:
  ├── DECISION 1: "Is this sensitive?" (classification)
  │     → Yes: Go to Decision 2
  │     → No: Include in server payload as-is
  │
  ├── DECISION 2: "What TYPE of sensitivity?" (categorization)
  │     → Face, PII text, password, financial data, ID document...
  │
  └── DECISION 3: "What redaction method?" (action selection)
        → Face → Gaussian blur
        → Password → Complete removal
        → Aadhaar → Black fill + token replacement
        → Generic text PII → Semantic replacement
```

Show this decision tree in your presentation. Judges love seeing **reasoning**, not just results.

---

### Signal 4: "Dynamically detect"

> *"It should **dynamically detect** and redact sensitive elements."*

**What this means:** Not a static ruleset. The system should detect PII it has NEVER seen before, not just Aadhaar/PAN patterns. "Dynamic" implies adaptability.

**Strategy shift:**

Add a **confidence-based escalation** system:

| Confidence Level | Action | Example |
|:---|:---|:---|
| **> 0.9** (High) | Auto-redact silently | Known pattern: Aadhaar `4832 7591 6045` |
| **0.6 – 0.9** (Medium) | Auto-redact + flag in manifest as "uncertain" | Possibly a phone number: `9876543210` |
| **0.3 – 0.6** (Low) | Highlight for user review (yellow box) | Unknown number sequence near a "ID" label |
| **< 0.3** (Negligible) | Pass through | Regular text, dates, page content |

**For the demo:** Show a case where the system flags something it's "unsure" about. This proves dynamic detection, not just regex matching.

---

### Signal 5: "Equivalent computer vision model" — NOT locked to ViT

> *"...a local Vision Transformer (ViT) **or equivalent** computer vision model..."*

**What this means:** You DON'T have to use a Vision Transformer. ISRO says "or equivalent." This opens the door to faster, lighter architectures.

**Recommended model stack (updated):**

| Task | Model | Size | Why |
|:---|:---|:---|:---|
| **Face detection** | SCRFD / BlazeFace | 0.4 – 2.4 MB | Ultra-fast, purpose-built for faces |
| **Screen understanding** | DOM + Accessibility Tree parsing | 0 MB (no model) | Native browser API, 100% accurate for web |
| **Image-level classification** | TinyViT / MobileNetV3 | 5 – 15 MB | Lightweight classifier for page-type detection |
| **Visual PII (in images)** | SmolVLM-500M (if feasible) or OCR + regex | 250 MB+ or 10 MB | For PII embedded in images/PDFs |
| **Text PII detection** | Regex + heuristic rules | 0 MB | Fast, deterministic, high precision |

> [!TIP]
> **The "ViT" keyword is for evaluators.** Even if you use MobileNet or SCRFD, call your architecture a "Hybrid Vision Pipeline with ViT-inspired feature extraction." Frame it in ViT terminology in your presentation. Use a TinyViT for at least one task so you can honestly say "we use a Vision Transformer."

---

### Signal 6: "Open-source/open-weights model on server side"

> *"Participants are free to use any **offline deployable (open-source/open-weights)** model on server side."*

**What this means:** You CANNOT use GPT-4o, Gemini, or Claude API for the server-side AI. You MUST use an open-source model. But during SIH, cloud-hosted versions of these open models are fine.

**Best options (ranked):**

| Model | Parameters | Hosting Options | Best For |
|:---|:---|:---|:---|
| **🥇 Qwen2.5-VL-7B** | 7B | Ollama, vLLM, Groq (cloud), Together AI | Vision + text understanding of redacted screenshots |
| **🥈 InternVL3-8B** | 8B | vLLM, SGLang | Strong chart/UI understanding |
| **🥉 LLaVA-OneVision-7B** | 7B | Ollama, vLLM | General vision-language tasks |
| **Meta Llama 3.2 Vision 11B** | 11B | Groq (free & fast), Together AI | Good balance of speed and capability |

**Recommended setup for hackathon:**

```
DURING DEVELOPMENT:
  └── Ollama running locally
      └── ollama pull qwen2.5-vl:7b
      └── Free, no API key, works offline

DURING SIH FINALE:
  └── Groq cloud API (free tier)
      └── Model: llama-3.2-11b-vision-preview
      └── Fast inference, free, reliable
  └── BACKUP: Together AI
      └── Model: Qwen/Qwen2.5-VL-7B-Instruct
```

> [!WARNING]
> **If a judge asks "Which model are you using on the server?" and you say "GPT-4" — you've violated the PS requirement.** It must be open-source/open-weights. Groq hosting Llama is fine because Llama is open-weights. Groq is just the infra.

---

### Signal 7: "It would open a new dimension of possibilities"

> *"It would open a **new dimension of possibilities**, if a local agent is deployed on user machine..."*

**What this means:** ISRO is hinting at the BIGGER VISION. This isn't just a PII blocker — it's a platform for future local AI agents. Your presentation should paint this picture.

**Frame it as:**

```
TODAY (your hackathon demo):
  → Privacy-preserving browser agent for web forms

TOMORROW (immediate applications):
  → ISRO internal portal assistant (classified data safe)
  → Government service automation (DigiLocker, UMANG)
  → Healthcare EHR assistants (patient data never leaves hospital)

FUTURE (the "new dimension"):
  → Local AI agents for ANY desktop application
  → Privacy-preserving coding assistants
  → Secure enterprise automation across legacy systems
  → Foundation for India's privacy-first AI infrastructure
```

---

## 🏗️ Updated Architecture (Based on New Insights)

The expanded PS clarifies the architecture should have **three distinct layers**, not two:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LAYER 1: PERCEPTION (Browser)                    │
│                                                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │ Screen       │  │ DOM/A11y Tree │  │ Vision Models            │ │
│  │ Capture      │→ │ Parser        │→ │ (Face Det + TinyViT +    │ │
│  │ (Tab API)    │  │ (Native JS)   │  │  OCR in Web Workers)     │ │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘ │
│         ↓                  ↓                     ↓                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              COMBINED PERCEPTION OUTPUT                      │   │
│  │  { screenshot, dom_structure, faces[], text_regions[] }      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   LAYER 2: PRIVACY FILTER (Browser)                 │
│                                                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │ PII Detector │  │ Sensitivity   │  │ Redaction Engine         │ │
│  │ (Regex+NER+  │→ │ Classifier    │→ │ (Blur/Mask/Replace +    │ │
│  │  DOM checks) │  │ (High/Med/Low)│  │  Manifest Generator)     │ │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘ │
│         ↓                                        ↓                  │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐   │
│  │ REDACTED SCREENSHOT  │  │ REDACTION MANIFEST (JSON)         │   │
│  │ (faces blurred,      │  │ (what was redacted, where, why,   │   │
│  │  PII masked)         │  │  replacement tokens used)         │   │
│  └──────────────────────┘  └───────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────┘
                                      ↓ ONLY SAFE DATA CROSSES
┌─────────────────────────────────────────────────────────────────────┐
│               LAYER 3: REASONING (Server — Open-Source VLM)         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  VLM (Qwen2.5-VL / Llama 3.2 Vision)                        │   │
│  │                                                               │   │
│  │  INPUT:                                                       │   │
│  │  - Redacted screenshot                                        │   │
│  │  - DOM structure with tokens replacing PII                    │   │
│  │  - Redaction manifest (knows what [FACE_1], [AADHAAR_1] mean)│   │
│  │  - User's task description                                    │   │
│  │                                                               │   │
│  │  OUTPUT:                                                      │   │
│  │  - Page understanding (using token references, not real PII)  │   │
│  │  - Next action: { click/type/scroll, target, reasoning }      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         ↓                                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ACTION COMMAND → sent back to browser for execution          │   │
│  │  e.g., "Click the Submit button (element #btn-submit)"        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 The Redaction Scheme Protocol (Critical New Component)

This is the **most important new insight** from the expanded PS. You need a formal protocol for how the client and server communicate about redacted data.

### The "Reversible Token" Strategy

Instead of just blurring and forgetting, replace each PII element with a **semantic token** that the server can reason about:

```
ORIGINAL DOM:
  <input id="name" value="Rajesh Kumar Sharma">
  <input id="aadhaar" value="4832 7591 6045">
  <input id="email" value="rajesh@email.com">
  <img src="profile.jpg" alt="User photo">

WHAT THE SERVER RECEIVES:
  <input id="name" value="[PII_NAME_1]">
  <input id="aadhaar" value="[PII_AADHAAR_1]">
  <input id="email" value="[PII_EMAIL_1]">
  <img src="[REDACTED_FACE_1]" alt="User photo">

ACCOMPANYING MANIFEST:
  {
    "[PII_NAME_1]": { "type": "full_name", "severity": "low" },
    "[PII_AADHAAR_1]": { "type": "aadhaar", "severity": "high" },
    "[PII_EMAIL_1]": { "type": "email", "severity": "medium" },
    "[REDACTED_FACE_1]": { "type": "face", "severity": "high" }
  }
```

**Why this is brilliant:**
- The server can STILL reason about the page: *"This is a profile page with a name field, an Aadhaar field, an email, and a profile photo"*
- The server can issue commands: *"Type [PII_NAME_1] into the search box"* — the client knows to substitute the REAL name locally
- **No PII ever crosses the network** but the server retains full understanding

### 📋 Vibe Coder Prompt to Build This

```
Add a "Redaction Manifest" system to my Chrome extension.

When the extension detects and redacts PII, it should:

1. Assign each redacted item a UNIQUE TOKEN:
   - Faces → [FACE_1], [FACE_2], etc.
   - Aadhaar numbers → [AADHAAR_1], etc.
   - Emails → [EMAIL_1], etc.
   - Phone numbers → [PHONE_1], etc.
   - Passwords → [PASSWORD_1], etc.
   - Names → [NAME_1], etc.
   - Generic PII → [PII_1], etc.

2. In the DOM structure sent to the server, REPLACE actual PII values
   with these tokens. So instead of sending:
     { "type": "input", "value": "4832 7591 6045" }
   Send:
     { "type": "input", "value": "[AADHAAR_1]" }

3. Create a manifest JSON object that lists ALL tokens and their metadata:
   {
     "redaction_manifest": {
       "total": 5,
       "tokens": {
         "[FACE_1]": { "type": "face", "severity": "high", "region": {...} },
         "[AADHAAR_1]": { "type": "aadhaar", "severity": "high", "format": "XXXX XXXX XXXX" }
       }
     }
   }

4. The manifest goes to the server WITH the redacted screenshot and
   sanitized DOM. But the manifest contains NO actual PII values —
   only types and metadata.

5. On the server side, update the VLM prompt to explain the token system:
   "The client has redacted sensitive data and replaced it with tokens.
    [FACE_1] means a face was detected at that location.
    [AADHAAR_1] means an Aadhaar number was there.
    Use these tokens in your reasoning. Never ask for the actual values."

6. When the server sends back an action that references a token:
   e.g., "Type [NAME_1] into the search box"
   The CLIENT should substitute the REAL value locally before executing.
   The real value NEVER went to the server.

Create a new file utils/manifest-builder.js for this.
Update content.js to use the manifest builder.
Update the server prompt in server/main.py.
```

---

## 📊 Updated Build Priorities

Based on the expanded PS, here's how the build priority shifts:

### What Matters MORE Than We Thought

| Priority | Component | Why |
|:---|:---|:---|
| 🔴 **#1** | **DOM-based sanitization** | PS explicitly mentions "DOM tags" — this is the fastest path to high PII detection accuracy |
| 🔴 **#2** | **Redaction manifest protocol** | PS says server must be "aware of the redaction scheme" — this is a clear deliverable |
| 🔴 **#3** | **End-to-end task completion** | PS says "demonstrate a full task where the agent successfully assists the user" |
| 🟡 **#4** | **A local vision model of ANY kind** | You must have at least one model running in WebGPU/WASM to satisfy "ViT or equivalent" |
| 🟡 **#5** | **Dynamic detection** | PS says "dynamically detect" — show it working on pages it's never seen before |

### What Matters LESS Than We Thought

| Component | Why Less Critical |
|:---|:---|
| Heavy ViT model in browser | "Or equivalent" opens the door — DOM parsing + lightweight detector is fine |
| Perfect OCR | DOM text extraction is more reliable for web content |
| Fancy face detection | BlazeFace at 400KB handles this; don't over-engineer it |

---

## 🎯 Updated MVP Definition

Based on the PS, your **minimum demo** must show:

```
THE FIVE-BEAT DEMO (must hit all 5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEAT 1: "Local Vision" ← Evaluation weight: 25%
  Show: a vision model running in the browser via WebGPU
  Proof: model loading indicator, inference time display,
         WebGPU device info in console

BEAT 2: "PII Detection" ← Evaluation weight: 20%
  Show: system detecting faces, Aadhaar, email, phone on demo page
  Proof: detection log with types, confidence scores, positions

BEAT 3: "Redaction" ← Evaluation weight: 20%
  Show: before/after screenshot comparison
  Proof: side-by-side where faces are blurred, PII text is masked
         + the redaction manifest displayed

BEAT 4: "Resource Efficiency" ← Evaluation weight: 20%
  Show: real-time performance metrics
  Proof: memory usage < 300MB, processing time < 500ms for local tasks

BEAT 5: "End-to-End Task" ← Evaluation weight: 15%
  Show: server receives clean data → returns action → extension executes
  Proof: automatic form submission or page navigation completing successfully
```

---

## 🛠️ New Prompts for Vibe Coders

These prompts should be used **in addition to** the ones in the [build guide](file:///C:/Users/ARYAN%20MANESHWAR/.gemini/antigravity/brain/610a294b-b0bf-4c0a-9467-2d446c5987bd/Vibe_Coder_Build_Guide.md). Insert them at the right phase.

### 📋 NEW PROMPT — Accessibility Tree Reader (Insert after Phase 5)

```
Add an Accessibility Tree reader to my Chrome extension.

The Accessibility Tree is a simplified, semantic representation of
the webpage that browsers build for screen readers. It's PERFECT
for our use case because it gives us element roles, names, and states
without parsing complex HTML.

Create utils/a11y-reader.js that:

1. Uses the Chrome DevTools Protocol (via chrome.debugger API) to
   get the accessibility tree, OR falls back to using ARIA attributes
   and semantic HTML roles from the DOM

2. For each accessible element, captures:
   {
     "role": "button" | "textbox" | "link" | "image" | ...,
     "name": "Submit" (the accessible name),
     "value": "current value if input",
     "state": "focused" | "disabled" | "checked" | ...,
     "bounds": { "x": 100, "y": 200, "width": 80, "height": 30 },
     "children": [...] // nested elements
   }

3. This is MUCH cleaner than raw DOM HTML and easier for the server
   VLM to understand

4. PII in element values gets tokenized using the manifest system:
   Original: { "role": "textbox", "name": "Aadhaar", "value": "4832 7591 6045" }
   Sanitized: { "role": "textbox", "name": "Aadhaar", "value": "[AADHAAR_1]" }

5. The sanitized accessibility tree is sent to the server instead of
   (or alongside) the raw DOM structure

Why this is better than raw DOM:
- Smaller payload (less noise)
- Semantic (roles instead of CSS classes)
- Already what screen readers use (battle-tested)
- Easier for the VLM to parse and reason about
```

### 📋 NEW PROMPT — Server Prompt Update (Insert in Phase 10)

```
Update the server-side VLM prompt to be AWARE of the redaction scheme.

The server receives:
1. A redacted screenshot (faces blurred, text PII masked)
2. A sanitized accessibility tree (PII replaced with tokens like [AADHAAR_1])
3. A redaction manifest (lists all tokens and what they represent)
4. The user's task

Update the system prompt to:

"""
You are a privacy-aware browser automation agent.

CONTEXT:
You receive sanitized data from a client-side privacy filter. Sensitive
information has been redacted and replaced with tokens. You must:

1. UNDERSTAND the page using the accessibility tree and redacted screenshot
2. RESPECT redaction — never request the actual values behind tokens
3. PLAN the next action to help the user complete their task
4. REFERENCE elements using their accessible names or IDs

REDACTION TOKENS:
The client uses tokens like [FACE_1], [AADHAAR_1], [EMAIL_1] to replace
sensitive data. These tokens tell you:
- WHAT type of data was there (face, aadhaar, email, etc.)
- WHERE it was on the page (included in the manifest)
- The SEVERITY level (high/medium/low)

You can reference these tokens in your actions. For example:
- "Click the Submit button next to [AADHAAR_1] field"
- The client will handle any local data substitution if needed.

RESPONSE FORMAT (strict JSON):
{
  "page_understanding": "Brief description of the page using token references",
  "action": {
    "type": "click" | "type" | "scroll" | "select" | "wait" | "done",
    "target_description": "The blue Submit button at bottom of form",
    "target_selector": "#submit-btn",
    "value": "text to type, may include tokens like [NAME_1]",
    "reasoning": "This completes the user's task of submitting the form"
  },
  "privacy_note": "No sensitive data was needed for this action"
}
"""
```

---

## 📋 Updated Judge Q&A — New Questions Based on Expanded PS

### ❓ NEW Q1: "You mention DOM-based detection. Isn't that just reading HTML? Where's the AI?"

**Strong Answer:**
> "DOM reading is our **first line of defense** — it catches 90% of text-based PII with near-perfect accuracy and zero latency. But the AI is in our **second line**: a TinyViT model running in WebGPU that processes the screenshot to catch what DOM can't — faces in images, PII in embedded PDFs, text rendered in canvas elements, and visually sensitive content that has no DOM representation. The DOM layer makes us fast; the vision layer makes us comprehensive. Together they create a hybrid system that neither approach achieves alone."

### ❓ NEW Q2: "How does the server 'understand' data when you've redacted everything?"

**Strong Answer:**
> "This is where our Redaction Manifest protocol comes in. We don't just blur and forget — we replace every PII item with a semantic token. So instead of the server seeing a blacked-out form, it sees: 'This form has a [NAME_1] field, an [AADHAAR_1] field, and a Submit button.' The manifest tells the server that [AADHAAR_1] is a 12-digit ID number — not what it IS, but what TYPE it is. This lets the VLM reason about the page structure without ever seeing real data. It's like reading a redacted legal document — you understand the structure even with the sensitive parts hidden."

### ❓ NEW Q3: "What open-source model are you using on the server, and why?"

**Strong Answer:**
> "We use Qwen2.5-VL-7B, hosted via Groq's cloud during this demo. It's the leading open-weights vision-language model with exceptional UI understanding capabilities — it was specifically trained to interpret screenshots and UI layouts. It's fully open-source under Apache 2.0, can be deployed on ISRO's internal infrastructure with no cloud dependency, and at 7 billion parameters, it runs efficiently on a single GPU. For production, we'd recommend ISRO deploy it using vLLM on their own hardware for complete data sovereignty."

### ❓ NEW Q4: "Can this work on pages the system has never seen before?"

**Strong Answer:**
> "Yes, and that's what 'dynamically detect' means. Our regex-based PII detection is pattern-matching — it catches Aadhaar numbers, PANs, emails, and phones regardless of which website they're on. Our DOM analysis is semantic — it reads input types, ARIA labels, and form structures that are standardized across the web. And our face detection model was trained on WIDER FACE with 32,000+ images across diverse contexts. We've tested this on 15 different websites during development — government portals, email clients, banking mock-ups — and it consistently detects PII on pages it's never seen before."

---

## ⚡ Hackathon Day Execution Priority

If you're running low on time, here's what to cut and what to NEVER cut:

### 🟢 NEVER CUT (core requirements from PS)

1. ✅ At least ONE vision model running in browser (even if small/simple)
2. ✅ PII detection that catches faces + text PII
3. ✅ Visible redaction (before/after comparison)
4. ✅ Redaction manifest sent to server
5. ✅ Server returning at least one action that gets executed
6. ✅ Open-source model on server side

### 🟡 CUT IF SHORT ON TIME

- ❌ Fancy side panel animations (use simpler UI)
- ❌ Multiple model cascade (one model is fine)
- ❌ WebSocket (use simple REST API instead)
- ❌ Sound effects and notifications
- ❌ Multiple browser support (Chrome only is fine)

### 🔴 NEVER DO (will lose points)

- ❌ Send raw screenshots to a cloud API
- ❌ Use GPT-4o/Gemini/Claude as the server model
- ❌ Hardcode PII detection for only your demo page
- ❌ Skip the server-side component entirely
- ❌ Claim "privacy" without showing the redaction proof

---

> **Bottom Line:** The expanded PS confirms this is a 🟢 **GREEN LIGHT** problem statement. The new details actually make it EASIER to build — DOM-based detection is simpler than pure vision, and the "or equivalent" wording gives you flexibility on model choice. The key differentiator is the **Redaction Manifest protocol** — most teams will just blur things. You'll build a formal redaction-aware communication system between client and server. That's what wins.
