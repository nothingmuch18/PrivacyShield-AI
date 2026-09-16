"""
PrivacyShield AI — FastAPI Backend Server (v2: Intelligent Agent Brain)
Receives redacted screenshots and page structure from the Chrome extension,
analyzes them using a VLM (Groq or Ollama), and returns intelligent action commands.

Features:
- Conversation memory (per WebSocket connection)
- Multi-step task planning
- Smart pre-processor with anti-loop detection
- Robust JSON parsing with fallbacks
- Chat endpoint for conversational interaction
"""

import os
import re
import json
import time
import base64
import logging
from typing import Optional
from datetime import datetime
from collections import defaultdict
import io
import csv
import pypdf

# LangGraph Agent
from agent.graph import agent_graph

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv()

# ---- Configuration ----
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "openai/gpt-oss-20b")
AI_PROVIDER = os.getenv("AI_PROVIDER", "groq")  # "groq" or "ollama"
PORT = int(os.getenv("PORT", "8000"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# Rate limiting
LAST_REQUEST_TIME = 0
MIN_REQUEST_INTERVAL = 2.0  # seconds

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("privacyshield")

# ---- Conversation Memory (per connection) ----
# Maps connection_id -> list of {action, result, timestamp}
connection_memory: dict[str, list[dict]] = defaultdict(list)
MEMORY_LIMIT = 20

# Scraped data storage
scraped_data_store: dict[str, list[dict]] = defaultdict(list)

# ================================================================
#  SYSTEM PROMPT — The Agent's Brain
# ================================================================

SYSTEM_PROMPT = """You are PrivacyShield AI, an intelligent browser automation agent that helps users complete tasks on web pages while respecting privacy.

## YOUR INPUTS
You receive the following from a privacy-preserving client-side filter:
1. **Accessibility Tree** (PRIMARY) — A semantic, structured representation of the page elements with roles, names, states, and bounding boxes. USE THIS for element targeting.
2. **Redaction Manifest** — Lists tokens (e.g., [AADHAAR_1], [FACE_1]) that replaced sensitive data. You know WHAT TYPE was redacted, but never the actual values.
3. **DOM Structure** (FALLBACK) — Raw DOM elements with positions, types, and text content. Use only if the accessibility tree is insufficient.
4. **Redacted Screenshot** — A visual snapshot with faces blurred and PII masked.
5. **Previous Actions** — A history of actions already taken in this session.

## YOUR RULES
1. **NEVER request actual PII values** — they were redacted for privacy. Use tokens like [NAME_1] if an action needs sensitive data; the client will substitute locally.
2. **Use precise targets** — Always provide a CSS selector, element ID, or the exact visible text of the element. Prefer IDs > CSS selectors > aria-labels > text content > positions.
3. **One action at a time** — Return exactly ONE next action. The client will execute it and come back for the next one.
4. **Be aware of history** — Check PREVIOUS ACTIONS to avoid repeating yourself. If you already clicked something, don't click it again.
5. **Know when to stop** — If the task appears complete (success message visible, form submitted, page navigated), return action type "done".
6. **Handle forms intelligently** — Fill fields in top-to-bottom order. Use tokens for PII fields. Click Submit only after all fields are filled.
7. **Scroll when needed** — If the target element might be below the fold, scroll first.

## RESPONSE FORMAT (strict JSON)
{
  "understanding": "Brief description of the current page state and what you see",
  "action": {
    "type": "click" | "type" | "scroll" | "select" | "navigate" | "open_tab" | "hover" | "focus" | "extract_data" | "download_and_analyze" | "export_csv" | "wait" | "done",
    "target": "CSS selector, ID, or descriptive text of the element",
    "value": "text to type, scroll amount, URL to navigate to, or filename for export",
    "position": {"x": 300, "y": 450},
    "reasoning": "Why this action helps complete the user's task"
  },
  "confidence": 0.85
}

## ACTION TYPES
- **click**: Click an element. Provide target selector and/or position.
- **type**: Type text into an input field. Provide target and value. Use tokens like [NAME_1] for PII.
- **scroll**: Scroll the page. value = pixel amount (positive = down, negative = up). Default: 300.
- **select**: Select an option in a dropdown. target = select element, value = option text or value.
- **navigate**: Go to a URL. value = the URL.
- **open_tab**: Open a new background tab. value = the URL.
- **hover**: Hover over an element to trigger tooltips/menus.
- **focus**: Focus on an element (for keyboard navigation).
- **extract_data**: Extract structured tabular data from tables on the current page.
- **download_and_analyze**: Download and extract text/tables from a linked PDF. target = link selector, value = PDF URL.
- **export_csv**: Export all collected tabular/scraped data into a CSV file download. value = output filename.
- **wait**: Wait before next action. value = milliseconds (default 1000).
- **done**: Task is complete. Include reasoning explaining what was accomplished."""


# ================================================================
#  TASK PLANNING PROMPT
# ================================================================

PLANNING_PROMPT = """You are a task planning agent. Given a user's task and the current page structure, create a step-by-step plan to complete the task.

Analyze the page elements and create a sequential list of actions needed.

## RULES
1. Each step should be ONE atomic action (click, type, scroll, select, open_tab, extract_data, download_and_analyze, export_csv, etc.)
2. For form filling: go top-to-bottom, fill each field, then submit
3. For data collection: use extract_data to extract HTML tables, download_and_analyze for PDF links, and export_csv to save data
4. Use CSS selectors or element IDs when available
5. For PII fields (name, email, phone, Aadhaar, etc.), use tokens: [NAME_1], [EMAIL_1], [PHONE_1], [AADHAAR_1]
6. Include a final verification step or "done" step
7. Estimate complexity: "simple" (1-3 steps), "medium" (4-8 steps), "complex" (9+ steps)

## RESPONSE FORMAT (strict JSON)
{
  "task": "the user's task description",
  "steps": [
    {"step": 1, "action": "extract_data", "target": "table", "value": null, "description": "Extract notifications table on page"},
    {"step": 2, "action": "export_csv", "target": null, "value": "notifications.csv", "description": "Export scraped data to CSV"},
    ...
  ],
  "estimated_actions": 2,
  "complexity": "simple"
}"""


# ================================================================
#  CHAT PROMPT
# ================================================================

CHAT_PROMPT = """You are PrivacyShield AI, a helpful browser assistant. The user is chatting with you about the webpage they're currently viewing.

You can see the page structure and redacted screenshot. Answer questions about the page, explain what you see, suggest actions, or help with tasks.

Be conversational, helpful, and concise. If the user asks about sensitive/redacted data, explain that it was hidden for privacy and you cannot see the actual values.

Always respond in plain text (not JSON). Keep responses under 200 words."""


# ---- Pydantic Models ----
class AnalyzeRequest(BaseModel):
    redacted_screenshot: str = ""  # base64 PNG
    page_structure: dict = {}
    a11y_tree: dict = {}
    redaction_manifest: dict = {}
    redactions: list = []
    url: str = ""
    title: str = ""
    task: str = "Help the user navigate this page"
    metrics: dict = {}


class ActionResponse(BaseModel):
    understanding: str = ""
    action: dict = {}
    confidence: float = 0.0


class TaskPlanRequest(BaseModel):
    task: str
    page_structure: dict = {}
    a11y_tree: dict = {}
    url: str = ""
    title: str = ""


class ChatRequest(BaseModel):
    message: str
    page_structure: dict = {}
    a11y_tree: dict = {}
    redaction_manifest: dict = {}
    url: str = ""
    title: str = ""


class ConfigUpdate(BaseModel):
    provider: str  # "groq" or "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None


class ScrapeTableRequest(BaseModel):
    url: str
    title: str
    tables: list[dict]
    session_id: str = "default"


class ExtractPdfRequest(BaseModel):
    url: str


class ExportCsvRequest(BaseModel):
    filename: str = "scraped_data.csv"
    session_id: str = "default"


# ---- FastAPI App ----
app = FastAPI(
    title="PrivacyShield AI Server",
    description="Intelligent backend server for the PrivacyShield AI browser agent",
    version="2.0.0"
)

# CORS — allow configurable origins with fallback to extension & local origins
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "chrome-extension://*,http://localhost:3000,http://localhost:5173,http://127.0.0.1:8000")
allowed_origins_list = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_list if "*" not in allowed_origins_list else ["*"],
    allow_origin_regex=r"^chrome-extension://[a-z0-9]+$" if "chrome-extension://*" in allowed_origins_list else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---- Active WebSocket connections ----
active_connections: list[WebSocket] = []


# ================================================================
#  SMART PRE-PROCESSOR
# ================================================================

def preprocess_action(request: AnalyzeRequest, memory: list[dict]) -> Optional[dict]:
    """
    Rule-based action pre-processor. Runs BEFORE calling the VLM.
    Returns a suggested action if a simple rule matches, or None to defer to VLM.
    Also performs anti-loop detection.
    """
    task = (request.task or "").lower()
    elements = request.page_structure.get("elements", [])
    interactable = [
        e for e in elements
        if e.get("isInteractable")
        or e.get("role") in ("button", "textbox", "link", "combobox", "checkbox")
        or e.get("tag") in ("button", "input", "a", "select", "textarea")
    ]
    if not interactable:
        interactable = elements

    # --- Anti-loop detection ---
    if len(memory) >= 3:
        last_3 = memory[-3:]
        action_keys = [f"{m.get('type', '')}:{m.get('target', '')}" for m in last_3]
        if len(set(action_keys)) == 1:
            logger.warning(f"Loop detected: '{action_keys[0]}' repeated 3 times")
            return {
                "understanding": "Loop detected — the same action has been repeated 3 times.",
                "action": {
                    "type": "done",
                    "reasoning": "Stopping to prevent infinite loop. The previous action may have already completed the task, or the target element is unresponsive."
                },
                "confidence": 0.9
            }

    # --- Form filling shortcut ---
    if any(keyword in task for keyword in ["fill", "form", "register", "sign up", "apply"]):
        # Find the first empty input field
        empty_inputs = [
            e for e in interactable
            if e.get("type") in ("input", "textarea")
            and not e.get("value")
            and e.get("inputType") not in ("submit", "button", "hidden")
        ]

        # Check if this input was already filled (in memory)
        filled_targets = {m.get("target") for m in memory if m.get("type") == "type"}

        for inp in empty_inputs:
            target = inp.get("originalId") or inp.get("id", "")
            if target and target not in filled_targets:
                # Determine token based on input hints
                name = (inp.get("name") or inp.get("placeholder") or "").lower()
                token = "[PII_1]"
                if any(k in name for k in ["name", "full_name", "fullname"]):
                    token = "[NAME_1]"
                elif any(k in name for k in ["email", "mail"]):
                    token = "[EMAIL_1]"
                elif any(k in name for k in ["phone", "mobile", "tel"]):
                    token = "[PHONE_1]"
                elif any(k in name for k in ["aadhaar", "aadhar", "uid"]):
                    token = "[AADHAAR_1]"
                elif any(k in name for k in ["pan"]):
                    token = "[PAN_1]"
                elif any(k in name for k in ["address", "addr"]):
                    token = "[ADDRESS_1]"
                elif any(k in name for k in ["password", "passwd", "pass"]):
                    token = "[PASSWORD_1]"

                return {
                    "understanding": f"Found empty form field: '{name or target}'",
                    "action": {
                        "type": "type",
                        "target": target,
                        "value": token,
                        "reasoning": f"Filling empty form field '{name or target}' with appropriate data"
                    },
                    "confidence": 0.7
                }

    # --- Submit & Click shortcut ---
    if any(keyword in task for keyword in ["submit", "click", "save", "generate", "otp", "send", "apply"]):
        submit_btns = [
            e for e in interactable
            if (e.get("type") in ("button", "a") or e.get("inputType") in ("submit", "button"))
            and any(k in (e.get("text") or e.get("name") or e.get("id") or "").lower() for k in ["submit", "save", "generate", "otp", "send", "apply", "register", "sign up"])
        ]
        if submit_btns:
            btn = submit_btns[0]
            target_id = btn.get("originalId") or btn.get("id") or btn.get("selector") or ""
            btn_text = btn.get("text") or btn.get("name") or "Button"
            return {
                "understanding": f"Found target button: '{btn_text}'",
                "action": {
                    "type": "click",
                    "action": "click",
                    "target": target_id,
                    "position": btn.get("position"),
                    "reasoning": f"Clicking on '{btn_text}' to complete the requested task"
                },
                "confidence": 0.9
            }

    return None  # Defer to VLM


# ================================================================
#  ROBUST JSON PARSER
# ================================================================

def parse_ai_response(content: str) -> dict:
    """
    Attempts multiple strategies to parse the AI's response into a dict.
    """
    if not content:
        return _default_response("Empty AI response")

    content = content.strip()

    # Strategy 1: Direct JSON parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Extract from markdown code blocks
    code_block_patterns = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
    ]
    for pattern in code_block_patterns:
        match = re.search(pattern, content)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                continue

    # Strategy 3: Find JSON object with "action" key
    json_pattern = r'\{[^{}]*"action"[^{}]*\{[^{}]*\}[^{}]*\}'
    match = re.search(json_pattern, content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # Strategy 4: Find any JSON object
    brace_start = content.find('{')
    if brace_start >= 0:
        depth = 0
        for i in range(brace_start, len(content)):
            if content[i] == '{':
                depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(content[brace_start:i + 1])
                    except json.JSONDecodeError:
                        break

    # Strategy 5: Return the raw text as understanding
    logger.warning(f"All JSON parsing strategies failed. Raw: {content[:200]}")
    return {
        "understanding": content[:300],
        "action": {"type": "wait", "action": "wait", "reasoning": "Could not parse AI response into a structured action", "value": "1000"},
        "confidence": 0.2
    }


def _default_response(reason: str) -> dict:
    return {
        "understanding": reason,
        "action": {"type": "wait", "action": "wait", "reasoning": reason, "value": "1000"},
        "confidence": 0.0
    }


# ================================================================
#  PROMPT BUILDER
# ================================================================

def build_user_prompt(request: AnalyzeRequest, memory: list[dict]) -> str:
    """Build the structured user prompt for the VLM."""

    # Format memory
    memory_text = "None yet."
    if memory:
        memory_lines = []
        for i, m in enumerate(memory[-MEMORY_LIMIT:], 1):
            action_type = m.get("type", "?")
            target = m.get("target", "")
            result = "success" if m.get("success", True) else "failed"
            memory_lines.append(f"  {i}. [{action_type} → '{target}'] — {result}")
        memory_text = "\n".join(memory_lines)

    # Format a11y tree (truncated)
    a11y_text = json.dumps(request.a11y_tree, indent=1)[:4000] if request.a11y_tree else "Not available"

    # Format manifest
    manifest_text = json.dumps(request.redaction_manifest, indent=1)[:1500] if request.redaction_manifest else "No redactions"

    # Format DOM elements (top 50)
    elements = request.page_structure.get("elements", [])[:50]
    dom_lines = []
    for el in elements:
        el_id = el.get("originalId") or el.get("id", "?")
        el_type = el.get("type", "?")
        el_text = (el.get("text") or "")[:60]
        el_interact = "✓" if el.get("isInteractable") else "·"
        dom_lines.append(f"  [{el_interact}] {el_type}#{el_id}: \"{el_text}\"")
    dom_text = "\n".join(dom_lines[:50]) if dom_lines else "No elements found"

    page_summary = request.page_structure.get("summary", "")

    return f"""TASK: {request.task}
CURRENT URL: {request.url}
PAGE TITLE: {request.title}

ACCESSIBILITY TREE (Primary — use this for element targeting):
{a11y_text}

REDACTION MANIFEST (Tokens replacing sensitive data):
{manifest_text}

PREVIOUS ACTIONS TAKEN:
{memory_text}

PAGE SUMMARY: {page_summary}

DOM ELEMENTS (Fallback — use if a11y tree is insufficient):
{dom_text}

What is the NEXT single action to take? Respond in the JSON format specified in your instructions."""


# ================================================================
#  API ENDPOINTS
# ================================================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model": AI_MODEL,
        "provider": AI_PROVIDER,
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "api_key_set": bool(AI_API_KEY),
        "active_connections": len(active_connections)
    }


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    """
    Analyze a redacted screenshot and page structure.
    Returns an action command for the browser agent.
    """
    global LAST_REQUEST_TIME

    # Rate limiting
    now = time.time()
    if now - LAST_REQUEST_TIME < MIN_REQUEST_INTERVAL:
        wait_time = MIN_REQUEST_INTERVAL - (now - LAST_REQUEST_TIME)
        logger.info(f"Rate limited — waiting {wait_time:.1f}s")
        import asyncio
        await asyncio.sleep(wait_time)
    LAST_REQUEST_TIME = time.time()

    # Populate url and title from page_structure if top-level is empty
    if not request.url and isinstance(request.page_structure, dict):
        request.url = request.page_structure.get("url", "")
    if not request.title and isinstance(request.page_structure, dict):
        request.title = request.page_structure.get("title", "")

    logger.info(f"Analyze: url={request.url}, task={request.task}, elements={len(request.page_structure.get('elements', [])) if isinstance(request.page_structure, dict) else 0}")

    # Use empty memory for REST requests (no persistent connection)
    memory = []

    try:
        # Try pre-processor first
        pre_result = preprocess_action(request, memory)
        if pre_result:
            logger.info(f"  Pre-processor: {pre_result['action'].get('type')}")
            return pre_result

        # Call AI
        has_real_key = bool(AI_API_KEY and not AI_API_KEY.startswith("your_"))
        if AI_PROVIDER == "groq" and has_real_key:
            result = await call_groq(request, memory)
        elif AI_PROVIDER == "ollama":
            result = await call_ollama(request, memory)
        else:
            result = generate_smart_mock(request, memory)

        logger.info(f"  AI Response: {result.get('action', {}).get('type', 'unknown')}")
        return result

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return _default_response(f"Analysis error: {str(e)}")


@app.post("/api/task-plan")
async def create_task_plan(request: TaskPlanRequest):
    """
    Generate a multi-step plan for completing a task on the current page.
    Returns a structured list of steps for the client-side AgentController.
    """
    logger.info(f"Task plan: task='{request.task}', url={request.url}")

    elements = request.page_structure.get("elements", [])
    interactable = [e for e in elements if e.get("isInteractable")]

    # --- Smart local planner (no AI needed for common patterns) ---
    task_lower = request.task.lower()
    steps = []

    # Pattern: Form filling
    if any(k in task_lower for k in ["fill", "form", "register", "sign up", "apply", "complete"]):
        # Find all input fields
        inputs = [
            e for e in interactable
            if e.get("type") in ("input", "textarea", "select")
            and e.get("inputType") not in ("submit", "button", "hidden", "checkbox", "radio")
        ]

        for i, inp in enumerate(inputs):
            target = inp.get("originalId") or inp.get("id", "")
            name = (inp.get("name") or inp.get("placeholder") or inp.get("text") or f"field {i + 1}").strip()

            # Determine appropriate token
            name_lower = name.lower()
            token = "Sample text"
            if any(k in name_lower for k in ["name", "full_name", "fullname", "first", "last"]):
                token = "[NAME_1]"
            elif any(k in name_lower for k in ["email", "mail"]):
                token = "[EMAIL_1]"
            elif any(k in name_lower for k in ["phone", "mobile", "tel", "contact"]):
                token = "[PHONE_1]"
            elif any(k in name_lower for k in ["aadhaar", "aadhar", "uid"]):
                token = "[AADHAAR_1]"
            elif any(k in name_lower for k in ["pan"]):
                token = "[PAN_1]"
            elif any(k in name_lower for k in ["password", "passwd"]):
                token = "[PASSWORD_1]"
            elif any(k in name_lower for k in ["address", "addr", "street"]):
                token = "[ADDRESS_1]"
            elif any(k in name_lower for k in ["city"]):
                token = "Mumbai"
            elif any(k in name_lower for k in ["state", "province"]):
                token = "Maharashtra"
            elif any(k in name_lower for k in ["pin", "zip", "postal"]):
                token = "400001"
            elif any(k in name_lower for k in ["dob", "birth", "date"]):
                token = "01/01/2000"

            if inp.get("type") == "select":
                steps.append({
                    "step": len(steps) + 1,
                    "action": "select",
                    "target": target,
                    "value": "0",
                    "description": f"Select an option for '{name}'"
                })
            else:
                steps.append({
                    "step": len(steps) + 1,
                    "action": "type",
                    "target": target,
                    "value": token,
                    "description": f"Fill in '{name}'"
                })

        # Find checkboxes and check them
        checkboxes = [
            e for e in interactable
            if e.get("inputType") in ("checkbox",)
        ]
        for cb in checkboxes:
            target = cb.get("originalId") or cb.get("id", "")
            label = (cb.get("text") or cb.get("name") or "checkbox").strip()[:50]
            steps.append({
                "step": len(steps) + 1,
                "action": "click",
                "target": target,
                "description": f"Check '{label}'"
            })

        # Find submit button
        submit_btns = [
            e for e in interactable
            if (e.get("type") == "button" or e.get("inputType") == "submit")
            and any(k in (e.get("text") or "").lower() for k in ["submit", "send", "register", "sign up", "apply", "continue", "next"])
        ]
        if submit_btns:
            btn = submit_btns[0]
            steps.append({
                "step": len(steps) + 1,
                "action": "click",
                "target": btn.get("originalId") or btn.get("id", ""),
                "description": f"Click '{(btn.get('text') or 'Submit').strip()[:30]}' to submit the form"
            })

        # Final done step
        steps.append({
            "step": len(steps) + 1,
            "action": "done",
            "description": "Form submission complete"
        })

    # Pattern: Click / Navigate
    elif any(k in task_lower for k in ["click", "press", "tap", "open"]):
        # Find the target element by searching task text
        for el in interactable:
            el_text = (el.get("text") or "").lower().strip()
            if el_text and el_text in task_lower:
                steps.append({
                    "step": 1,
                    "action": "click",
                    "target": el.get("originalId") or el.get("id", ""),
                    "description": f"Click on '{el.get('text', '').strip()[:40]}'"
                })
                steps.append({"step": 2, "action": "done", "description": "Action complete"})
                break

    # Pattern: Scroll
    elif any(k in task_lower for k in ["scroll", "go down", "go up"]):
        direction = -500 if any(k in task_lower for k in ["up", "top"]) else 500
        steps.append({
            "step": 1,
            "action": "scroll",
            "value": str(direction),
            "description": f"Scroll {'up' if direction < 0 else 'down'}"
        })
        steps.append({"step": 2, "action": "done", "description": "Scrolling complete"})

    # Fallback: If no pattern matches, create a generic plan
    if not steps:
        # Try calling AI for the plan if available
        try:
            ai_plan = await _get_ai_plan(request)
            if ai_plan and ai_plan.get("steps"):
                return ai_plan
        except Exception as e:
            logger.warning(f"AI planning failed: {e}")

        steps = [
            {"step": 1, "action": "wait", "value": "1000", "description": "Analyzing the page..."},
            {"step": 2, "action": "done", "description": "Ready for specific instructions"}
        ]

    complexity = "simple" if len(steps) <= 3 else "medium" if len(steps) <= 8 else "complex"

    plan = {
        "task": request.task,
        "steps": steps,
        "estimated_actions": len(steps),
        "complexity": complexity
    }

    logger.info(f"  Plan: {len(steps)} steps, complexity={complexity}")
    return plan


async def _get_ai_plan(request: TaskPlanRequest) -> Optional[dict]:
    """Try to get an AI-generated plan for complex tasks."""
    if AI_PROVIDER == "groq" and AI_API_KEY:
        prompt = f"""Task: {request.task}
Page URL: {request.url}
Page Title: {request.title}

Page Elements:
{json.dumps(request.page_structure.get('elements', [])[:30], indent=1)[:3000]}

Create a step-by-step plan to complete this task."""

        headers = {
            "Authorization": f"Bearer {AI_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": AI_MODEL or "openai/gpt-oss-20b",
            "messages": [
                {"role": "system", "content": PLANNING_PROMPT},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 1024
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                return parse_ai_response(content)

    return None


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Conversational chat with the agent about the current page.
    NOT for automation — for answering questions and discussion.
    """
    logger.info(f"Chat: '{request.message[:60]}...' on {request.url}")

    context = f"""The user is viewing: {request.url}
Page title: {request.title}

Page structure summary:
{json.dumps(request.page_structure, indent=1)[:2000]}

Redaction manifest (what was hidden):
{json.dumps(request.redaction_manifest, indent=1)[:500]}

User's message: {request.message}"""

    try:
        if AI_PROVIDER == "groq" and AI_API_KEY:
            headers = {
                "Authorization": f"Bearer {AI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": AI_MODEL or "openai/gpt-oss-20b",  # Fast model for chat
                "messages": [
                    {"role": "system", "content": CHAT_PROMPT},
                    {"role": "user", "content": context}
                ],
                "temperature": 0.7,
                "max_tokens": 512
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(GROQ_API_URL, headers=headers, json=payload)
                if response.status_code == 200:
                    result = response.json()
                    reply = result["choices"][0]["message"]["content"]
                    return {"reply": reply, "status": "ok"}
                else:
                    return {"reply": "I'm having trouble connecting to the AI service. Try again in a moment.", "status": "error"}

        elif AI_PROVIDER == "ollama":
            payload = {
                "model": AI_MODEL or "llava",
                "system": CHAT_PROMPT,
                "prompt": context,
                "stream": False
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
                if response.status_code == 200:
                    reply = response.json().get("response", "")
                    return {"reply": reply, "status": "ok"}

        return {"reply": f"I can see you're on '{request.title}'. I can help you navigate this page. What would you like to do?", "status": "mock"}

    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {"reply": "Sorry, I encountered an error. Please try again.", "status": "error"}


@app.get("/api/config")
async def get_config():
    """Get current server configuration."""
    return {
        "provider": AI_PROVIDER,
        "model": AI_MODEL,
        "api_key_set": bool(AI_API_KEY),
        "ollama_url": OLLAMA_URL
    }


@app.post("/api/config")
async def update_config(config: ConfigUpdate):
    """Update server configuration at runtime."""
    global AI_PROVIDER, AI_MODEL, AI_API_KEY

    if config.provider in ("groq", "ollama"):
        AI_PROVIDER = config.provider
    if config.model:
        AI_MODEL = config.model
    if config.api_key:
        AI_API_KEY = config.api_key

    logger.info(f"Config updated: provider={AI_PROVIDER}, model={AI_MODEL}")
    return {"status": "updated", "provider": AI_PROVIDER, "model": AI_MODEL}


@app.post("/api/data/scrape-table")
async def scrape_table(request: ScrapeTableRequest):
    """Store scraped table data in session memory."""
    logger.info(f"Received {len(request.tables)} tables from {request.url}")
    session_data = scraped_data_store[request.session_id]
    
    total_rows = 0
    for table in request.tables:
        session_data.extend(table.get("data", []))
        total_rows += len(table.get("data", []))
        
    return {
        "status": "success",
        "message": f"Stored {total_rows} rows from {len(request.tables)} tables",
        "summary": f"Data saved. Total rows in session: {len(session_data)}"
    }


@app.post("/api/data/extract-pdf")
async def extract_pdf(request: ExtractPdfRequest):
    """Extract text and metadata from a PDF URL."""
    logger.info(f"Extracting PDF from {request.url}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.url)
            response.raise_for_status()
            
            pdf_file = io.BytesIO(response.content)
            reader = pypdf.PdfReader(pdf_file)
            
            text = ""
            for i, page in enumerate(reader.pages):
                if i > 10:  # limit to first 10 pages for speed
                    break
                text += page.extract_text() + "\\n"
                
            return {
                "status": "success",
                "pages_count": len(reader.pages),
                "summary": text[:500] + "..." if len(text) > 500 else text,
                "text": text
            }
    except Exception as e:
        logger.error(f"PDF extraction failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/data/export-csv")
async def export_csv(request: ExportCsvRequest):
    """Export collected tabular data into downloadable CSV format."""
    logger.info(f"Exporting CSV for session {request.session_id}")
    session_data = scraped_data_store.get(request.session_id, [])
    
    if not session_data:
        raise HTTPException(status_code=404, detail="No data available to export")
        
    output = io.StringIO()
    # Get all possible headers
    headers = set()
    for row in session_data:
        headers.update(row.keys())
        
    writer = csv.DictWriter(output, fieldnames=list(headers))
    writer.writeheader()
    writer.writerows(session_data)
    
    csv_content = output.getvalue()
    
    # Clear data after export
    scraped_data_store[request.session_id] = []
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={request.filename}"}
    )


# ================================================================
#  WEBSOCKET
# ================================================================

@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time bidirectional communication with the Chrome extension.
    Now powered by LangGraph AI Digital Worker architecture.
    """
    await websocket.accept()
    active_connections.append(websocket)
    conn_id = id(websocket)
    connection_memory[conn_id] = []
    
    last_vlm_request_time = 0.0
    
    # State tracking per connection
    if not hasattr(app.state, "connection_plans"):
        app.state.connection_plans = {}
    if not hasattr(app.state, "connection_steps"):
        app.state.connection_steps = {}
        
    app.state.connection_plans[conn_id] = []
    app.state.connection_steps[conn_id] = 0
    
    logger.info(f"WebSocket connected (id={conn_id}). Active: {len(active_connections)}")

    try:
        while True:
            data = await websocket.receive_text()
            request_data = json.loads(data)

            logger.info(f"WS [{conn_id}]: url={request_data.get('url', '?')}")

            # Check for client-reported action results
            memory = connection_memory[conn_id]
            if "action_result" in request_data:
                ar = request_data["action_result"]
                memory.append({
                    "type": ar.get("type", "unknown"),
                    "target": ar.get("target", ""),
                    "success": ar.get("success", True),
                    "timestamp": time.time()
                })
                if len(memory) > MEMORY_LIMIT:
                    memory.pop(0)
                
                # If this payload is ONLY an action_result update, do not run the LLM again yet.
                # Wait for the next full screenshot/DOM update from the client.
                if "page_structure" not in request_data:
                    continue

            # Rate limiting for VLM calls
            current_time = time.time()
            if current_time - last_vlm_request_time < MIN_REQUEST_INTERVAL:
                logger.info(f"WS [{conn_id}]: Debouncing request (too frequent)")
                continue
            last_vlm_request_time = current_time

            # Build Agent State
            state_input = {
                "task": request_data.get("task", "Help the user navigate this page"),
                "url": request_data.get("url", ""),
                "title": request_data.get("title", ""),
                "page_structure": request_data.get("page_structure", {}),
                "a11y_tree": request_data.get("a11y_tree", {}),
                "redaction_manifest": request_data.get("redaction_manifest", {}),
                "session_memory": memory,
                "plan": app.state.connection_plans[conn_id],
                "current_step_index": app.state.connection_steps[conn_id],
                "loop_detected": False,
                "selected_skill": None,
                "is_done": False
            }

            try:
                # Invoke LangGraph
                logger.info("[LangGraph] Invoking state machine...")
                final_state = agent_graph.invoke(state_input)
                
                # Update persistent connection state
                app.state.connection_plans[conn_id] = final_state.get("plan", [])
                
                # Format output for the extension (AgentController)
                # Our new LangGraph outputs a `selected_skill` dict which has `browser_action`
                skill = final_state.get("selected_skill", {})
                
                if "selected_skill" in skill and skill["selected_skill"] == "browser_action":
                    action_details = skill.get("browser_action", {})
                    response = {
                        "understanding": "Following LangGraph Plan",
                        "action": {
                            "type": action_details.get("action_type", "wait"),
                            "target": action_details.get("target_element", ""),
                            "value": action_details.get("value", ""),
                            "reasoning": action_details.get("reasoning", "")
                        },
                        "confidence": 1.0,
                        "plan": final_state.get("plan", [])
                    }
                elif "selected_skill" in skill and skill["selected_skill"] == "data_extraction":
                    data_details = skill.get("data_extraction", {})
                    response = {
                        "understanding": "Extracting structured data from page",
                        "action": {
                            "type": "extract_data",
                            "target": data_details.get("target_element", "table"),
                            "reasoning": data_details.get("reasoning", "Extracting table data")
                        },
                        "confidence": 1.0,
                        "plan": final_state.get("plan", [])
                    }
                elif "selected_skill" in skill and skill["selected_skill"] == "file_processing":
                    file_details = skill.get("file_processing", {})
                    response = {
                        "understanding": "Processing downloadable file",
                        "action": {
                            "type": "download_and_analyze",
                            "value": file_details.get("url", ""),
                            "reasoning": file_details.get("reasoning", "Analyzing PDF document")
                        },
                        "confidence": 1.0,
                        "plan": final_state.get("plan", [])
                    }
                elif "selected_skill" in skill and skill["selected_skill"] == "final_answer":
                    reasoning_text = skill.get("final_answer") or "Task completed successfully"
                    response = {
                        "understanding": reasoning_text,
                        "action": {
                            "type": "done",
                            "target": "",
                            "reasoning": reasoning_text
                        },
                        "confidence": 1.0,
                        "plan": final_state.get("plan", [])
                    }
                else:
                    # Fallback / Task Done
                    response = {
                        "understanding": "Task complete",
                        "action": {"type": "done", "target": "", "reasoning": "Finished via LangGraph"},
                        "confidence": 1.0,
                        "plan": final_state.get("plan", [])
                    }
                
                # Record to memory
                memory.append({
                    "type": response["action"].get("type", "unknown"),
                    "target": response["action"].get("target", ""),
                    "success": True,
                    "timestamp": time.time()
                })
                
                await websocket.send_text(json.dumps(response))

            except Exception as e:
                logger.error(f"LangGraph Error: {e}")
                error_response = {"action": {"type": "wait", "reasoning": "Error in AI Agent"}, "confidence": 0}
                await websocket.send_text(json.dumps(error_response))

    except WebSocketDisconnect:
        active_connections.remove(websocket)
        if conn_id in connection_memory:
            del connection_memory[conn_id]
        logger.info(f"WebSocket disconnected (id={conn_id}). Active: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)
        if conn_id in connection_memory:
            del connection_memory[conn_id]


# ================================================================
#  AI PROVIDERS
# ================================================================

async def call_groq(request: AnalyzeRequest, memory: list[dict]) -> dict:
    """Call Groq API with the redacted screenshot and structured page context."""

    user_prompt = build_user_prompt(request, memory)
    screenshot = request.redacted_screenshot
    is_vision_model = any(k in (AI_MODEL or "").lower() for k in ["vision", "llava"])

    if is_vision_model and screenshot and screenshot.startswith("data:image"):
        base64_data = screenshot.split(",", 1)[1] if "," in screenshot else screenshot
        user_content = [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_data}"
                }
            },
            {
                "type": "text",
                "text": user_prompt
            }
        ]
    else:
        user_content = user_prompt

    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": AI_MODEL or "openai/gpt-oss-20b",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.3,
        "max_tokens": 1024
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(GROQ_API_URL, headers=headers, json=payload)
            response.raise_for_status()
        except Exception as e:
            logger.warning(f"Groq primary call failed ({e}). Retrying with plain text and robust fallback model...")
            payload["messages"][1]["content"] = user_prompt
            payload["model"] = "openai/gpt-oss-20b"

            try:
                response = await client.post(GROQ_API_URL, headers=headers, json=payload)
                response.raise_for_status()
            except Exception as fallback_e:
                logger.warning(f"Groq API call failed ({fallback_e}). Falling back to smart on-device planner.")
                pre = preprocess_action(request, memory)
                return pre if pre else generate_smart_mock(request, memory)

        result = response.json()
        content = result["choices"][0]["message"]["content"]
        return parse_ai_response(content)


async def call_ollama(request: AnalyzeRequest, memory: list[dict]) -> dict:
    """Call Ollama (local) API with the redacted screenshot and structured context."""

    user_prompt = build_user_prompt(request, memory)

    payload = {
        "model": AI_MODEL if AI_MODEL else "llava",
        "system": SYSTEM_PROMPT,
        "prompt": user_prompt,
        "stream": False,
        "format": "json"
    }

    # Add image if available
    screenshot = request.redacted_screenshot
    if screenshot and screenshot.startswith("data:image"):
        base64_data = screenshot.split(",", 1)[1] if "," in screenshot else screenshot
        payload["images"] = [base64_data]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)

            if response.status_code != 200:
                logger.error(f"Ollama error {response.status_code}: {response.text}")
                pre = preprocess_action(request, memory)
                return pre if pre else generate_smart_mock(request, memory)

            result = response.json()
            content = result.get("response", "")
            return parse_ai_response(content)
    except Exception as e:
        logger.warning(f"Ollama connection failed ({e}). Falling back to smart rule-based engine.")
        pre = preprocess_action(request, memory)
        return pre if pre else generate_smart_mock(request, memory)


def generate_smart_mock(request: AnalyzeRequest, memory: list[dict]) -> dict:
    """
    Generate an intelligent mock response when no AI provider is available.
    Uses rule-based analysis of the page structure.
    """
    elements = request.page_structure.get("elements", [])
    interactable = [
        e for e in elements
        if e.get("isInteractable")
        or e.get("role") in ("button", "textbox", "link", "combobox", "checkbox")
        or e.get("tag") in ("button", "input", "a", "select", "textarea")
    ]
    if not interactable:
        interactable = elements
    task = request.task or ""

    # Try the pre-processor first
    pre = preprocess_action(request, memory)
    if pre:
        pre["confidence"] = max(0.3, pre.get("confidence", 0.3))
        return pre

    if not interactable:
        return {
            "understanding": f"Viewing '{request.title or request.url}'. No interactive elements found in viewport.",
            "action": {
                "type": "scroll",
                "value": "300",
                "reasoning": "No interactive elements visible — scrolling to reveal more content"
            },
            "confidence": 0.4
        }

    # Find the most relevant interactable element based on the task
    task_lower = task.lower()
    task_words = [w for w in re.findall(r'\w+', task_lower) if w not in ("the", "a", "an", "on", "in", "to", "and", "please")]
    best_el = None

    # Pass 1: exact substring match
    for el in interactable:
        el_text = (el.get("text") or el.get("name") or el.get("placeholder") or el.get("id") or "").lower()
        if el_text and (el_text in task_lower or any(w in el_text for w in task_words)):
            best_el = el
            break

    # Pass 2: button or submit element fallback if task contains click/save/submit
    if not best_el and any(k in task_lower for k in ["click", "save", "submit", "generate", "press"]):
        for el in interactable:
            if el.get("type") in ("button", "a") or el.get("inputType") in ("submit", "button"):
                best_el = el
                break

    if not best_el:
        best_el = interactable[0]

    # Determine action based on element type or task intent
    el_type = best_el.get("type", "")
    target_id = best_el.get("originalId") or best_el.get("id") or best_el.get("selector") or ""
    el_label = best_el.get("text") or best_el.get("name") or best_el.get("placeholder") or "element"

    if any(k in task_lower for k in ["click", "press", "tap", "save", "generate", "submit"]):
        return {
            "understanding": f"Page '{request.title}'. Clicking on matching element '{el_label}'.",
            "action": {
                "type": "click",
                "action": "click",
                "target": target_id,
                "position": best_el.get("position"),
                "reasoning": f"Clicking on '{el_label}' to satisfy task '{task}'"
            },
            "confidence": 0.85
        }

    if el_type in ("input", "textarea"):
        return {
            "understanding": f"Page '{request.title}' with {len(interactable)} interactive elements. Found input field.",
            "action": {
                "type": "click",
                "action": "click",
                "target": target_id,
                "reasoning": f"Focusing on input field '{el_label}'"
            },
            "confidence": 0.6
        }
    else:
        return {
            "understanding": f"Page '{request.title}' with {len(interactable)} interactive elements.",
            "action": {
                "type": "click" if el_type == "button" else "wait",
                "action": "click" if el_type == "button" else "wait",
                "target": target_id,
                "value": "1000",
                "reasoning": f"Interacting with '{el_label}' on page"
            },
            "confidence": 0.5
        }


# ================================================================
#  STARTUP
# ================================================================

@app.on_event("startup")
async def startup():
    logger.info("=" * 60)
    logger.info("  PrivacyShield AI Server v2.0 — Intelligent Agent Brain")
    logger.info(f"  Provider: {AI_PROVIDER}")
    logger.info(f"  Model: {AI_MODEL}")
    logger.info(f"  API Key: {'SET' if AI_API_KEY else 'NOT SET (using mock mode)'}")
    logger.info(f"  Port: {PORT}")
    logger.info(f"  Endpoints: /api/health, /api/analyze, /api/task-plan, /api/chat, /ws/agent")
    logger.info("=" * 60)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
