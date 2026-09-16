import json
import logging
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage
import os
from dotenv import load_dotenv

# We will import the schemas from skills.py once it's created
try:
    from .skills import SkillSelection
except ImportError:
    # Fallback if subagent hasn't finished yet
    from pydantic import BaseModel
    class SkillSelection(BaseModel):
        pass

load_dotenv()
logger = logging.getLogger("agent.graph")

# ================================================================
#  STATE DEFINITION
# ================================================================

class AgentState(TypedDict):
    task: str
    url: str
    title: str
    page_structure: Dict[str, Any]
    a11y_tree: Dict[str, Any]
    redaction_manifest: Dict[str, Any]
    session_memory: List[Dict[str, Any]]
    
    # Internal Reasoning State
    plan: List[str]
    current_step_index: int
    loop_detected: bool
    
    # Output State
    selected_skill: Optional[Any] # Will be SkillSelection
    is_done: bool


# ================================================================
#  NODES
# ================================================================

def planner_node(state: AgentState) -> Dict[str, Any]:
    """Generates a high-level plan if one doesn't exist."""
    if state.get("plan") and len(state["plan"]) > 0:
        return {} # Keep existing plan
        
    logger.info("[Planner] Generating task plan...")
    
    # Simple rule-based planning for now, can be upgraded to LLM
    task = state.get("task", "").lower()
    plan = []
    
    if "fill" in task or "form" in task:
        plan = ["Identify input fields", "Fill out forms using tokens", "Click submit"]
    elif "download" in task or "pdf" in task:
        plan = ["Locate PDF link", "Click link or download_and_read_pdf", "Summarize results"]
    else:
        plan = ["Analyze page", "Execute next logical step", "Verify completion"]
        
    return {"plan": plan, "current_step_index": 0}


def memory_check_node(state: AgentState) -> Dict[str, Any]:
    """Checks for loops or repeated failures in session memory."""
    memory = state.get("session_memory", [])
    if len(memory) >= 3:
        # Check if the last 3 actions were exactly the same
        last_3 = memory[-3:]
        targets = [m.get("target") for m in last_3]
        types = [m.get("type") for m in last_3]
        
        if len(set(targets)) == 1 and len(set(types)) == 1:
            logger.warning("[Memory] Loop detected!")
            return {"loop_detected": True}
            
    return {"loop_detected": False}


def skill_selector_node(state: AgentState) -> Dict[str, Any]:
    """Uses LLM to select the next structured action based on state."""
    logger.info("[SkillSelector] Selecting next action...")
    
    # In case of a loop, force a done action or alternative
    if state.get("loop_detected"):
        logger.info("[SkillSelector] Forcing STOP due to loop.")
        # We simulate a SkillSelection object
        return {
            "selected_skill": {
                "selected_skill": "browser_action",
                "browser_action": {
                    "action_type": "done",
                    "reasoning": "Stopping to prevent infinite loop. The previous actions were stuck."
                }
            },
            "is_done": True
        }
        
    # Standard LLM selection
    provider = os.getenv("AI_PROVIDER", "groq").lower()
    model_name = os.getenv("AI_MODEL", "openai/gpt-oss-20b")
        
    try:
        # We need to import the actual schema to bind it
        from .skills import SkillSelection as ActualSkillSelection
        
        if provider == "ollama":
            try:
                from langchain_ollama import ChatOllama
            except ImportError:
                from langchain_community.chat_models.ollama import ChatOllama
            ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
            llm = ChatOllama(
                base_url=ollama_url,
                model=model_name if ":" in model_name or model_name in ("llava", "llama3.2-vision") else "llava",
                temperature=0.1,
            )
            # Ollama requires format="json" for structured output in some versions
            structured_llm = llm.with_structured_output(ActualSkillSelection)
        else:
            api_key = os.getenv("AI_API_KEY")
            if not api_key:
                return _fallback_mock_selection(state)
                
            # Initialize Groq with structured output
            llm = ChatGroq(
                api_key=api_key,
                model=model_name,
                temperature=0.1
            )
            structured_llm = llm.with_structured_output(ActualSkillSelection)
        
        # Build prompt
        system_prompt = """You are an AI Digital Worker. Your job is to execute a task by choosing the next best skill.
        
You have access to:
1. Browser Skills: click, type, scroll, select, hover, navigate, done
2. Data Skills: extract_table, scrape_text
3. File Skills: download_and_read_pdf

CRITICAL PRIVACY RULES:
- If typing sensitive info (name, email, phone, aadhaar), YOU MUST use tokens like [NAME_1], [EMAIL_1]. The local client will substitute them. Never guess real PII.

Look at the Accessibility Tree and DOM structure to find target elements. Use exact CSS selectors or element IDs."""

        memory_str = json.dumps(state.get("session_memory", [])[-5:], indent=2)
        page_str = json.dumps(state.get("page_structure", {}), indent=2)[:4000]
        
        user_prompt = f"""Task: {state['task']}
Plan: {state.get('plan', [])}
Current Step: {state.get('current_step_index', 0)}
Recent Actions: {memory_str}
 
Page Structure (Enriched DOM):
{page_str}

What is your next action?"""

        response = structured_llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ])
        
        # Check if done
        is_done = False
        if response.selected_skill == "browser_action" and response.browser_action and response.browser_action.action_type == "done":
            is_done = True
        elif response.selected_skill == "final_answer":
            is_done = True
            
        # Convert pydantic to dict for state
        return {
            "selected_skill": response.dict(),
            "is_done": is_done
        }
        
    except Exception as e:
        logger.error(f"[SkillSelector] LLM Error: {e}")
        return _fallback_mock_selection(state)


def _fallback_mock_selection(state: AgentState):
    """Smart rule-based fallback logic if LLM fails or is in offline mode."""
    elements = state.get("page_structure", {}).get("elements", [])
    interactable = [e for e in elements if e.get("isInteractable")]
    memory = state.get("session_memory", [])
    filled_targets = {m.get("target") for m in memory if m.get("type") in ("type", "click")}

    # 1. Look for empty input fields to fill
    empty_inputs = [
        e for e in interactable
        if e.get("type") in ("input", "textarea")
        and not e.get("value")
        and e.get("inputType") not in ("submit", "button", "hidden")
    ]
    for inp in empty_inputs:
        target = inp.get("originalId") or inp.get("id", "")
        selector = f"#{target}" if target and not target.startswith(("#", ".")) else target
        if selector and selector not in filled_targets:
            name = (inp.get("name") or inp.get("placeholder") or "").lower()
            token = "[NAME_1]" if "name" in name else "[EMAIL_1]" if "mail" in name else "[PHONE_1]" if "phone" in name else "[PII_1]"
            return {
                "selected_skill": {
                    "selected_skill": "browser_action",
                    "browser_action": {
                        "action_type": "type",
                        "target_element": selector,
                        "value": token,
                        "reasoning": f"Smart fallback: filling '{name or target}' with privacy token"
                    }
                },
                "is_done": False
            }

    # 2. Look for submit button
    submit_btns = [
        e for e in interactable
        if (e.get("type") == "button" or e.get("inputType") == "submit")
        and any(k in (e.get("text") or "").lower() for k in ["submit", "send", "save", "apply"])
    ]
    for btn in submit_btns:
        target = btn.get("originalId") or btn.get("id", "")
        selector = f"#{target}" if target and not target.startswith(("#", ".")) else target
        if selector and selector not in filled_targets:
            return {
                "selected_skill": {
                    "selected_skill": "browser_action",
                    "browser_action": {
                        "action_type": "click",
                        "target_element": selector,
                        "value": None,
                        "reasoning": "Smart fallback: clicking submit button to complete task"
                    }
                },
                "is_done": False
            }

    return {
        "selected_skill": {
            "selected_skill": "browser_action",
            "browser_action": {
                "action_type": "done",
                "target_element": "",
                "value": None,
                "reasoning": "Task completed via fallback agent."
            }
        },
        "is_done": True
    }


# ================================================================
#  GRAPH CONSTRUCTION
# ================================================================

def build_graph():
    """Builds and compiles the LangGraph state machine."""
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("planner", planner_node)
    workflow.add_node("memory_check", memory_check_node)
    workflow.add_node("skill_selector", skill_selector_node)
    
    # Add edges
    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "memory_check")
    workflow.add_edge("memory_check", "skill_selector")
    workflow.add_edge("skill_selector", END)
    
    # Compile
    return workflow.compile()

# Global compiled graph instance
agent_graph = build_graph()
