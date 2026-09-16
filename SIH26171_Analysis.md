# 🚀 SIH 2026 — Problem Statement Deep Analysis

> **PS ID:** SIH26171
> **Title:** On-device Visual Perception for Light-weight Browser Agents
> **Organization:** Indian Space Research Organisation (ISRO)
> **Theme:** Smart Automation | **Category:** Software

---

## 1. Pain Points & Core Understanding 🔎

### 🎯 What Exact Problem Is Being Addressed?

Current AI browser agents (like Adept, MultiOn, or ChatGPT's agent mode) operate by **capturing full screenshots of a user's screen and sending them to cloud servers** for processing. This creates a fundamental **privacy violation** — the server sees everything: passwords, bank details, personal messages, Aadhaar numbers, medical records, and faces.

ISRO wants a **local-first, privacy-preserving vision AI agent** that:
1. **Sees** the screen locally (on-device visual perception)
2. **Detects & redacts** all PII/sensitive data before anything leaves the device
3. **Sends only sanitized structural data** to a server-side LLM for reasoning
4. **Executes UI commands** returned by the server (click, scroll, type)

### 🧬 Why Does This Problem Exist? (Root Causes)

| Root Cause | Explanation |
|:---|:---|
| **Cloud-dependent AI** | Most VLMs (GPT-4o, Gemini, Claude) are too large to run locally — so screen data must be shipped to the cloud |
| **No privacy layer in agentic AI** | Existing browser agents like MultiOn, SeeAct, and Skyvern have **zero PII filtering** — they ingest raw screen data |
| **Browser resource constraints** | Browsers have strict memory limits (~4GB per tab), making it hard to run full-size vision models |
| **WebGPU is nascent** | Hardware-accelerated ML in browsers via WebGPU is only recently stable, so few solutions exploit it |
| **Regulatory pressure** | GDPR, India's DPDP Act 2023, and HIPAA all demand that PII not be sent to third-party servers without consent |

### 👥 Primary Stakeholders/Users Affected

- **End Users / Citizens** — anyone whose screen contains sensitive personal data
- **Enterprises** — companies using browser-based CRMs, ERP, healthcare portals
- **Government Departments** — handling classified/sensitive citizen data
- **ISRO / Defence** — agentic AI on internal portals without data leakage
- **Developers** — building privacy-first agentic applications

### ⚠️ Current Challenges & Inefficiencies

- **All-or-nothing privacy**: Either you use a cloud agent (no privacy) or you don't use AI at all
- **No on-device PII detection for visual data**: Tools like Microsoft Presidio handle text PII well, but visual PII (faces, ID cards, screenshots of passwords) remains unsolved in-browser
- **Latency vs. accuracy tradeoff**: Running vision models locally means smaller models with potentially lower accuracy
- **No standardized pipeline** exists that combines local vision + PII redaction + remote reasoning + UI execution

---

## 2. Feasibility of Execution ⚙️

### ✅ Can a Working Prototype Be Built in the Hackathon Timeline?

**Yes — but it requires sharp scoping.**

This PS has a clear modular architecture (client + server + pipeline), which makes it parallelizable across team members. The key technologies are mature enough:

| Component | Feasibility | Reason |
|:---|:---|:---|
| Browser extension shell | 🟢 High | Chrome Manifest V3 extensions are well-documented |
| Screen capture | 🟢 High | `chrome.tabs.captureVisibleTab()` or `getDisplayMedia()` |
| Local vision model | 🟡 Medium | ONNX Runtime Web + WebGPU works, but needs model selection & optimization |
| PII detection (faces) | 🟢 High | BlazeFace / SCRFD are < 5MB and run at 30+ FPS in-browser |
| PII detection (text) | 🟡 Medium | Tesseract.js for OCR + regex/NER for PII — works but needs tuning |
| Server-side LLM integration | 🟢 High | Open-source VLMs (Qwen2.5-VL, LLaVA) via API or Ollama |
| UI command execution | 🟡 Medium | Requires DOM injection and robust element targeting |

### 🛠️ Technical Requirements

```
┌──────────────────────────────────────────────────────┐
│                   TECH STACK MAP                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CLIENT SIDE (Browser Extension)                     │
│  ├── Chrome Manifest V3 / Firefox WebExtension       │
│  ├── Transformers.js / ONNX Runtime Web              │
│  ├── WebGPU (primary) + WASM (fallback)              │
│  ├── BlazeFace / SCRFD (face detection, <5MB)        │
│  ├── MobileViT / EfficientNet (screen understanding) │
│  ├── Tesseract.js (OCR for text PII)                 │
│  ├── Web Workers (off-main-thread inference)          │
│  └── Canvas API (for redaction rendering)             │
│                                                      │
│  SERVER SIDE                                         │
│  ├── Python (FastAPI / Flask)                        │
│  ├── Open-source VLM (Qwen2.5-VL / LLaVA)           │
│  ├── Action planning + JSON command output           │
│  └── WebSocket for real-time communication           │
│                                                      │
│  DATA / MODELS                                       │
│  ├── ONNX-format quantized models (INT8/FP16)        │
│  ├── Any open-source data for training/eval          │
│  └── Synthetic PII datasets for testing              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 🚧 Potential Blockers

| Blocker | Severity | Mitigation |
|:---|:---|:---|
| WebGPU not available on judge's machine | 🔴 High | Implement WASM fallback; test on multiple browsers |
| Vision model too heavy for browser | 🟡 Medium | Use quantized models < 20MB; profile memory usage |
| OCR accuracy for Indian languages | 🟡 Medium | Scope to English for MVP; mention multilingual as future work |
| Real-time latency > 2 seconds | 🟡 Medium | Pipeline optimization, skip unchanged frames, resize inputs |
| Extension permissions rejected by browser | 🟢 Low | Request minimal permissions; document rationale |

### 🏆 MVP That Will Impress Evaluators

> **The "Golden Demo":** A Chrome extension that, when activated on a webpage containing a form with personal details (name, Aadhaar, photo), automatically:
> 1. Captures the screen locally
> 2. Detects and blurs faces + masks text PII with colored overlays
> 3. Shows a side-by-side "before/after" of what the server sees
> 4. Sends the sanitized version to the server
> 5. Server returns a command like "Click Submit" — and the extension executes it
>
> **Bonus:** A real-time dashboard showing detection metrics (precision, recall, latency)

---

## 3. Impact & Relevance 🌍

### 🎯 Who Benefits?

| Beneficiary | How |
|:---|:---|
| 🏛️ **Government agencies** | Safely deploy AI assistants on portals handling citizen data (Aadhaar, DigiLocker) |
| 🏥 **Healthcare** | AI agents can assist doctors on EHR portals without exposing patient records |
| 🏦 **Banking / Finance** | Agentic AI on banking portals without leaking account details |
| 🛰️ **ISRO / Defence** | Secure AI assistants on internal classified systems |
| 👩‍💻 **Developers** | A reusable privacy layer for any browser-based AI agent |
| 👤 **Citizens** | Peace of mind — their personal data stays on their device |

### 🌐 Real-World Impact

- **Privacy by Design** — aligns with India's Digital Personal Data Protection (DPDP) Act 2023
- **Enables AI adoption** in sensitive sectors (healthcare, defence, govt) that currently avoid cloud AI
- **Reduces data breach risk** — sensitive data never leaves the device
- **Democratizes agentic AI** — smaller orgs can use browser agents without expensive compliance infrastructure

### 📈 Scalability

| Level | Application |
|:---|:---|
| **Hackathon** | Chrome extension + single server demo |
| **Enterprise** | Privacy middleware for any browser-based AI agent platform |
| **State/National** | Integrated into government portals (UMANG, DigiLocker, CoWIN) |
| **Global** | Open-source privacy layer adopted by browser agent frameworks worldwide |

### 🧠 Why Evaluators Will Care

- **ISRO is the organization** — they handle classified data and need this for internal AI adoption
- **Privacy-preserving AI** is the hottest regulatory topic globally (EU AI Act, India DPDP)
- **It's technically deep** — not just a wrapper around an API, but real on-device ML engineering
- **Clear evaluation metrics** are provided — judges can objectively measure success

---

## 4. Scope of Innovation (Existing Solutions) 💡

### 📊 Competitor Analysis

| Solution | What It Does | Privacy Approach | Limitation |
|:---|:---|:---|:---|
| **[Adept AI](https://adept.ai)** | Enterprise browser agent, Fuyu model | Cloud-only processing | ❌ No on-device processing, no PII filter |
| **[MultiOn](https://multion.ai)** | Autonomous web task agent | Cloud-based VLM | ❌ Full screenshots sent to cloud |
| **[SeeAct](https://github.com/OSU-NLP-Group/SeeAct)** (OSU NLP) | Research agent using GPT-4V | Relies on cloud VLM | ❌ No privacy layer, no local inference |
| **[WebVoyager](https://github.com/MinorJerry/WebVoyager)** (ACL '24) | End-to-end web agent benchmark | Cloud LMM | ❌ No PII consideration |
| **[Browser Use](https://github.com/browser-use/browser-use)** | Open-source agent framework | Cloud API calls | ❌ No local processing, no redaction |
| **[Microsoft Presidio](https://github.com/microsoft/presidio)** | PII detection/anonymization | Server-side Python | ❌ Text-only, no visual PII, not in-browser |
| **[Cloak](https://github.com/nicholasgasior/cloak)** | Local PII masking | On-device | ⚠️ Text-only, no vision, no agent integration |

### 🔬 Relevant Research Papers

| Paper | Venue | Key Insight |
|:---|:---|:---|
| *"GPT-4V(ision) is a Generalist Web Agent, if Grounded"* (SeeAct) | ICML '24 | VLMs can act as web agents but need grounding — no privacy considered |
| *"WebVoyager: Building an End-to-End Web Agent with LMMs"* | ACL '24 | Benchmark for web agent tasks, all cloud-based |
| *"ScreenAgent: A VLM-driven Computer Control Agent"* | IJCAI '24 | Desktop GUI control via screenshots — but fully cloud |
| *"MobileViT: Light-weight, General-purpose, and Mobile-friendly Vision Transformer"* | ICLR '22 | CNN+Transformer hybrid ideal for edge deployment |
| *"BlazeFace: Sub-millisecond Neural Face Detection on Mobile GPUs"* | Google Research | Ultra-fast face detection suitable for browser |

### 🌟 What Makes YOUR Solution Innovative?

> [!IMPORTANT]
> **No existing solution combines ALL THREE of these capabilities:**
> 1. ✅ On-device visual perception (browser-native ML)
> 2. ✅ Real-time PII detection & redaction (visual + textual)
> 3. ✅ Privacy-preserving agentic pipeline (sanitized data → server → UI commands)

### 💡 Innovation Opportunities

| Innovation Area | What to Build |
|:---|:---|
| **Hybrid model cascade** | BlazeFace (faces) + SCRFD (detailed) + Tesseract.js (text OCR) + regex (structured PII) — all running in parallel Web Workers |
| **Semantic redaction** | Don't just blur — replace sensitive regions with semantic descriptions ("A person's face was here", "Aadhaar number detected") so the server LLM retains context |
| **Confidence-based gating** | Only send data to server when local model confidence is high; flag uncertain regions for human review |
| **Differential privacy noise** | Add calibrated noise to structural data before transmission for mathematical privacy guarantees |
| **WebGPU pipeline visualization** | Real-time dashboard showing the inference pipeline, memory usage, and detection results — this wows judges |

---

## 5. Clarity of Problem Statement 🧩

### 📋 What Exactly Is Being Asked (Deliverables)

| Deliverable | Weight | What Judges Want to See |
|:---|:---|:---|
| Local vision model running in browser | 25% | Accurate screen understanding via ViT/CNN on WebGPU |
| PII detection (faces, text, sensitive data) | 20% | High recall — don't miss PII; measured by precision & recall |
| Redaction quality | 20% | Clean masking/blurring that preserves non-sensitive context |
| Resource efficiency | 20% | Low CPU/GPU/memory usage; works on mid-range hardware |
| End-to-end latency | 15% | Full loop (capture → detect → redact → send → receive → execute) should be fast |

### ⚠️ Where Teams Might Misinterpret

> [!WARNING]
> **Common Misinterpretation Traps:**

| Trap | What Teams Might Do | What ISRO Actually Wants |
|:---|:---|:---|
| "Just use GPT-4o API" | Send everything to cloud | **Local processing is mandatory** — that's the entire point |
| Focus only on face blurring | Build a face-blur Chrome extension | Full PII pipeline: faces + text + passwords + IDs + sensitive content |
| Skip the server-side agent | Build only local processing | Must demonstrate **end-to-end agentic task** (server sends UI commands) |
| Ignore resource efficiency | Run a 500MB model in browser | **20% weight on resource utilization** — model must be lightweight |
| Demo on a synthetic page only | Test on a dummy HTML page | Should work on **real websites** — forms, portals, dashboards |

### 🎯 How to Frame for Evaluator Clarity

Structure your demo and presentation around the **evaluation metrics**:

```
DEMO FLOW (mirrors scoring rubric):

[1] Show screen capture + vision model output (25%)
    → "Here's what our local ViT sees on this page"

[2] Highlight detected PII with bounding boxes (20%)
    → "We detected 3 faces, 2 Aadhaar numbers, 1 password field"

[3] Show redacted version side-by-side (20%)
    → "This is what the server receives — zero PII"

[4] Show resource monitor overlay (20%)
    → "Using 180MB RAM, 12% GPU, running at 8 FPS"

[5] Show server response + auto-execution (15%)
    → "Server says 'click Submit', extension executes it"
```

---

## 6. Evaluator's Perspective 🎯

### 🧑‍⚖️ How Will ISRO Judges Evaluate This?

ISRO judges will be **technically deep** — expect senior scientists and engineers who understand ML, systems architecture, and security. They won't be impressed by pretty slides alone.

### 📊 Criteria Priority Stack

| Rank | Criteria | Weight | What Impresses |
|:---|:---|:---|:---|
| 1️⃣ | **Technical depth** | ⭐⭐⭐⭐⭐ | Real on-device inference, not API wrappers |
| 2️⃣ | **Privacy guarantee** | ⭐⭐⭐⭐⭐ | Mathematically or architecturally provable that no PII leaves device |
| 3️⃣ | **Working demo** | ⭐⭐⭐⭐ | End-to-end task completion on a real website |
| 4️⃣ | **Resource efficiency** | ⭐⭐⭐⭐ | Memory/CPU profiling data shown in real-time |
| 5️⃣ | **Innovation** | ⭐⭐⭐ | Novel approach to PII detection or model architecture |
| 6️⃣ | **Scalability** | ⭐⭐⭐ | Future roadmap for enterprise/government deployment |

### 🚩 Red Flags Judges Will Notice

> [!CAUTION]
> **Instant credibility killers:**
> - ❌ Sending raw screenshots to any external API during the demo
> - ❌ Hardcoded PII detection (if/else for specific strings instead of ML)
> - ❌ No fallback when WebGPU is unavailable
> - ❌ Claiming "100% privacy" without explaining the architecture
> - ❌ Browser extension that crashes or freezes the tab
> - ❌ Unable to explain model choice, quantization, or inference pipeline
> - ❌ Demo only works on one specific pre-prepared page

---

## 7. Strategy for Team Fit & Execution 👥

### 🧑‍💻 Required Skill Sets

| Role | Skills Needed | Criticality |
|:---|:---|:---|
| **ML/AI Engineer** (×2) | ONNX model conversion, quantization, WebGPU inference, face detection, OCR | 🔴 Critical |
| **Frontend/Extension Dev** (×1) | Chrome Manifest V3, Web Workers, Canvas API, DOM manipulation | 🔴 Critical |
| **Backend Engineer** (×1) | Python FastAPI, VLM inference (Ollama/vLLM), WebSocket, action parsing | 🟡 Important |
| **Systems/Perf Engineer** (×1) | Memory profiling, latency optimization, benchmarking, WebGPU debugging | 🟡 Important |
| **Designer + Presenter** (×1) | UI/UX for extension popup, dashboard design, pitch deck, live demo skills | 🟢 Helpful |

### 📊 Ideal Team Ratio (6 members)

```
┌─────────────────────────────────────────┐
│          TEAM COMPOSITION               │
├─────────────────────────────────────────┤
│  🧠 ML/AI ............ 2 members (33%) │
│  🖥️ Extension/Frontend. 1 member  (17%) │
│  ⚙️ Backend ........... 1 member  (17%) │
│  📊 Perf/Systems ...... 1 member  (17%) │
│  🎨 Design/Presenter .. 1 member  (17%) │
└─────────────────────────────────────────┘
```

### 📝 Step-by-Step Research & Ideation Plan

```
PRE-HACKATHON (2-3 weeks before)
─────────────────────────────────
Week 1:
  ├── [ALL] Read PS thoroughly, understand evaluation weights
  ├── [ML] Benchmark BlazeFace, SCRFD, YOLO-Face in ONNX Runtime Web
  ├── [ML] Test Transformers.js with MobileViT / EfficientNet on WebGPU
  ├── [Frontend] Build skeleton Chrome extension with screen capture
  └── [Backend] Set up Qwen2.5-VL or LLaVA on local server

Week 2:
  ├── [ML] Integrate face detection + OCR in Web Workers
  ├── [ML] Build regex + NER pipeline for text PII
  ├── [Frontend] Canvas-based redaction overlay (blur, mask, fill)
  ├── [Backend] Build action planning prompt + JSON command output
  └── [Systems] Profile memory, GPU, and latency baselines

Week 3:
  ├── [ALL] End-to-end integration testing
  ├── [Systems] Optimize: quantize models, batch processing, frame skipping
  ├── [Design] Extension UI, dashboard, side-by-side comparison view
  └── [Presenter] Draft pitch, prepare for Q&A stress test

DURING HACKATHON (36 hours)
─────────────────────────────────
Hours 0-6:   Set up infra, verify all models load in browser
Hours 6-18:  Core pipeline: capture → detect → redact → send → execute
Hours 18-28: Polish, edge cases, fallback handling, dashboard
Hours 28-34: Demo rehearsal, performance benchmarking, slides
Hours 34-36: Final testing, backup demo recording
```

---

## 8. AI-Buildability Split (20/80) 🤖

### ⚡ The 20% AI Can Build Fast (MVP Shell)

| Component | AI Can Generate |
|:---|:---|
| Chrome extension boilerplate | Manifest V3, popup HTML/CSS/JS, content script wiring |
| ONNX Runtime Web integration code | Model loading, inference runner, WebGPU device init |
| Canvas redaction rendering | Bounding box drawing, blur filters, mask overlays |
| FastAPI server boilerplate | Endpoint for receiving images, VLM prompt template, JSON response |
| Basic UI dashboard | HTML/CSS for showing detection results, latency graphs |
| Tesseract.js OCR integration | Text extraction from canvas, regex PII patterns |

### 🧠 The 80% That Needs Real Engineering

| Component | Why AI Can't Just Generate This |
|:---|:---|
| **Model selection & benchmarking** | Must empirically test which models fit in browser memory on target hardware |
| **WebGPU fallback strategy** | Graceful degradation from WebGPU → WebGL → WASM requires real testing |
| **PII detection pipeline design** | Deciding what counts as PII, handling false positives, tuning thresholds — domain judgment |
| **Semantic redaction strategy** | Replacing PII with contextual descriptions requires careful prompt engineering |
| **Memory management** | Browser tabs have hard limits; must manage model lifecycle, garbage collection, tensor cleanup |
| **Latency optimization** | Frame skipping, region-of-interest cropping, async pipeline orchestration |
| **Server action planning** | Designing the VLM prompt so it returns reliable, executable UI commands |
| **DOM element targeting** | Translating "click the submit button" into the correct CSS selector or XPath |
| **Edge cases** | Overlapping PII regions, dynamic content, iframes, shadow DOM, cross-origin restrictions |
| **Security architecture** | Proving no data leaks — not just code, but architecture-level reasoning |

### ⚠️ Risk of Over-Reliance on AI

> [!WARNING]
> If the team uses AI to generate the entire solution without deep understanding:
> - **They won't survive the Q&A.** ISRO judges will ask "Why did you choose this model over X?" or "What's the memory footprint?" — generic answers will be caught immediately.
> - **The demo will break under edge cases.** AI-generated code rarely handles WebGPU initialization failures, model OOM errors, or cross-origin iframe restrictions.
> - **No performance optimization.** AI doesn't profile your specific hardware — you must benchmark and iterate.

### 🔧 One Structural Change a Judge Could Ask For

> **"Can you swap your face detection model from BlazeFace to SCRFD and show the accuracy difference?"**

Could the team do this live?
- ✅ **Yes, if** they've pre-exported both models as ONNX and their pipeline has a model-agnostic loader.
- ❌ **No, if** the model is hardcoded and they don't understand the input/output tensor shapes.

**Preparation tip:** Pre-load 2-3 alternative models in your extension's assets folder. Build a config dropdown in your settings panel so you can swap models in 10 seconds during demo.

---

## 9. Data & Resource Availability 📊

### 📁 Available Datasets & APIs

| Resource | Type | Availability | Use Case |
|:---|:---|:---|:---|
| **[WIDER FACE](http://shuoyang1213.me/WIDERFACE/)** | Dataset | 🟢 Public, Free | Face detection training/evaluation |
| **[FDDB (Face Detection Data Set and Benchmark)](http://vis-www.cs.umass.edu/fddb/)** | Dataset | 🟢 Public, Free | Face detection benchmarking |
| **[PII Masking Dataset (Kaggle)](https://www.kaggle.com/)** | Dataset | 🟢 Public, Free | NER-based PII detection for text |
| **[Presidio Analyzer](https://github.com/microsoft/presidio)** | Library | 🟢 Open-source | Text PII detection engine (reference) |
| **[Tesseract.js](https://tesseract.projectnaptha.com/)** | Library | 🟢 Open-source | In-browser OCR |
| **[ONNX Model Zoo](https://github.com/onnx/models)** | Models | 🟢 Open-source | Pre-trained face detection, image classification |
| **[Hugging Face Hub](https://huggingface.co/models)** | Models | 🟢 Open-source | ONNX-exported ViT, MobileNet, etc. |
| **[WebArena](https://webarena.dev/)** | Benchmark | 🟢 Open-source | Web agent evaluation tasks |

### 🔒 Data Access & Timing

- **All recommended data is public and free** — no paid APIs required
- **ISRO states** "Any open-source data can be used" + evaluation use cases provided at finale
- **Models can be pre-downloaded** and bundled with the extension — no runtime download needed
- **No Indian-specific PII dataset exists publicly** (Aadhaar patterns, PAN cards) — you'll need to create synthetic samples

### 🔄 Backup Plan if Ideal Data Is Unavailable

| Scenario | Backup Strategy |
|:---|:---|
| No real PII-heavy webpages for demo | Create a **synthetic demo portal** with fake profiles, forms, ID cards |
| Face detection model doesn't convert to ONNX cleanly | Use **BlazeFace** (Google's model, already optimized for web) |
| OCR fails on complex layouts | Fall back to **DOM text extraction** (read form field values directly from HTML) |
| WebGPU unavailable on demo machine | **WASM fallback** pre-tested and ready |
| Server-side VLM is too slow | Pre-cache common action responses; use a **smaller model** (e.g., Phi-3-vision) |

> [!TIP]
> **Pro move:** Build a "Demo Mode" toggle in your extension that uses a pre-built synthetic webpage with known PII placements. This guarantees a flawless demo even if the wifi is shaky.

---

## 10. Judge Q&A Stress-Test 🎤

### ❓ Q1: "Why not just run the entire VLM locally in the browser instead of splitting client-server?"

**Strong Answer:**
> "Full VLMs like Qwen2.5-VL-7B require 14+ GB of VRAM — that's impossible in a browser tab limited to ~4GB. Our architecture strategically splits the pipeline: lightweight, specialized models (BlazeFace at 400KB, MobileViT at 5MB) handle detection and redaction locally at 10+ FPS, while the heavy reasoning (understanding page context, planning actions) happens server-side. This is also why we score well on the 20% resource utilization metric — we keep client-side memory under 200MB."

**Follow-up:** *"What if WebGPU hardware improves — would you move everything local?"*
> "Absolutely. Our architecture is designed for progressive enhancement. As WebGPU and browser memory limits evolve, we can migrate larger models to the client. The privacy-preserving filter would still add value as a defense-in-depth layer even with local VLMs."

---

### ❓ Q2: "How do you guarantee that no PII leaks to the server? What if your detection model misses something?"

**Strong Answer:**
> "We implement defense-in-depth with three layers:
> 1. **Vision model detects** faces, ID cards, and sensitive UI regions
> 2. **OCR + regex/NER** catches text-based PII (Aadhaar patterns, emails, phone numbers) from the captured image
> 3. **Aggressive fallback**: any region with detection confidence below 0.7 is redacted by default — we prefer false positives (over-redacting) over false negatives (leaking PII)
>
> We also send **structural descriptions** (element types, positions, labels) rather than raw pixel data whenever possible, further minimizing leakage risk."

**Follow-up:** *"What's your false positive rate? Doesn't over-redacting hurt the server's reasoning ability?"*
> "In our tests on synthetic data, the false positive rate is ~8%. The server compensates because it receives semantic labels like 'REDACTED_FACE at (x,y)' or 'MASKED_TEXT_FIELD: name input' — so it retains structural understanding without needing the actual content."

---

### ❓ Q3: "What's the end-to-end latency? Can this work in real-time?"

**Strong Answer:**
> "On a mid-range laptop with integrated GPU, our pipeline runs at:
> - Screen capture: ~15ms
> - Face detection (BlazeFace): ~8ms
> - Text OCR + PII regex: ~120ms
> - Redaction rendering: ~10ms
> - Server round-trip + VLM inference: ~800ms
> - **Total: ~950ms per cycle**
>
> This is sub-second for the full loop. For pure local operations (detection + redaction), it's ~150ms — well within interactive speeds. We also implement frame skipping and change detection to avoid processing static screens."

**Follow-up:** *"That 800ms server latency — how does this scale with multiple users?"*
> "The server component is stateless and horizontally scalable. We use async WebSocket connections so the client isn't blocked while waiting. For enterprise deployment, you'd use a load-balanced VLM inference cluster (vLLM or TGI)."

---

### ❓ Q4: "This is ISRO's problem — how would this be used in a space/defence context specifically?"

**Strong Answer:**
> "ISRO and DoS have internal portals for mission planning, satellite data analysis, and personnel management. These portals contain classified data that cannot be sent to cloud AI providers. Our solution enables ISRO scientists to use AI assistants on these portals — the assistant sees redacted structural data while the scientist's screen data stays on their device. The server-side LLM can even be hosted on ISRO's internal network, creating a fully air-gapped agentic AI system."

**Follow-up:** *"Can this handle classified imagery — like satellite images?"*
> "The architecture supports custom PII definitions. For classified imagery, we can add region-classification models that detect sensitive image types (satellite imagery, maps, coordinates) and redact them. The modular filter pipeline makes it extensible."

---

### ❓ Q5: "Why a browser extension and not a native desktop app? Wouldn't native give better performance?"

**Strong Answer:**
> "Three reasons:
> 1. **Zero installation friction** — a browser extension deploys instantly across any OS without admin privileges, critical for government environments
> 2. **WebGPU now matches near-native performance** — our benchmarks show WebGPU inference is within 1.2x of native ONNX Runtime for our model sizes
> 3. **Security sandboxing** — browser extensions run in a sandboxed environment with declared permissions, making them auditable and trustworthy, which matters for ISRO's security team
>
> That said, our ONNX models are portable — the same pipeline could run natively via Electron or Tauri if needed."

**Follow-up:** *"What about cross-browser compatibility?"*
> "We target Chrome (Manifest V3) as primary, with Firefox as secondary. Both support WebGPU. The core inference logic runs in Web Workers using ONNX Runtime Web, which is browser-agnostic. Only the extension shell code differs."

---

### 🎯 Weakest Point a Sharp Judge Would Target

> [!CAUTION]
> **The weakest link is OCR-based text PII detection accuracy on complex, real-world webpages.** Tesseract.js struggles with:
> - Text over gradients or images
> - Very small font sizes
> - Non-Latin scripts
> - Dynamic content (animations, carousels)
>
> **Mitigation:** Supplement OCR with **DOM text extraction** (directly reading `innerText` from form fields and visible elements). This hybrid approach covers ~95% of text PII on standard web forms without relying solely on pixel-level OCR.

---

## 📊 Evaluation Metrics Alignment Cheatsheet

| Metric (ISRO) | Weight | Your Demo Must Show |
|:---|:---|:---|
| Visual context accuracy | **25%** | Side-by-side: raw screen vs. model's structural understanding |
| PII detection recall & precision | **20%** | Confusion matrix on test set: TP, FP, FN, TN for each PII type |
| Redaction precision | **20%** | Before/after comparison — clean redaction without data leakage |
| Client-side resource usage | **20%** | Real-time overlay: RAM (MB), GPU (%), CPU (%), model size |
| End-to-end latency | **15%** | Timer overlay showing ms for each pipeline stage |

---

## 🏁 Final Verdict

<table>
<tr>
<td style="font-size: 48px; text-align: center;">🟢</td>
<td>

### **GREEN LIGHT — Highly Recommended**

</td>
</tr>
</table>

> **Single Biggest Reason:** This PS sits at the **exact intersection of three mega-trends** — on-device AI, privacy-preserving computation, and agentic automation — with **no existing solution that combines all three**. The tech stack is mature enough (WebGPU, ONNX Runtime Web, Transformers.js) to build a working prototype within the hackathon timeline, yet the problem is deep enough that a well-executed solution will genuinely impress ISRO's technical evaluators. The clear evaluation metrics (25/20/20/20/15 split) remove ambiguity about what judges want, and the modular architecture allows parallel team execution.

### ✅ Why Green Light

| Factor | Score | Reason |
|:---|:---|:---|
| Technical Depth | ⭐⭐⭐⭐⭐ | Deep ML engineering, not just API calls |
| Feasibility | ⭐⭐⭐⭐ | Core tech is proven; needs sharp scoping |
| Innovation Opportunity | ⭐⭐⭐⭐⭐ | No complete solution exists — massive white space |
| Impact & Relevance | ⭐⭐⭐⭐⭐ | DPDP Act, defence, healthcare — universal need |
| Clarity of PS | ⭐⭐⭐⭐ | Clear deliverables and evaluation metrics provided |
| Evaluator Appeal | ⭐⭐⭐⭐⭐ | ISRO itself needs this — direct org alignment |
| Team Parallelizability | ⭐⭐⭐⭐ | Client/server/ML can be built simultaneously |

### ⚠️ One Caveat

> The team **must** have at least **one member** deeply comfortable with ONNX model conversion, WebGPU initialization, and browser extension development. Without this, the prototype will stall on low-level integration issues that AI code generation cannot reliably solve.

---

> *Analysis prepared for SIH 2026 preparation. Good luck! 🚀*
> 
> **References:**
> - [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
> - [Transformers.js](https://huggingface.co/docs/transformers.js)
> - [BlazeFace (Google Research)](https://arxiv.org/abs/1907.05047)
> - [SeeAct — ICML '24](https://github.com/OSU-NLP-Group/SeeAct)
> - [WebVoyager — ACL '24](https://github.com/MinorJerry/WebVoyager)
> - [Microsoft Presidio](https://github.com/microsoft/presidio)
> - [India DPDP Act 2023](https://www.meity.gov.in/data-protection-framework)
> - [WebGPU Specification](https://www.w3.org/TR/webgpu/)
> - [SCRFD Face Detection](https://github.com/deepinsight/insightface/tree/master/detection/scrfd)
