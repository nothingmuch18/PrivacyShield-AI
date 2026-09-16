/**
 * VisionLite AI v2 — Popup Script
 *
 * Handles the popup UI: toggle extension on/off, submit agent goals,
 * display live stats, and communicate with the background service worker.
 */

import type { StartPipelineMsg, StopPipelineMsg, StatsUpdateMsg, PipelineStatusMsg } from '../types/messages';

// ════════════════════════════════════════════════════════════════
//  DOM ELEMENTS
// ════════════════════════════════════════════════════════════════

const $ = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const toggleSwitch = $<HTMLInputElement>('toggleSwitch')!;
const statusDot = $('statusDot')!;
const statusText = $('statusText')!;
const taskInput = $<HTMLInputElement>('taskInput')!;
const taskSubmit = $<HTMLButtonElement>('taskSubmit')!;
const activeTask = $('activeTask')!;
const activeTaskText = $('activeTaskText')!;
const taskClear = $<HTMLButtonElement>('taskClear')!;
const pipelineStatus = $('pipelineStatus')!;
const pipelineFill = $('pipelineFill')!;
const pipelineLabel = $('pipelineLabel')!;

// ════════════════════════════════════════════════════════════════
//  LOAD SAVED STATE
// ════════════════════════════════════════════════════════════════

chrome.storage.local.get(
  ['extensionEnabled', 'currentTask'],
  (result: Record<string, any>) => {
    const enabled = result.extensionEnabled || false;
    toggleSwitch.checked = enabled;
    updateUI(enabled);

    if (result.currentTask) {
      showActiveTask(result.currentTask);
    }
  }
);

// ════════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ════════════════════════════════════════════════════════════════

// Toggle extension on/off
toggleSwitch.addEventListener('change', () => {
  const enabled = toggleSwitch.checked;
  chrome.storage.local.set({ extensionEnabled: enabled });
  updateUI(enabled);

  if (enabled) {
    // If a task is set, start the pipeline immediately
    chrome.storage.local.get(['currentTask'], (result: Record<string, any>) => {
      if (result.currentTask) {
        sendStartPipeline(result.currentTask);
      }
    });
  } else {
    const msg: StopPipelineMsg = { type: 'STOP_PIPELINE' };
    chrome.runtime.sendMessage(msg);
  }
});

// Submit task
taskSubmit.addEventListener('click', submitTask);
taskInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') submitTask();
});

// Clear task
taskClear.addEventListener('click', () => {
  chrome.storage.local.remove('currentTask');
  activeTask.style.display = 'none';
  taskInput.value = '';
  taskInput.parentElement!.style.display = 'flex';

  const msg: StopPipelineMsg = { type: 'STOP_PIPELINE' };
  chrome.runtime.sendMessage(msg);
});

// ════════════════════════════════════════════════════════════════
//  MESSAGE LISTENER (stats from background)
// ════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message: any) => {
  if (message.type === 'STATS_UPDATE') {
    const stats = message as StatsUpdateMsg;
    animateCounter('statDetected', stats.detected);
    animateCounter('statProtected', stats.protected);
    const latencyEl = $('statLatency');
    if (latencyEl) latencyEl.textContent = String(stats.latencyMs);

    if (stats.pipelineActive) {
      pipelineStatus.style.display = 'flex';
      pipelineFill.style.width = '100%';
      pipelineLabel.textContent = `${stats.latencyMs}ms per cycle`;
    }
  }

  if (message.type === 'PIPELINE_STATUS') {
    const status = message as PipelineStatusMsg;
    if (!status.active) {
      pipelineStatus.style.display = 'none';
    }
  }
});

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

function submitTask(): void {
  const task = taskInput.value.trim();
  if (!task) return;

  chrome.storage.local.set({ currentTask: task, extensionEnabled: true });
  showActiveTask(task);
  toggleSwitch.checked = true;
  updateUI(true);
  sendStartPipeline(task);
}

function sendStartPipeline(task: string): void {
  const msg: StartPipelineMsg = { type: 'START_PIPELINE', task };
  chrome.runtime.sendMessage(msg);

  // Show pipeline indicator
  pipelineStatus.style.display = 'flex';
  pipelineFill.style.width = '30%';
  pipelineLabel.textContent = 'Capturing screen...';
}

function showActiveTask(task: string): void {
  activeTaskText.textContent = task;
  activeTask.style.display = 'flex';
  taskInput.parentElement!.style.display = 'none';
}

function updateUI(enabled: boolean): void {
  if (enabled) {
    statusDot.classList.add('active');
    statusText.classList.add('active');
    statusText.textContent = 'Active';
  } else {
    statusDot.classList.remove('active');
    statusText.classList.remove('active');
    statusText.textContent = 'Inactive';
    pipelineStatus.style.display = 'none';
  }
}

function animateCounter(elementId: string, targetValue: number): void {
  const element = $(elementId);
  if (!element) return;

  const currentValue = parseInt(element.textContent || '0') || 0;
  if (currentValue === targetValue) return;

  const duration = 400;
  const startTime = performance.now();

  function update(currentTime: number): void {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const value = Math.round(currentValue + (targetValue - currentValue) * eased);
    element!.textContent = String(value);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

console.log('[VisionLite] Popup loaded');

