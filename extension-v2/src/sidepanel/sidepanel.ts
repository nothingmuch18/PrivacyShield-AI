/**
 * VisionLite AI v2 — Side Panel Script
 *
 * Controls the interactive Side Panel UI.
 * Connects to the background service worker to send user tasks and
 * receive live AI reasoning and execution logs.
 */

import type { AgentStateUpdateMsg, StartPipelineMsg, StopPipelineMsg, SidePanelChatMsg, PipelineStatusMsg } from '../types/messages';

// ════════════════════════════════════════════════════════════════
//  DOM ELEMENTS
// ════════════════════════════════════════════════════════════════

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

const chatArea = $('chatArea')!;
const chatInput = $<HTMLTextAreaElement>('chatInput')!;
const sendBtn = $<HTMLButtonElement>('sendBtn')!;
const clearChatBtn = $<HTMLButtonElement>('clearChatBtn')!;

const goalText = $('goalText')!;
const statusDotEl = document.querySelector('.status-dot') as HTMLElement;
const statusText = $('statusText')!;

// ════════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ════════════════════════════════════════════════════════════════

sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

clearChatBtn.addEventListener('click', () => {
  // Keep the first system message, remove the rest
  const firstMsg = chatArea.firstElementChild;
  chatArea.innerHTML = '';
  if (firstMsg) chatArea.appendChild(firstMsg);
  
  // Stop pipeline if active
  const msg: StopPipelineMsg = { type: 'STOP_PIPELINE' };
  chrome.runtime.sendMessage(msg);
  
  updateGoalUI(null, 'idle');
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

// ════════════════════════════════════════════════════════════════
//  ACTIONS
// ════════════════════════════════════════════════════════════════

function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Add user message to UI
  appendUserMessage(text);
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Start the pipeline
  const msg: StartPipelineMsg = { type: 'START_PIPELINE', task: text };
  chrome.runtime.sendMessage(msg);
  
  updateGoalUI(text, 'analyzing');
}

// ════════════════════════════════════════════════════════════════
//  MESSAGE LISTENER
// ════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message: any) => {
  // 1. Agent State Updates
  if (message.type === 'AGENT_STATE_UPDATE') {
    const update = message as AgentStateUpdateMsg;
    updateGoalUI(update.task, update.status);

    if (update.reasoning || update.actionDescription) {
      appendAgentMessage(update.reasoning, update.actionDescription);
    }
    
    if (update.error) {
      appendSystemMessage(`❌ Error: ${update.error}`);
    }

    if (update.metrics?.cloudLatencyMs) {
      document.getElementById('metricCloud')!.textContent = `${update.metrics.cloudLatencyMs} ms`;
    }
  }

  // 2. Chat messages
  if (message.type === 'SIDEPANEL_CHAT') {
    const msg = message as SidePanelChatMsg;
    appendAgentMessage(msg.message);
  }

  // 3. Stats Update
  if (message.type === 'STATS_UPDATE') {
    const msg = message as any;
    document.getElementById('metricInference')!.textContent = `${msg.latencyMs} ms`;
    document.getElementById('metricPii')!.textContent = `${msg.detected} items`;
  }

  if (message.type === 'PIPELINE_STATUS') {
    const status = message as PipelineStatusMsg;
    if (!status.active) {
      updateGoalUI(status.task || null, 'idle');
    }
  }
});

// ════════════════════════════════════════════════════════════════
//  UI UPDATES
// ════════════════════════════════════════════════════════════════

function updateGoalUI(task: string | null, status: 'idle' | 'analyzing' | 'executing' | 'done' | 'error') {
  goalText.textContent = task || 'Waiting for task...';
  
  statusDotEl.className = 'status-dot ' + status;
  statusText.textContent = status.toUpperCase();
}

function appendUserMessage(text: string) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
  chatArea.appendChild(div);
  scrollToBottom();
}

function appendSystemMessage(text: string) {
  const div = document.createElement('div');
  div.className = 'message system-message';
  div.innerHTML = `<div class="message-content"><p>${escapeHTML(text)}</p></div>`;
  chatArea.appendChild(div);
  scrollToBottom();
}

function appendAgentMessage(reasoning?: string, action?: string) {
  const div = document.createElement('div');
  div.className = 'message agent-message';
  
  let html = `<div class="message-content">`;
  if (reasoning) {
    html += `<div class="agent-reasoning">${escapeHTML(reasoning)}</div>`;
  }
  if (action) {
    html += `<div class="agent-action">${escapeHTML(action)}</div>`;
  }
  html += `</div>`;
  
  div.innerHTML = html;
  chatArea.appendChild(div);
  scrollToBottom();
}

function escapeHTML(str: string) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function scrollToBottom() {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// Request initial status
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response: any) => {
  if (response && response.active && response.task) {
    updateGoalUI(response.task, 'analyzing');
  }
});

console.log('[VisionLite] Side Panel loaded');

