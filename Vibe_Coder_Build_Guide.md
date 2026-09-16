# 🧑‍💻 Vibe Coder's Complete Build Guide — SIH26171

## On-device Visual Perception for Light-weight Browser Agents

> **Who is this for?** You don't know how to code. You've never written JavaScript, Python, or any programming language. But you know how to talk to AI tools like Cursor, ChatGPT, Claude, Bolt.new, or Replit Agent. This guide gives you **every single prompt** to copy-paste into those tools to build the entire SIH project from scratch.

> [!IMPORTANT]
> **The Golden Rule of Vibe Coding:** Never give the AI a vague prompt like "build me the project." Break it into tiny pieces. One prompt = one feature. Test after every prompt. If something breaks, tell the AI what broke and paste the error.

---

## 📋 Table of Contents

1. [What You're Building (Simple Explanation)](#1-what-youre-building-simple-explanation)
2. [Pick Your AI Coding Tool](#2-pick-your-ai-coding-tool)
3. [Setup: Accounts & Installations](#3-setup-accounts--installations)
4. [Project Architecture Map](#4-project-architecture-map)
5. [Phase 1: Chrome Extension Skeleton](#phase-1-chrome-extension-skeleton-)
6. [Phase 2: Screen Capture System](#phase-2-screen-capture-system-)
7. [Phase 3: Extension UI (Popup + Side Panel)](#phase-3-extension-ui-popup--side-panel-)
8. [Phase 4: On-Device Face Detection](#phase-4-on-device-face-detection-)
9. [Phase 5: Screen Understanding (Vision Model)](#phase-5-screen-understanding-vision-model-)
10. [Phase 6: Text Extraction (OCR)](#phase-6-text-extraction-ocr-)
11. [Phase 7: PII Detection Engine](#phase-7-pii-detection-engine-)
12. [Phase 8: Redaction Engine](#phase-8-redaction-engine-)
13. [Phase 9: Server-Side Backend](#phase-9-server-side-backend-)
14. [Phase 10: Server-Side VLM Integration](#phase-10-server-side-vlm-integration-)
15. [Phase 11: End-to-End Agent Pipeline](#phase-11-end-to-end-agent-pipeline-)
16. [Phase 12: Dashboard & Demo Polish](#phase-12-dashboard--demo-polish-)
17. [The Demo Webpage (Fake PII Page)](#the-demo-webpage-fake-pii-page-)
18. [Testing Checklist](#testing-checklist-)
19. [Common Errors & How to Fix Them](#common-errors--how-to-fix-them-)
20. [Demo Day Playbook](#demo-day-playbook-)

---

## 1. What You're Building (Simple Explanation)

Imagine you're using a website that has personal info — names, faces, Aadhaar numbers, passwords. Now imagine an AI assistant that can help you use that website (click buttons, fill forms, scroll). The problem? That AI assistant needs to "see" your screen. And if it sends your screen to a server, your private data is exposed.

**Your solution:**

```
YOU (Browser)                              SERVER (Cloud)
┌─────────────────────┐                   ┌──────────────────┐
│                     │                   │                  │
│  1. Capture screen  │                   │  4. Smart AI     │
│  2. Find faces,     │   SAFE DATA ONLY  │     (VLM) sees   │
│     passwords, IDs  │ ───────────────► │     clean data   │
│  3. BLUR/HIDE them  │                   │  5. Decides what │
│                     │   COMMANDS BACK   │     to do next   │
│  7. Execute action  │ ◄─────────────── │  6. Sends back   │
│     (click, scroll) │                   │     "click X"    │
│                     │                   │                  │
└─────────────────────┘                   └──────────────────┘
       LOCAL (private)                        REMOTE (no PII)
```

**In plain English:**
- A Chrome extension captures what's on screen
- AI models **running inside your browser** find and blur sensitive stuff
- Only the "clean" version goes to a smart server
- The server tells the extension what to do next (like "click Submit")
- The extension does it automatically

---

## 2. Pick Your AI Coding Tool

You need ONE primary AI coding tool. Here's which to pick:

| Tool | Best For | Cost | Difficulty |
|:---|:---|:---|:---|
| **🥇 Cursor** | This project (file-by-file control) | $20/month | ⭐⭐ Medium |
| **🥈 Bolt.new** | Quick web prototypes | Free tier available | ⭐ Easy |
| **🥉 Replit Agent** | Full-stack with deploy | $25/month | ⭐ Easy |
| **Claude / ChatGPT** | Generating code to copy-paste | Free / $20/month | ⭐⭐ Medium |

> [!TIP]
> **My Recommendation:** Use **Cursor** as your primary tool (it edits files directly on your computer). Use **ChatGPT or Claude** as your "consultant" when you need to understand something or debug errors.

---

## 3. Setup: Accounts & Installations

### 📝 Prompt to give your AI tool FIRST:

> Copy-paste this into ChatGPT/Claude to get a personalized setup checklist:

```
I'm a complete beginner with zero coding knowledge. I need to set up my
computer to build a Chrome browser extension that uses AI/ML models.
My operating system is Windows.

Tell me step by step with download links:
1. How to install Node.js (latest LTS)
2. How to install VS Code
3. How to install the Cursor AI editor
4. How to install Python 3.11+
5. How to install Git
6. How to enable Chrome Developer Mode for loading extensions
7. How to install the "Live Server" extension in VS Code

For each step, give me the exact download link and what buttons to click.
Assume I know NOTHING about computers beyond basic usage.
```

### ✅ What You Need Installed (Checklist)

- [ ] **Node.js** (version 18+) — [nodejs.org](https://nodejs.org)
- [ ] **VS Code** or **Cursor** — [code.visualstudio.com](https://code.visualstudio.com) / [cursor.com](https://cursor.com)
- [ ] **Python 3.11+** — [python.org](https://python.org)
- [ ] **Git** — [git-scm.com](https://git-scm.com)
- [ ] **Google Chrome** (latest) — [google.com/chrome](https://google.com/chrome)
- [ ] **Chrome Developer Mode** enabled (for loading your extension)

### 🔑 Accounts You Need

- [ ] **Hugging Face** account (free) — [huggingface.co](https://huggingface.co) — for downloading AI models
- [ ] **GitHub** account (free) — [github.com](https://github.com) — for saving your code
- [ ] **Groq** or **Together AI** account (free tier) — for server-side AI API

---

## 4. Project Architecture Map

Your project has **two main parts.** Think of them as two separate apps that talk to each other.

```
📁 sih-browser-agent/
│
├── 📁 extension/          ← PART 1: The Chrome Extension (JavaScript)
│   ├── manifest.json      ← Extension's "ID card" — tells Chrome what it does
│   ├── popup.html         ← The small window that appears when you click the extension icon
│   ├── popup.js           ← Logic for the popup
│   ├── popup.css          ← Styling for the popup
│   ├── content.js         ← Code that runs ON the webpage (captures screen, executes commands)
│   ├── background.js      ← Background "brain" of the extension
│   ├── sidepanel.html     ← Side panel showing real-time detection dashboard
│   ├── sidepanel.js       ← Logic for the side panel
│   ├── sidepanel.css      ← Styling for the side panel
│   ├── workers/
│   │   ├── detection-worker.js    ← Runs face detection in background thread
│   │   └── ocr-worker.js         ← Runs text extraction in background thread
│   ├── models/            ← AI model files (downloaded from Hugging Face)
│   │   ├── blazeface.onnx
│   │   └── ... (other models)
│   └── utils/
│       ├── pii-detector.js   ← Finds personal info in text
│       ├── redactor.js       ← Blurs/hides sensitive stuff
│       └── dom-reader.js     ← Reads webpage content directly
│
├── 📁 server/             ← PART 2: The Python Server (AI reasoning)
│   ├── main.py            ← The server application
│   ├── requirements.txt   ← List of Python packages needed
│   └── prompts/
│       └── agent-prompt.txt  ← Instructions for the AI on how to analyze screens
│
├── 📁 demo-page/          ← PART 3: A fake webpage with PII for testing
│   ├── index.html
│   ├── style.css
│   └── fake-data.js
│
└── README.md              ← Project description
```

> [!NOTE]
> **You don't need to memorize this.** The AI will create all these files for you. This is just so you understand what each file does when the AI mentions it.

---

## Phase 1: Chrome Extension Skeleton 🦴

### What this does:
Creates the basic Chrome extension that shows an icon in your browser and opens a popup when clicked.

### 📋 PROMPT 1.1 — Create the project structure

> Copy-paste this ENTIRE prompt into Cursor (or your AI tool):

```
Create a Chrome browser extension project with Manifest V3 for a project
called "PrivacyShield AI". This extension will eventually do on-device
visual perception and PII detection, but for now just set up the skeleton.

Create the following file structure:
- manifest.json (Manifest V3)
- popup.html (basic popup with the app name and an ON/OFF toggle button)
- popup.js (handles the toggle)
- popup.css (dark theme, modern design, glassmorphism style)
- background.js (service worker, just logs "Extension loaded" for now)
- content.js (content script, just logs "Content script injected" for now)

In manifest.json:
- Name: "PrivacyShield AI"
- Description: "On-device visual perception with privacy-preserving PII detection for browser agents"
- Version: "1.0.0"
- Permissions needed: "activeTab", "scripting", "storage", "sidePanel", "tabCapture"
- Host permissions: "<all_urls>"
- Content script should run on all URLs
- Background should use service_worker
- Add a default popup
- Use 128x128 and 48x48 icon sizes (just use placeholder icon paths for now)

The popup should have:
- A dark gradient background (#0a0a1a to #1a1a3e)
- The title "PrivacyShield AI" with a shield emoji
- A glowing toggle switch to enable/disable the extension
- Status text showing "Active" or "Inactive"
- Modern font (Inter from Google Fonts)
- Rounded corners, subtle box shadows
- Size: 350px wide, 200px tall

Use vanilla JavaScript, no frameworks. No TypeScript.
Make the CSS visually premium — this is for a hackathon demo.
```

### 📋 PROMPT 1.2 — Create placeholder icons

```
Create simple SVG icons for my Chrome extension "PrivacyShield AI":
1. A 128x128 icon (icon128.png) - a shield shape with an eye/AI symbol inside,
   using colors #6366f1 (indigo) and #8b5cf6 (purple) with a gradient
2. A 48x48 version (icon48.png) of the same icon
3. A 16x16 version (icon16.png) of the same icon

Save these as PNG files in an "icons/" directory.
If you can't create actual images, create them as inline SVG data URIs
in the manifest.json.
```

### 🧪 HOW TO TEST THIS:

> Give this prompt to your AI tool if you don't know how to test:

```
I've just created a Chrome extension. Tell me step by step how to load it
in Chrome for testing:
1. How to open Chrome extensions page
2. How to enable Developer Mode
3. How to click "Load unpacked" and select my extension folder
4. How to see if it loaded correctly
5. How to see the popup when I click the extension icon
6. How to open Chrome DevTools console to see my console.log messages

Give me the exact steps with what to click and where.
```

> [!WARNING]
> **STOP HERE AND TEST.** Do not move to Phase 2 until:
> - ✅ The extension loads in Chrome without errors
> - ✅ Clicking the icon shows your popup
> - ✅ The toggle switch works
> - ✅ You see "Extension loaded" in the background console
> - ✅ You see "Content script injected" when visiting any website

---

## Phase 2: Screen Capture System 📸

### What this does:
Adds the ability to take a screenshot of the current browser tab.

### 📋 PROMPT 2.1 — Add screen capture

```
I have an existing Chrome extension (Manifest V3) called "PrivacyShield AI".

Now add screen capture functionality:

In background.js:
- Add a function called captureScreen() that uses chrome.tabs.captureVisibleTab()
  to capture the current tab as a PNG data URL
- This function should be triggered when the content script sends a message
  with action "captureScreen"
- Send the captured image data back to the content script

In content.js:
- When the extension is toggled ON (listen for message from popup),
  start a capture loop that:
  1. Sends a message to background.js requesting a screen capture
  2. Receives the screenshot as a base64 PNG data URL
  3. Creates a hidden canvas element and draws the screenshot on it
  4. Logs "Screenshot captured: [width]x[height]" to the console
  5. Waits 2 seconds, then captures again (use setInterval)
- When toggled OFF, stop the capture loop
- Store the toggle state using chrome.storage.local

In popup.js:
- When the toggle is switched, send a message to the content script
  with the new state (ON or OFF)
- Also save the state to chrome.storage.local

Important constraints:
- Do NOT use desktopCapture — use only chrome.tabs.captureVisibleTab
- The capture should be silent (no user prompt/dialog)
- Handle errors gracefully (log them, don't crash)
- Keep the capture interval at 2000ms for now (we'll optimize later)

Do not modify the existing CSS or popup design.
Do not break any existing functionality.
```

### 🧪 HOW TO TEST:

```
After adding screen capture to my Chrome extension, tell me:
1. How to reload the extension after making changes
2. How to open the DevTools console for the content script
   (which is different from the popup console)
3. What I should see in the console when capture is working
4. How to verify the screenshot is being captured correctly
```

---

## Phase 3: Extension UI (Popup + Side Panel) 🎨

### What this does:
Creates a beautiful side panel that shows real-time information about what the extension is detecting.

### 📋 PROMPT 3.1 — Create the side panel

```
Add a side panel to my Chrome extension "PrivacyShield AI" (Manifest V3).

Create sidepanel.html, sidepanel.js, and sidepanel.css:

The side panel should have these sections:

1. HEADER:
   - Extension name with logo
   - Connection status indicator (green dot = active, red dot = inactive)
   - Current tab URL display

2. DETECTION DASHBOARD (live-updating):
   - "Faces Detected" counter with face emoji
   - "PII Items Found" counter with lock emoji
   - "Items Redacted" counter with shield emoji
   - Each counter should have a number that animates when it changes

3. DETECTION LOG (scrollable list):
   - Each entry shows: timestamp, type (face/text/email/phone/aadhaar),
     confidence percentage, action taken (blurred/masked/redacted)
   - Color-coded by type (red for high-sensitivity, yellow for medium, green for low)

4. PERFORMANCE METRICS:
   - Inference time (ms) with a small bar chart showing last 10 readings
   - Memory usage (MB)
   - FPS counter
   - Model status (loaded / loading / error)

5. BEFORE/AFTER PREVIEW:
   - Two small image previews side by side
   - Left: "Original (Local Only)" — what the screen looks like
   - Right: "Server Sees" — the redacted version
   - These update every capture cycle

6. SERVER STATUS:
   - Connection indicator
   - Last command received from server
   - A "Manual Action" dropdown to test commands

Design requirements:
- Dark theme matching the popup (#0a0a1a to #1a1a3e gradient)
- Glassmorphism cards with backdrop-filter blur
- Smooth animations for counter changes
- Inter font from Google Fonts
- Accent colors: #6366f1 (indigo), #22d3ee (cyan), #f43f5e (rose)
- Width: full side panel width (~400px)
- Scrollable content area

In manifest.json, add the sidePanel configuration.
In background.js, add logic to open the side panel when the extension icon
is clicked (or add a button in the popup to open it).

For now, use placeholder/dummy data for all the numbers. We'll connect
real data later.
```

### 📋 PROMPT 3.2 — Connect popup to side panel

```
In my Chrome extension, add a button in the popup that opens the side panel.
Also make it so:
- The side panel automatically opens when the extension is turned ON
- The side panel receives updates from the content script via chrome.runtime messaging
- Create a shared messaging system where:
  - content.js sends detection results to sidepanel.js via background.js
  - The side panel updates its UI when it receives new data
  - Use a consistent message format: { type: "detection_update", data: { ... } }

Don't break existing functionality.
```

---

## Phase 4: On-Device Face Detection 🤖

### What this does:
Adds an AI model that runs INSIDE the browser to detect faces in screenshots. This is the CORE innovation.

### 📋 PROMPT 4.1 — Set up Transformers.js face detection

```
Add on-device face detection to my Chrome extension using Transformers.js
and ONNX Runtime Web.

Here's what I need:

1. Create a Web Worker file at workers/detection-worker.js that:
   - Imports Transformers.js from CDN:
     https://cdn.jsdelivr.net/npm/@huggingface/transformers
   - Loads a face detection model. Use the "object-detection" pipeline
     with a small model. Try "Xenova/detr-resnet-50" first, but if it's
     too heavy, suggest a lighter alternative.
   - Accepts image data (base64 or ImageData) via postMessage
   - Runs inference and returns bounding boxes for all detected faces/persons
   - Returns results in format:
     { type: "detection_result", faces: [{x, y, width, height, confidence}] }
   - Handles model loading progress and sends status updates:
     { type: "model_status", status: "loading" | "ready" | "error", progress: 0-100 }

2. In content.js:
   - Create the Web Worker when extension is toggled ON
   - After each screen capture, send the screenshot to the worker
   - Receive detection results from the worker
   - Log detected faces: "Detected [N] faces at positions [...]"

3. Performance requirements:
   - The model MUST run in a Web Worker (not the main thread)
   - Try to use WebGPU for acceleration: { device: "webgpu" }
   - Fall back to "wasm" if WebGPU is not available
   - The model should be loaded only once (cached after first load)

4. Add model loading indicator:
   - When the model is first loading, show a loading message in the side panel
   - Show download progress percentage
   - Once loaded, show "Model Ready ✅"

Important:
- Do NOT use TensorFlow.js — use Transformers.js or ONNX Runtime Web only
- The Web Worker cannot access DOM — so pass image data as ArrayBuffer or base64
- Handle errors: if model fails to load, show error but don't crash extension
- Keep model size under 50MB ideally
```

### 📋 PROMPT 4.2 — Switch to a lighter face detection model

> Use this prompt AFTER testing 4.1. If the model is too slow/heavy:

```
The object detection model I'm using in my Chrome extension is too heavy
for real-time browser inference. I need a much lighter alternative.

Replace the current model with one of these approaches (pick the best one):

Option A: Use a lightweight face detection model via Transformers.js
- Model: try "Xenova/yolov5-face" or similar small face detector
- Should be under 10MB
- Should run at least 5 FPS on a mid-range laptop

Option B: Use ONNX Runtime Web directly (not Transformers.js) with BlazeFace
- Use the onnxruntime-web npm package
- Load a BlazeFace ONNX model (under 2MB)
- BlazeFace input: 128x128 RGB image
- BlazeFace output: face bounding boxes with confidence scores
- Need to handle: image resizing to 128x128, normalization (0-1 range),
  output post-processing (anchor decoding, NMS)

Option C: Use MediaPipe Face Detection via their JS library
- @mediapipe/face_detection package
- Pre-built, optimized for browser
- Returns face bounding boxes directly

Which option gives the best balance of accuracy, speed, and model size
for a Chrome extension? Implement that option.

Update the detection-worker.js with the new model.
Keep the same message format for results.
Show model size and inference time in console logs.
```

### 📋 PROMPT 4.3 — Draw detection boxes on the page

```
In my Chrome extension's content.js, after receiving face detection results
from the Web Worker, visually show the detections on the webpage:

1. Create an overlay canvas element that sits on top of the entire webpage
   - Position: fixed, top: 0, left: 0, full viewport size
   - z-index: 999999 (above everything)
   - pointer-events: none (so users can still click through it)
   - Background: transparent

2. For each detected face, draw:
   - A semi-transparent red rectangle (bounding box) around the face
   - A small label above the box showing "Face [confidence]%"
   - Use a pulsing animation on the border to make it visually obvious

3. Clear and redraw the overlay on each new detection cycle

4. Add a keyboard shortcut (Ctrl+Shift+D) to toggle the overlay visibility
   (so users can show/hide detection boxes)

5. Make sure the overlay resizes when the browser window resizes

Don't modify the Web Worker. Only modify content.js.
```

---

## Phase 5: Screen Understanding (Vision Model) 🧠

### What this does:
Adds a second AI model that understands what's on the screen — buttons, text fields, images, etc.

### 📋 PROMPT 5.1 — Add DOM-based screen understanding

```
Add a screen understanding module to my Chrome extension. Instead of using
a heavy Vision Transformer model (which is too large for browser), use a
HYBRID approach that combines:

1. DOM Analysis (fast, accurate for web content):
   Create a file utils/dom-reader.js that:
   - Reads the current webpage's DOM and extracts:
     a. All visible text content (with positions via getBoundingClientRect)
     b. All interactive elements: buttons, links, inputs, selects, textareas
     c. All images (with alt text and positions)
     d. All form fields (with labels and current values)
     e. Page title and URL
   - Creates a structured JSON representation:
     {
       "url": "...",
       "title": "...",
       "viewport": { "width": ..., "height": ... },
       "elements": [
         {
           "id": "unique-id-1",
           "type": "button" | "input" | "link" | "image" | "text" | ...,
           "text": "Submit",
           "position": { "x": 100, "y": 200, "width": 80, "height": 30 },
           "attributes": { "name": "...", "placeholder": "..." },
           "isVisible": true,
           "isInteractable": true
         },
         ...
       ]
     }
   - Assigns each element a unique ID for later reference
   - Filters out hidden/invisible elements
   - Limits to top 100 most relevant elements (by visibility and interactability)

2. Visual Layout Description:
   - Groups elements by their position (header, sidebar, main content, footer)
   - Creates a natural language summary: "The page has a login form with
     email and password fields, a Submit button, and a navigation bar with
     5 links"

Integrate this into the content.js capture loop:
- After each screen capture, also run DOM analysis
- Combine the detection results (faces from Phase 4) with DOM understanding
- This combined data is what we'll eventually send to the server

This is the "vision" part that replaces a heavy ViT model for web content.
```

### 📋 PROMPT 5.2 — Add lightweight image classification for the screenshot

```
Add a lightweight image-level understanding to complement the DOM analysis.

In the detection worker (workers/detection-worker.js), add a SECOND model
that classifies the overall screenshot. Use Transformers.js with a small
image classification model:

- Model: "Xenova/mobilevit-small" or "Xenova/vit-base-patch16-224" (use
  whichever is smaller)
- Task: "image-classification"
- Input: the captured screenshot (resized to 224x224)
- Output: top-5 classification labels with confidence scores
  (e.g., "web_page", "form", "dashboard", "login_page", etc.)

This won't be perfect for web screenshots, but it adds an extra signal
for the server to understand what type of page the user is on.

Run this classification ONLY once every 5 captures (not every frame)
to save resources. Cache the last result.

Send the classification results alongside face detection results.
```

---

## Phase 6: Text Extraction (OCR) 📝

### What this does:
Extracts text from the screenshot so we can find personal information hidden in images, not just DOM text.

### 📋 PROMPT 6.1 — Add Tesseract.js OCR

```
Add text extraction (OCR) to my Chrome extension using Tesseract.js.

1. Create a new Web Worker at workers/ocr-worker.js that:
   - Uses Tesseract.js (import from CDN or bundle it)
     CDN: https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
   - Initializes the Tesseract worker with English language
   - Accepts image data (base64 PNG) via postMessage
   - Runs OCR and extracts all text with bounding box positions
   - Returns results in format:
     {
       type: "ocr_result",
       text: "full extracted text",
       words: [
         { text: "John", bbox: {x0, y0, x1, y1}, confidence: 95 },
         ...
       ],
       processingTime: 150 // milliseconds
     }
   - Handles loading progress (Tesseract downloads language data on first run)

2. In content.js:
   - Create the OCR worker alongside the detection worker
   - Send screenshots to BOTH workers in parallel
   - The OCR worker should run on every OTHER capture cycle (not every frame)
     to save CPU — so alternate: detect, detect+OCR, detect, detect+OCR, ...
   - Combine OCR results with face detection results

3. Performance optimization:
   - Before sending to OCR, resize the screenshot to max 1280px width
     (smaller = faster OCR)
   - Only run OCR on the visible viewport, not the entire page
   - Cache OCR results if the page hasn't scrolled or changed

Important: Tesseract.js is LARGE (several MB for language data). Show loading
progress in the side panel. The language data is downloaded once and cached
in the browser.
```

---

## Phase 7: PII Detection Engine 🔐

### What this does:
Takes all the extracted text (from DOM + OCR) and finds personal information — phone numbers, emails, Aadhaar numbers, etc.

### 📋 PROMPT 7.1 — Build the PII detector

```
Create a PII (Personally Identifiable Information) detection module for
my Chrome extension.

Create file utils/pii-detector.js that:

1. Takes input text (from DOM reading and OCR) and detects these PII types:

   INDIAN-SPECIFIC PII:
   - Aadhaar Number: 12-digit number, often formatted as XXXX XXXX XXXX
     Regex: /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g
   - PAN Card: 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F)
     Regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g
   - Indian Phone Number: +91 or 0 followed by 10 digits
     Regex: /(?:\+91[\s-]?|0)?[6-9]\d{9}\b/g
   - Indian Passport: Letter followed by 7 digits
     Regex: /\b[A-Z][0-9]{7}\b/g
   - Voter ID: 3 letters + 7 digits
     Regex: /\b[A-Z]{3}[0-9]{7}\b/g

   UNIVERSAL PII:
   - Email Address: standard email regex
   - Credit Card Number: 16 digits, possibly separated by spaces/dashes
   - Date of Birth: DD/MM/YYYY or DD-MM-YYYY or similar patterns
   - Social Security Number (US): XXX-XX-XXXX
   - Full Name: Any sequence of 2-3 capitalized words (use heuristic,
     not regex — check if it's near labels like "Name:", "Full Name:", etc.)
   - Password fields: Any text near labels like "Password", "PIN", "OTP"
   - Address: Multi-line text near "Address" labels

2. For each detected PII item, return:
   {
     type: "aadhaar" | "pan" | "phone" | "email" | "credit_card" | ...,
     value: "the detected text",
     maskedValue: "XXXX XXXX 1234" (partially masked for logging),
     confidence: 0.0 - 1.0,
     severity: "high" | "medium" | "low",
     position: { x, y, width, height } // if available from OCR/DOM
     source: "dom" | "ocr"
   }

3. Severity classification:
   - HIGH (red): Aadhaar, PAN, credit card, password, SSN
   - MEDIUM (yellow): phone, email, date of birth, passport
   - LOW (green): full name, address

4. The function should be:
   function detectPII(textContent, domElements) => PIIDetectionResult[]
   - textContent: raw text from OCR
   - domElements: array of DOM elements (from dom-reader.js) —
     check input field values, placeholders, and labels

5. Also check DOM input fields:
   - Any <input type="password"> → automatically flag as PII
   - Any input with name/id containing "ssn", "aadhaar", "pan", "card",
     "phone", "email", "dob" → flag the field value
   - Any input with autocomplete attributes suggesting PII

6. Deduplication: if the same PII is found in both DOM and OCR,
   keep only one entry (prefer DOM source as it has exact position)

Export the detectPII function and the PII type constants.
No external dependencies — pure JavaScript with regex.
```

### 📋 PROMPT 7.2 — Integrate PII detection into the pipeline

```
Integrate the PII detector (utils/pii-detector.js) into my Chrome extension's
content.js pipeline:

After the capture loop gets results from:
- Face detection worker (faces with bounding boxes)
- OCR worker (extracted text with word positions)
- DOM reader (page elements with positions and values)

Do this:
1. Run detectPII() with OCR text and DOM elements
2. Combine ALL detections into a single detection result object:
   {
     timestamp: Date.now(),
     url: window.location.href,
     pageTitle: document.title,
     faces: [...],  // from face detection worker
     piiItems: [...],  // from PII detector
     pageStructure: {...},  // from DOM reader
     metrics: {
       captureTime: Xms,
       detectionTime: Xms,
       ocrTime: Xms,
       piiScanTime: Xms,
       totalTime: Xms
     }
   }

3. Send this combined result to:
   - The side panel (for live dashboard update)
   - The redaction engine (Phase 8 — we'll build this next)
   - The background script (for logging)

4. Update the side panel counters:
   - "Faces Detected" = number of faces found
   - "PII Items Found" = number of PII items detected
   - Show severity breakdown in the detection log

5. Add console logging with timing:
   console.log(`[PrivacyShield] Cycle complete: ${faces.length} faces,
   ${piiItems.length} PII items, total: ${totalTime}ms`)

Don't rewrite existing code — just add the integration layer.
```

---

## Phase 8: Redaction Engine 🎭

### What this does:
Takes all detected faces and PII, and HIDES them from the screenshot before it goes to the server.

### 📋 PROMPT 8.1 — Build the redaction engine

```
Create the redaction engine for my Chrome extension.

Create file utils/redactor.js that:

1. Takes inputs:
   - Original screenshot (as canvas or base64 image)
   - Array of face detections (with bounding boxes)
   - Array of PII detections (with bounding boxes from OCR)
   - Array of DOM PII elements (with bounding boxes from DOM)

2. Creates a REDACTED version of the screenshot by:

   For FACES:
   - Apply Gaussian blur (radius 20px) over each face bounding box
   - Draw a semi-transparent overlay (#ff0066, 30% opacity) over the blur
   - Add a small label "REDACTED" in white text

   For TEXT PII (from OCR with bounding boxes):
   - Draw a solid colored rectangle over the text:
     - Black fill for HIGH severity (Aadhaar, PAN, credit card)
     - Dark gray fill for MEDIUM severity (phone, email)
     - White text on the rectangle showing the PII type: "[AADHAAR]", "[EMAIL]"
   - This completely covers the original text in the image

   For DOM-based PII (input fields):
   - Find the bounding box of the input element on screen
   - Draw a solid rectangle over it in the screenshot
   - Label it with the field type: "[PASSWORD FIELD]", "[PHONE INPUT]"

3. Also creates a STRUCTURAL DESCRIPTION of what was redacted:
   {
     "redactions": [
       {
         "type": "face",
         "position": { "x": 100, "y": 50, "width": 80, "height": 100 },
         "replacement": "REDACTED_FACE_1"
       },
       {
         "type": "aadhaar",
         "position": { "x": 200, "y": 300, "width": 150, "height": 20 },
         "replacement": "REDACTED_AADHAAR (last 4: 5678)"
       }
     ],
     "summary": "2 faces and 3 PII items were redacted from this frame"
   }

4. The function signature should be:
   async function redactFrame(canvas, detections) =>
     { redactedCanvas, redactedBase64, structuralDescription }

5. Performance: The redaction should take < 50ms on a standard laptop.
   Use canvas 2D operations only (no WebGL needed for this part).

6. Add a "confidence threshold" parameter (default 0.5):
   - Only redact items with confidence >= threshold
   - Items with confidence between 0.3 and 0.5 get a yellow "UNCERTAIN" overlay
     instead of full redaction (this shows judges we handle edge cases)

Test the redactor by:
- Creating a test function that loads a sample image
- Draws some fake face boxes and PII boxes
- Outputs the redacted version
- Log the time taken
```

### 📋 PROMPT 8.2 — Connect redaction to the pipeline and side panel

```
Connect the redaction engine to the main pipeline in content.js:

After each detection cycle:
1. Run the redactor on the captured screenshot with all detections
2. Send BOTH images to the side panel:
   - Original screenshot → "Before" preview (labeled "Local Only — Never Sent")
   - Redacted screenshot → "After" preview (labeled "What Server Sees")
3. The side panel should update the before/after preview images each cycle
4. Update the "Items Redacted" counter in the side panel

Also add a visual indicator on the webpage:
- A small floating badge in the bottom-right corner of the page showing:
  "🛡️ PrivacyShield: X items protected"
- The badge should pulse green when actively protecting
- Clicking the badge opens the side panel

When the extension is toggled OFF:
- Remove the overlay canvas
- Remove the floating badge
- Stop all workers
- Clear the side panel

Don't break existing code. Just add the redaction integration.
```

---

## Phase 9: Server-Side Backend 🖥️

### What this does:
Creates the Python server that receives the cleaned (redacted) data and uses a smart AI to understand it.

### 📋 PROMPT 9.1 — Create the FastAPI server

```
Create a Python backend server for my browser extension project.

Create the following in a "server/" directory:

1. server/main.py — A FastAPI server with these endpoints:

   POST /api/analyze
   - Receives: JSON with:
     {
       "redacted_screenshot": "base64 PNG string",
       "page_structure": { ... DOM structure ... },
       "redactions": [ ... list of what was redacted ... ],
       "url": "current page URL",
       "title": "page title",
       "task": "user's current task/goal (optional)"
     }
   - Returns: JSON with:
     {
       "understanding": "description of what the AI sees on the page",
       "action": {
         "type": "click" | "type" | "scroll" | "wait" | "done",
         "target": "element-id-123" or CSS selector,
         "value": "text to type" (for type actions),
         "reasoning": "why this action was chosen"
       },
       "confidence": 0.0-1.0
     }

   GET /api/health
   - Returns: { "status": "healthy", "model": "loaded" | "loading" }

   WebSocket /ws/agent
   - Real-time bidirectional communication
   - Extension sends detection data continuously
   - Server sends back actions in real-time
   - Handle connection/disconnection gracefully

2. server/requirements.txt:
   fastapi
   uvicorn[standard]
   websockets
   python-multipart
   pillow
   pydantic
   httpx
   python-dotenv

3. server/.env.example:
   AI_API_KEY=your_api_key_here
   AI_MODEL=llama-3.1-8b-instant
   AI_PROVIDER=groq
   PORT=8000

4. Enable CORS for all origins (for development)
5. Add request logging
6. Add error handling middleware
7. Serve on port 8000

For now, the /api/analyze endpoint should return a MOCK response
(we'll add real AI in the next phase). The mock should return a
random action like "click" or "scroll" with a random element target.

Include a README with:
- How to install dependencies: pip install -r requirements.txt
- How to run the server: uvicorn main:app --reload --port 8000
- How to test: visit http://localhost:8000/docs for Swagger UI
```

### 📋 PROMPT 9.2 — Run the server (give this to your AI tool)

```
Tell me step by step how to run this Python FastAPI server:
1. How to open a terminal/command prompt
2. How to navigate to the server/ directory
3. How to create a Python virtual environment
4. How to install the requirements
5. How to run the server
6. How to verify it's running (what URL to open)
7. How to see the API documentation

I'm on Windows and I've never used Python before.
Give me the EXACT commands to copy-paste.
```

---

## Phase 10: Server-Side VLM Integration 🧠

### What this does:
Connects the server to a real AI model (VLM) that can look at the redacted screenshot and decide what to do.

### 📋 PROMPT 10.1 — Integrate Groq API (free, fast)

```
In my FastAPI server (server/main.py), replace the mock AI response with
a real AI integration using the Groq API.

Why Groq? It's free, fast, and supports vision models.

1. Sign up at https://console.groq.com and get a free API key

2. Update the /api/analyze endpoint to:
   a. Take the redacted screenshot (base64) and page structure
   b. Send them to Groq's API using their vision model
   c. The prompt to the AI should be:

   SYSTEM PROMPT:
   """
   You are a browser automation agent. You receive:
   1. A screenshot of a webpage (with sensitive data redacted/blurred)
   2. A structural description of the page (DOM elements with positions)
   3. A list of redacted items (what was hidden and where)

   Your job is to:
   1. Understand what the user is looking at
   2. Determine the next best action to help the user complete their task
   3. Return a specific, executable action

   RULES:
   - Never ask for the redacted content — it was removed for privacy
   - Use element IDs or CSS selectors to target actions
   - Be specific: "click the blue Submit button at position (300, 450)"
   - If unsure, return action type "wait" with reasoning

   Return your response as JSON:
   {
     "understanding": "Brief description of the current page state",
     "action": {
       "type": "click" | "type" | "scroll" | "select" | "wait" | "done",
       "target": "CSS selector or element ID",
       "value": "text to type (if applicable)",
       "position": { "x": 300, "y": 450 },
       "reasoning": "Why this action helps the user"
     },
     "confidence": 0.85
   }
   """

   USER PROMPT:
   """
   Here is the current state of the webpage:
   URL: {url}
   Title: {title}
   Task: {task or "Help the user navigate this page"}

   Page Structure:
   {JSON stringified page structure}

   Redacted Items:
   {JSON stringified redaction list}

   What action should I take next?
   """

3. Use Groq's API with model "llama-3.2-90b-vision-preview" or
   "llama-3.2-11b-vision-preview" for vision capability.

4. If Groq fails or is slow, fall back to a simpler text-only analysis
   using just the page structure (without the screenshot).

5. Parse the AI's response and validate it's proper JSON before returning.
   If parsing fails, return a safe default: { action: { type: "wait" } }

6. Add rate limiting: max 1 request per 2 seconds to Groq to stay in
   free tier limits.

7. Log every request/response for debugging.

Use httpx for async HTTP calls to Groq's API.
Load the API key from .env file using python-dotenv.
```

### 📋 PROMPT 10.2 — Alternative: Use Ollama (fully local, no API key)

> Use this prompt if you want to run the AI model completely locally (no internet needed):

```
As an alternative to Groq API, add support for Ollama (local AI model server).

Add to server/main.py:
1. A configuration option to choose between "groq" and "ollama" as AI provider
2. If provider is "ollama":
   - Connect to Ollama running locally at http://localhost:11434
   - Use model "llava" or "llama3.2-vision" for vision tasks
   - Send the redacted screenshot + page structure
   - Use the same prompt template as the Groq integration
   - Parse the response identically

Also create a setup guide for Ollama:
1. Download Ollama from https://ollama.com
2. Install it
3. Run: ollama pull llava
4. The server auto-starts at localhost:11434
5. My FastAPI server connects to it automatically

Add a /api/config endpoint that lets the extension switch between
"groq" and "ollama" providers at runtime.
```

---

## Phase 11: End-to-End Agent Pipeline 🔄

### What this does:
Connects EVERYTHING together — extension captures → detects → redacts → sends to server → receives command → executes it.

### 📋 PROMPT 11.1 — Connect extension to server

```
Connect my Chrome extension to the FastAPI server for the complete
agent pipeline.

In content.js, add a ServerConnector module:

1. CONNECTION:
   - Connect to the server via WebSocket at ws://localhost:8000/ws/agent
   - Auto-reconnect if connection drops (with exponential backoff)
   - Show connection status in the side panel

2. DATA FLOW (the complete pipeline):
   Every capture cycle (when extension is ON):

   Step 1: Capture screenshot (already done)
   Step 2: Run face detection + OCR + DOM analysis in parallel (already done)
   Step 3: Run PII detection on text results (already done)
   Step 4: Run redaction on the screenshot (already done)
   Step 5: NEW — Send to server:
     {
       "redacted_screenshot": base64 of the REDACTED image (NOT original),
       "page_structure": DOM analysis result,
       "redactions": list of what was redacted,
       "url": current URL,
       "title": page title,
       "metrics": {
         "faces_detected": N,
         "pii_items_found": N,
         "processing_time_ms": N
       }
     }
   Step 6: NEW — Receive server response with action command
   Step 7: NEW — Execute the action (see below)

3. ACTION EXECUTION:
   Create a function executeAction(action) in content.js that handles:

   - "click": Find element by CSS selector or ID → element.click()
   - "type": Find input element → set its value, dispatch input event
   - "scroll": window.scrollBy(0, action.value) or element.scrollIntoView()
   - "select": Find select element → set selectedIndex
   - "wait": Do nothing, wait for next cycle
   - "done": Show "Task Complete ✅" notification, stop the pipeline

   For click actions:
   - Try to find element by: ID → CSS selector → XPath → position (coordinates)
   - Highlight the target element briefly (green flash) before clicking
   - Log: "Executing: click on [element description]"

   For type actions:
   - Find the input field
   - Set its value character by character with small delays (looks natural)
   - Dispatch 'input' and 'change' events so the page reacts

4. SAFETY FEATURES:
   - Before executing any action, show a 2-second preview in the side panel:
     "Next action: Click 'Submit' — Cancel?"
   - If user doesn't cancel, execute the action
   - Add a "Pause" button in the side panel that stops action execution
     but continues detection/redaction
   - Never execute actions on URLs containing "bank", "payment", "admin"
     unless user explicitly confirms

5. METRICS:
   - Track round-trip time (send → receive command → execute)
   - Show in the side panel: "Server response: 450ms"
   - Show last 5 actions executed in a log

Handle the case where the server is not running:
- Show "Server Offline" in the side panel
- Continue local detection and redaction (that still has value)
- Queue the last 5 frames and send when server reconnects
```

### 📋 PROMPT 11.2 — Add the task input

```
Add a "Task" input to the Chrome extension so the user can tell the AI
what they want to accomplish.

In the popup (popup.html):
1. Add a text input field below the toggle switch:
   - Placeholder: "What would you like to do? (e.g., Fill out this form)"
   - Label: "Your Task"
   - Submit button or enter-key to set the task

2. When the user sets a task:
   - Save it to chrome.storage.local
   - Send it to content.js
   - content.js includes it in every server request as the "task" field
   - Show the active task in the side panel header

3. Example tasks:
   - "Fill out this registration form with dummy data"
   - "Navigate to the settings page and change the language to Hindi"
   - "Find and click the download button for the latest report"

4. If no task is set, send task as "Help the user navigate this page"

This helps the server AI understand what the user wants to achieve,
so it can return better action commands.
```

---

## Phase 12: Dashboard & Demo Polish ✨

### What this does:
Makes everything look incredible for the judges. Visual polish is what separates winners from participants.

### 📋 PROMPT 12.1 — Enhance the side panel dashboard

```
Completely redesign the side panel (sidepanel.html, sidepanel.css,
sidepanel.js) to be a visually stunning, real-time dashboard.

Design inspiration: Think of it like a cybersecurity operations center
or a Tesla car dashboard — dark, minimal, glowing, futuristic.

LAYOUT (top to bottom):

1. TOP BAR:
   - "PrivacyShield AI" logo/text with a subtle glow effect
   - Live clock showing elapsed time since activation
   - Green/red pulsing dot for status

2. HERO METRICS (large, centered cards in a row):
   - Three glassmorphism cards side by side:
     - 🛡️ "Protected" — count of redacted items (large number, cyan glow)
     - 👁️ "Detected" — count of PII found (large number, rose glow)
     - ⚡ "Latency" — current processing time in ms (large number, amber glow)
   - Numbers should animate (count up) when they change
   - Each card has a small sparkline graph showing last 20 values

3. BEFORE/AFTER COMPARISON:
   - Two image panels side by side
   - Left: "🔒 Original (Local Only)" — original screenshot thumbnail
   - Right: "📤 Server View (Sanitized)" — redacted screenshot thumbnail
   - Click either to see full-size in a modal
   - Red highlighted areas showing where redaction happened

4. DETECTION FEED (scrollable):
   - Live feed of detections, newest at top
   - Each entry is a compact card:
     [🔴 HIGH] Aadhaar Number detected — REDACTED — 0.95 confidence — 12ms ago
     [🟡 MED]  Email detected — MASKED — 0.87 confidence — 14ms ago
     [🟢 LOW]  Name detected — BLURRED — 0.72 confidence — 15ms ago
   - Smooth slide-in animation for new entries
   - Max 50 entries, auto-remove oldest

5. PERFORMANCE PANEL:
   - Four mini gauges (circular progress indicators):
     - CPU Usage (%)
     - Memory (MB / max MB)
     - GPU Usage (if available, else "N/A")
     - FPS (frames per second of detection)
   - Processing pipeline breakdown (horizontal stacked bar):
     [Capture 15ms][Detection 45ms][OCR 120ms][PII 5ms][Redact 10ms][Server 450ms]
     Each segment is a different color

6. AGENT LOG:
   - Last 5 server commands and their execution status:
     ✅ "Click 'Submit' button" — executed 3s ago
     ⏳ "Scroll down 200px" — executing...
     ❌ "Type in search box" — failed (element not found)

7. FOOTER:
   - "Powered by WebGPU + ONNX Runtime" badge
   - "Privacy Mode: ACTIVE" indicator
   - Settings gear icon (for server URL config)

DESIGN TOKENS:
- Background: linear-gradient(135deg, #0a0a1a, #0f1729)
- Cards: rgba(255,255,255,0.05) with backdrop-filter: blur(10px)
- Border: 1px solid rgba(255,255,255,0.1)
- Text primary: #e2e8f0
- Text secondary: #94a3b8
- Accent cyan: #22d3ee
- Accent rose: #f43f5e
- Accent amber: #f59e0b
- Accent indigo: #6366f1
- Font: 'Inter', system-ui, sans-serif
- Border radius: 12px for cards
- Shadows: 0 4px 20px rgba(0,0,0,0.3)

ANIMATIONS:
- Numbers: use CSS counter animation or JS requestAnimationFrame
- New detection entries: slideInLeft with fade
- Gauge values: smooth CSS transition (0.5s ease)
- Status dot: CSS pulse animation
- Cards: subtle hover:scale(1.02) with transition

The entire side panel should feel ALIVE — constantly updating,
pulsing, moving. But not distracting — smooth and professional.

Use only vanilla HTML/CSS/JS. No frameworks.
Import Inter font from Google Fonts CDN.
```

### 📋 PROMPT 12.2 — Add sound effects and notifications

```
Add subtle audio feedback and browser notifications to the extension:

1. When a HIGH severity PII is detected for the first time on a page:
   - Play a subtle "shield" sound effect (create a short beep using
     Web Audio API — don't use external audio files)
   - Show a Chrome notification: "🛡️ PrivacyShield: Aadhaar number
     detected and redacted"

2. When the agent successfully executes an action:
   - Play a subtle "click" confirmation sound
   - Flash the floating badge green

3. When server connection is lost:
   - Play a warning tone
   - Show notification: "⚠️ PrivacyShield: Server disconnected.
     Local protection continues."

4. Add a setting to mute all sounds (default: sounds ON for demo,
   because it impresses judges to HEAR the AI working)

Keep sounds very subtle — short (< 200ms), low volume.
Generate them programmatically using Web Audio API oscillators.
```

---

## The Demo Webpage (Fake PII Page) 🎭

### What this does:
Creates a realistic-looking webpage full of fake personal data for testing and demoing.

### 📋 PROMPT 13.1 — Create the demo webpage

```
Create a realistic-looking demo webpage in a "demo-page/" folder that
contains lots of fake PII data for testing my privacy extension.

The page should look like a GOVERNMENT PORTAL (similar to DigiLocker or
UMANG) with these sections:

1. HEADER: "DigiServices Portal" with Indian government-style branding
   (blue and white, Ashoka Chakra-inspired design, but clearly FAKE)

2. USER PROFILE SECTION:
   - Profile photo: Use a placeholder face image from
     https://randomuser.me/api/portraits/men/42.jpg
   - Full Name: "Rajesh Kumar Sharma"
   - Aadhaar Number: "4832 7591 6045"
   - PAN: "BKRPS4523F"
   - Date of Birth: "15/08/1990"
   - Email: "rajesh.sharma@email.com"
   - Phone: "+91 98765 43210"
   - Address: "42, MG Road, Sector 15, Noida, UP - 201301"

3. DOCUMENT TABLE:
   A table showing "My Documents" with columns:
   | Document | ID Number | Status | Action |
   | Aadhaar Card | 4832 7591 6045 | Verified ✅ | Download |
   | PAN Card | BKRPS4523F | Verified ✅ | Download |
   | Voter ID | XYZ4567890 | Pending ⏳ | Upload |
   | Passport | J8234567 | Expired ❌ | Renew |

4. FORM SECTION:
   "Update Your Details" form with:
   - Full Name input (pre-filled)
   - Email input (pre-filled)
   - Phone input (pre-filled)
   - Password field (with dots)
   - Aadhaar input (pre-filled)
   - Address textarea (pre-filled)
   - "Submit" button

5. SIDEBAR:
   - Notifications panel with messages containing names and dates
   - Quick links

6. SECOND PROFILE IMAGE:
   - Show a second face image somewhere (family member section)
   - https://randomuser.me/api/portraits/women/44.jpg

Design: Make it look REALISTIC and professional — like a real government
portal. Use:
- Blue color scheme (#003366, #0055aa)
- Clean, tabular layout
- Government-style fonts (system fonts are fine)
- Responsive design

This is purely for DEMO purposes. All data is fake.
Add a small banner at the top: "⚠️ This is a demo page with fake data
for PrivacyShield AI testing"

Serve this as a standalone HTML file that can be opened in Chrome.
```

---

## Testing Checklist ✅

### 📋 PROMPT — Generate test script

```
Create a comprehensive testing checklist and a simple test script for
my PrivacyShield AI Chrome extension.

Create a file test-checklist.md with:

MANUAL TESTING CHECKLIST:

□ Extension loads without errors in Chrome
□ Popup appears and toggle works
□ Side panel opens and shows dashboard
□ Screen capture works (check console logs)
□ Face detection model loads (check "Model Ready" status)
□ Face detection boxes appear on the demo page's profile photos
□ OCR extracts text from the page
□ PII detector finds: Aadhaar, PAN, phone, email on demo page
□ Redaction engine blurs faces in the screenshot
□ Redaction engine masks PII text in the screenshot
□ Before/After preview shows in side panel
□ Server connection establishes (green dot)
□ Server receives redacted screenshot (check server logs)
□ Server returns an action command
□ Extension executes the action (e.g., clicks a button)
□ Floating badge shows "X items protected"
□ Side panel shows performance metrics
□ Detection feed updates in real-time
□ Extension works when toggled OFF then ON again
□ Extension works after browser restart
□ Extension works on different websites (not just demo page)

PERFORMANCE TESTING:
□ Total cycle time < 2 seconds
□ Memory usage < 300MB
□ No browser tab crashes after 5 minutes of continuous use
□ Face detection accuracy: detects both faces on demo page
□ PII detection: finds all 6+ PII items on demo page (Aadhaar, PAN,
  phone, email, DOB, address)

Also create a simple HTML test runner (test/test-pii.html) that:
- Loads the pii-detector.js module
- Runs it against sample text strings containing known PII
- Shows pass/fail for each test case
- Test cases should include:
  - "My Aadhaar is 4832 7591 6045" → should detect Aadhaar
  - "Email me at test@gmail.com" → should detect email
  - "Call +91 98765 43210" → should detect phone
  - "PAN: BKRPS4523F" → should detect PAN
  - "No PII in this text" → should detect nothing
  - Edge cases: partial numbers, fake look-alikes
```

---

## Common Errors & How to Fix Them 🔧

> When something breaks (and it WILL break), copy-paste the error into your AI tool with this template:

### 🚨 Universal Error-Fixing Prompt Template

```
I'm building a Chrome extension called "PrivacyShield AI" for on-device
visual perception and PII detection. I'm getting this error:

ERROR:
[paste the exact error message here]

CONTEXT:
- This error appears in: [popup console / content script console /
  background worker console / server terminal]
- I was trying to: [what you were doing when it broke]
- The last change I made was: [what prompt/change you did before the error]

FILES INVOLVED:
[paste the relevant file name or content if small]

Please:
1. Explain what this error means in simple terms
2. Tell me exactly which file to change and what to change
3. Give me the corrected code
4. Tell me how to verify the fix worked
```

### 📋 Common Errors Reference Table

| Error | Where | What It Means | Quick Fix |
|:---|:---|:---|:---|
| `Uncaught TypeError: Cannot read properties of undefined` | Any JS file | You're trying to use something that doesn't exist yet | Check if the variable is loaded/initialized first |
| `Service worker registration failed` | Chrome extensions page | Error in background.js | Check background.js for syntax errors |
| `Manifest is not valid JSON` | Chrome extensions page | Typo in manifest.json | Use a JSON validator online |
| `CORS error` / `blocked by CORS policy` | Content script console | Browser blocking server requests | Make sure FastAPI has CORS middleware enabled |
| `WebGPU is not supported` | Detection worker | User's browser doesn't support WebGPU | The fallback to WASM should handle this |
| `Out of memory` | Any | Model is too large for browser | Use a smaller/quantized model |
| `WebSocket connection failed` | Content script console | Server not running | Start the Python server first |
| `Cannot access chrome:// URL` | Content script console | Extension trying to work on Chrome's own pages | That's normal — skip Chrome's internal pages |
| `Module not found` / `import error` | Server terminal | Missing Python package | Run `pip install -r requirements.txt` |
| `Port 8000 already in use` | Server terminal | Something else using that port | Kill the other process or use a different port |

---

## Demo Day Playbook 🎬

### 📋 PROMPT — Create demo script

```
Create a detailed demo script for presenting "PrivacyShield AI" at
the Smart India Hackathon finale to ISRO judges.

The demo should be exactly 5 minutes long and cover all 5 evaluation
criteria (Visual context 25%, PII detection 20%, Redaction 20%,
Resource usage 20%, Latency 15%).

DEMO SCRIPT:

MINUTE 0:00 - 0:30 — THE PROBLEM (Hook)
"Every time an AI agent helps you browse the web, it sees everything
on your screen — your Aadhaar, your face, your passwords. Let me show
you what happens without privacy protection..."
[Show a raw screenshot being sent to a server — scary]

MINUTE 0:30 - 1:30 — THE SOLUTION (Live Demo Part 1)
"PrivacyShield AI changes that. Watch..."
[Open the demo DigiServices page]
[Click the extension icon and toggle ON]
[Point at: model loading → "Running entirely in your browser using WebGPU"]
[Wait for first detection cycle]
[Point at: face detection boxes appearing on profile photos]
[Point at: PII highlights appearing on Aadhaar, PAN, phone numbers]

MINUTE 1:30 - 2:30 — THE PRIVACY MAGIC (Live Demo Part 2)
"Now watch what the server ACTUALLY sees..."
[Open the side panel]
[Point at: Before/After comparison]
[Zoom in on "Before" — clear faces and text visible]
[Zoom in on "After" — faces blurred, PII masked]
"The server receives ZERO personal data. No faces. No Aadhaar. No passwords."
[Point at detection log: "Aadhaar REDACTED, Face BLURRED, Email MASKED"]

MINUTE 2:30 - 3:30 — THE AGENT IN ACTION (Live Demo Part 3)
"But the AI agent can still help the user..."
[Type a task: "Submit this form"]
[Show server receiving clean data]
[Show server analyzing the page structure]
[Show the action command: "Click the Submit button"]
[Show the extension auto-clicking Submit — button flashes green]
"Full task completed without ever exposing personal data."

MINUTE 3:30 - 4:30 — PERFORMANCE (Live Demo Part 4)
[Point at performance panel in side panel]
"All processing happens locally in under 200 milliseconds.
Memory usage: 180MB. FPS: 8 frames per second.
End-to-end including server: under 1 second."
[Point at the pipeline breakdown bar chart]

MINUTE 4:30 - 5:00 — IMPACT & FUTURE
"This technology enables ISRO to deploy AI assistants on classified
portals without data leakage. It enables healthcare AI without
exposing patient records. And it's built entirely on open-source
technology — WebGPU, ONNX Runtime, and open-weight AI models."

Format this as a teleprompter-style script that someone can read
while doing the demo. Include [ACTION] tags for what to do on screen.
```

### 📋 PROMPT — Prepare for judge Q&A

```
I'm presenting "PrivacyShield AI" (on-device visual perception for
browser agents) at SIH to ISRO judges.

Generate 15 tough questions that judges might ask, organized by
difficulty, and give me strong answers for each.

For each answer:
- Keep it under 30 seconds when spoken
- Include a specific technical detail (not generic)
- End with a confident closing statement

Categories:
1. Technical Architecture (5 questions)
2. Privacy & Security (3 questions)
3. Performance & Scalability (3 questions)
4. Comparison with Existing Solutions (2 questions)
5. Real-World Application (2 questions)

Also include 3 "curveball" questions that judges might ask to
test if we ACTUALLY understand the tech vs. just using AI to build it.
Include answers for those too.
```

---

## 🗺️ Build Order Summary

Here's the exact order to build everything. Follow this strictly.

```
WEEK 1: FOUNDATION (Do these in order)
────────────────────────────────────────
Day 1-2:
  ✅ Phase 1: Chrome extension skeleton
  ✅ Phase 2: Screen capture
  ✅ Test: Extension loads, captures screenshots

Day 3-4:
  ✅ Phase 3: Side panel UI
  ✅ Phase 13: Demo webpage (fake PII page)
  ✅ Test: Side panel opens, demo page looks realistic

Day 5-7:
  ✅ Phase 4: Face detection (most critical — spend extra time here)
  ✅ Test: Faces detected on demo page

WEEK 2: INTELLIGENCE
────────────────────────────────────────
Day 8-9:
  ✅ Phase 5: DOM-based screen understanding
  ✅ Phase 6: OCR text extraction
  ✅ Test: Text extracted, DOM structure captured

Day 10-11:
  ✅ Phase 7: PII detection
  ✅ Test: All PII items found on demo page

Day 12-13:
  ✅ Phase 8: Redaction engine
  ✅ Test: Before/after screenshots look correct

Day 14:
  ✅ Integration testing (everything working together locally)

WEEK 3: SERVER + POLISH
────────────────────────────────────────
Day 15-16:
  ✅ Phase 9: Server backend
  ✅ Phase 10: VLM integration (Groq API)
  ✅ Test: Server responds with actions

Day 17-18:
  ✅ Phase 11: End-to-end pipeline
  ✅ Test: Full loop works (capture → detect → redact → send → execute)

Day 19-20:
  ✅ Phase 12: Dashboard polish
  ✅ Demo rehearsal
  ✅ Q&A preparation

Day 21:
  ✅ Final testing on multiple websites
  ✅ Record backup demo video
  ✅ Prepare presentation slides
```

---

## 🎯 Critical Tips for Vibe Coders

### The 5 Golden Rules

> [!IMPORTANT]
> 1. **ONE PROMPT = ONE FEATURE.** Never ask the AI to build everything at once. Small prompts = better code.
>
> 2. **TEST AFTER EVERY PROMPT.** Don't stack 5 features without testing. If something breaks at step 3, you won't know if it was step 1, 2, or 3 that broke it.
>
> 3. **SAVE WORKING VERSIONS.** After each phase works, copy the entire project folder as a backup (e.g., "extension-v1-working", "extension-v2-facedetection"). If something breaks, you can go back.
>
> 4. **READ THE ERRORS.** When something breaks, the error message tells you EXACTLY what's wrong. Copy the FULL error message into your AI tool. Don't just say "it doesn't work."
>
> 5. **UNDERSTAND WHAT YOU BUILT.** Before the demo, ask your AI tool: "Explain in simple terms how each file in my extension works and how they talk to each other." You MUST be able to explain it to judges.

### The Cheat Code Prompt

> When you're stuck and nothing works, use this nuclear option:

```
I'm building a Chrome extension for on-device visual perception and PII
detection. Something is broken and I've been going in circles.

Here is my ENTIRE project. Please:
1. Review every file for errors
2. Check if all the connections between files are correct
3. Check if manifest.json matches the actual file structure
4. Look for missing imports, wrong paths, or typos
5. Fix everything and tell me exactly what you changed and why

[paste your key files here, or use Cursor which can see all files]
```

---

## 🔗 Quick Reference Links

| Resource | URL | What It's For |
|:---|:---|:---|
| Transformers.js Docs | https://huggingface.co/docs/transformers.js | Browser AI models |
| ONNX Runtime Web | https://onnxruntime.ai/docs/tutorials/web/ | Running ML models in browser |
| Chrome Extension Docs | https://developer.chrome.com/docs/extensions/mv3/ | Extension development |
| Tesseract.js | https://tesseract.projectnaptha.com/ | In-browser OCR |
| Groq API | https://console.groq.com | Free AI API for server-side |
| Ollama | https://ollama.com | Local AI model runner |
| WebGPU Status | https://webgpureport.org | Check browser WebGPU support |
| Hugging Face Models | https://huggingface.co/models?library=transformers.js | Browse available models |
| FastAPI Docs | https://fastapi.tiangolo.com | Python server framework |

---

> **Remember:** You're not pretending to be a coder. You're an ARCHITECT who uses AI as a tool. The judges will respect that if you can explain WHAT you built, WHY you made each decision, and HOW the pieces connect — even if the AI wrote the actual code. 🚀
