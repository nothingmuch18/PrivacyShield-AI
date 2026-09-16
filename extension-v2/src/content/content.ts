/**
 * VisionLite AI v2 — Content Script
 *
 * Runs on every webpage when the extension is enabled.
 * Responsibilities:
 *  1. Extract DOM layout — find interactive elements, their roles, positions, and text
 *  2. Detect PII in DOM — scan for sensitive field types and regex-match visible text
 *  3. Execute actions — receive action commands from the AI and perform clicks, typing, etc.
 *
 * This script does NOT do ML inference (that's the offscreen document's job).
 * It focuses on DOM understanding and action execution.
 */

import type {
  DOMElement,
  DOMSnapshot,
  DOMSnapshotMsg,
  ActionCommand,
  ActionResultMsg,
} from '../types/messages';
import { DOMSanitizer } from '../core/dom-sanitizer';

const domSanitizer = new DOMSanitizer();

// Prevent double-injection
if (!(window as any).__VisionLiteV2) {
  (window as any).__VisionLiteV2 = true;

  console.log('[VisionLite] Content script injected (v2)');

  // ══════════════════════════════════════════════════════════════
  //  DOM ELEMENT EXTRACTION
  // ══════════════════════════════════════════════════════════════

  /**
   * Determine the semantic role of a DOM element.
   */
  function getElementRole(el: HTMLElement): string {
    const roleAttr = el.getAttribute('role');
    if (roleAttr) return roleAttr;

    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a': return (el as HTMLAnchorElement).href ? 'link' : 'generic';
      case 'button': return 'button';
      case 'input': {
        const type = (el as HTMLInputElement).type || 'text';
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'password') return 'password';
        return 'textbox';
      }
      case 'textarea': return 'textbox';
      case 'select': return 'combobox';
      case 'img': return 'image';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return 'heading';
      case 'p': return 'paragraph';
      case 'ul': case 'ol': return 'list';
      case 'li': return 'listitem';
      case 'table': return 'table';
      case 'tr': return 'row';
      case 'td': case 'th': return 'cell';
      default: return 'generic';
    }
  }

  /**
   * Get the accessible name of an element (aria-label, text, placeholder, etc.)
   */
  function getAccessibleName(el: HTMLElement): string {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl) return labelEl.innerText?.trim() || '';
    }

    if (el.tagName.toLowerCase() === 'img') {
      return (el as HTMLImageElement).alt || '';
    }

    if (['input', 'textarea'].includes(el.tagName.toLowerCase())) {
      const input = el as HTMLInputElement;
      // Check for associated label
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return (label as HTMLElement).innerText?.trim() || '';
      }
      return input.placeholder || input.name || '';
    }

    // Truncate long text
    const text = (el.innerText || el.textContent || '').trim();
    return text.length > 100 ? text.slice(0, 100) + '…' : text;
  }

  /**
   * Build a unique CSS selector for an element.
   */
  function buildSelector(el: HTMLElement): string {
    if (el.id) return `#${el.id}`;

    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).slice(0, 3).join('.');
    const parent = el.parentElement;

    if (classes) {
      const selector = `${tag}.${classes}`;
      // Check uniqueness
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch { /* invalid selector */ }
    }

    // Fallback: nth-child
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(el) + 1;
      const parentSelector = parent.id ? `#${parent.id}` : parent.tagName.toLowerCase();
      return `${parentSelector} > ${tag}:nth-child(${index})`;
    }

    return tag;
  }

  /**
   * Extract all interactive/meaningful DOM elements with their positions.
   */
  function extractDOM(): DOMElement[] {
    const interactiveTags = [
      'a', 'button', 'input', 'textarea', 'select', 'img',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'span', 'td', 'th', 'label', 'li',
    ];

    const elements: DOMElement[] = [];
    const seen = new Set<HTMLElement>();

    // Query interactive elements
    const selector = interactiveTags.join(',');
    const candidates = document.querySelectorAll(selector);

    candidates.forEach((node) => {
      const el = node as HTMLElement;
      if (seen.has(el)) return;

      const rect = el.getBoundingClientRect();
      // Skip invisible or off-screen elements
      if (rect.width < 2 || rect.height < 2) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (rect.right < 0 || rect.left > window.innerWidth) return;

      const role = getElementRole(el);
      if (role === 'generic') return; // Skip uninteresting elements

      const name = getAccessibleName(el);
      if (!name && !['textbox', 'password', 'combobox', 'image'].includes(role)) return;

      seen.add(el);
      elements.push({
        selector: buildSelector(el),
        role,
        name,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        tag: el.tagName.toLowerCase(),
        value: role === 'password' && (el as HTMLInputElement).value ? '[REDACTED_PASSWORD]' : ((el as HTMLInputElement).value || undefined),
        attributes: extractRelevantAttributes(el),
      });
    });

    return elements;
  }

  /**
   * Extract attributes relevant for AI reasoning (type, placeholder, href, etc.)
   */
  function extractRelevantAttributes(el: HTMLElement): Record<string, string> | undefined {
    const attrs: Record<string, string> = {};
    const relevant = ['type', 'placeholder', 'href', 'src', 'alt', 'name', 'autocomplete', 'data-testid'];

    for (const name of relevant) {
      const val = el.getAttribute(name);
      if (val) attrs[name] = val;
    }

    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  // ══════════════════════════════════════════════════════════════
  //  ACTION EXECUTION ENGINE
  // ══════════════════════════════════════════════════════════════

  /**
   * Execute an action command received from the AI server.
   */
  async function executeAction(action: ActionCommand): Promise<{ success: boolean; description: string; error?: string }> {
    console.log('[VisionLite] Executing action:', action);

    try {
      switch (action.action) {
        case 'click': {
          const el = findElement(action.target!);
          if (!el) throw new Error(`Element not found: ${action.target}`);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(200);
          el.click();
          return { success: true, description: `Clicked ${action.target}` };
        }

        case 'type': {
          const el = findElement(action.target!) as HTMLInputElement | HTMLTextAreaElement;
          if (!el) throw new Error(`Element not found: ${action.target}`);
          el.focus();
          el.value = action.value || '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, description: `Typed "${action.value}" into ${action.target}` };
        }

        case 'scroll': {
          const amount = parseInt(action.value || '300');
          window.scrollBy({ top: amount, behavior: 'smooth' });
          return { success: true, description: `Scrolled by ${amount}px` };
        }

        case 'select': {
          const el = findElement(action.target!) as HTMLSelectElement;
          if (!el) throw new Error(`Element not found: ${action.target}`);
          el.value = action.value || '';
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, description: `Selected "${action.value}" in ${action.target}` };
        }

        case 'navigate': {
          window.location.href = action.value || '';
          return { success: true, description: `Navigating to ${action.value}` };
        }

        case 'wait': {
          const ms = parseInt(action.value || '1000');
          await sleep(ms);
          return { success: true, description: `Waited ${ms}ms` };
        }

        case 'done': {
          return { success: true, description: 'Task completed' };
        }

        default:
          return { success: false, description: `Unknown action: ${action.action}`, error: 'Unknown action type' };
      }
    } catch (err: any) {
      return { success: false, description: `Failed: ${action.action}`, error: err.message };
    }
  }

  /**
   * Find an element by CSS selector, with robust fallback strategies.
   */
  function findElement(selector: string): HTMLElement | null {
    if (!selector) return null;

    // Strategy 1: Standard querySelector
    try {
      const el = document.querySelector(selector);
      if (el) return el as HTMLElement;
    } catch {
      // Invalid selector string, try fallbacks
    }

    // Strategy 2: ID match (with or without #)
    const cleanId = selector.startsWith('#') ? selector.slice(1) : selector;
    const byId = document.getElementById(cleanId);
    if (byId) return byId;

    // Strategy 3: Name or placeholder match
    const byName = document.querySelector(`[name="${selector}"], [placeholder="${selector}" i]`);
    if (byName) return byName as HTMLElement;

    // Strategy 4: Button / link / input visible text match
    const buttonsAndLinks = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]')) as HTMLElement[];
    const match = buttonsAndLinks.find(el => {
      const text = (el.innerText || (el as HTMLInputElement).value || '').trim().toLowerCase();
      return text && (text === selector.toLowerCase() || text.includes(selector.toLowerCase()));
    });
    if (match) return match;

    return null;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ══════════════════════════════════════════════════════════════
  //  MESSAGE LISTENER
  // ══════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener(
    (message: any, _sender: chrome.runtime.MessageSender, sendResponse: (resp?: any) => void) => {

      // Background requests DOM snapshot
      if (message.type === 'GET_DOM') {
        const elements = extractDOM();
        const rawSnapshot: DOMSnapshot = {
          url: window.location.href,
          title: document.title,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          elements,
          timestamp: Date.now(),
        };

        // Privacy First: Sanitize DOM structure & strip sensitive values BEFORE leaving the page context
        const sanitizationResult = domSanitizer.sanitize(rawSnapshot);
        const msg: DOMSnapshotMsg = { type: 'DOM_SNAPSHOT', snapshot: sanitizationResult.sanitizedSnapshot };
        sendResponse(msg);
        return false;
      }

      // Background requests action execution
      if (message.type === 'EXECUTE_ACTION') {
        const { action } = message;
        executeAction(action).then((result) => {
          const msg: ActionResultMsg = {
            type: 'ACTION_RESULT',
            success: result.success,
            description: result.description,
            error: result.error,
          };
          sendResponse(msg);
        });
        return true; // async response
      }

      // Toggle extension state
      if (message.type === 'TOGGLE_EXTENSION') {
        console.log(`[VisionLite] Extension ${message.enabled ? 'ENABLED' : 'DISABLED'}`);
        return false;
      }
    }
  );

  console.log('[VisionLite] Content script ready');
}

