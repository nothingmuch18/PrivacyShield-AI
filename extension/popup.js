/* ================================================================
   PrivacyShield AI — Popup Logic
   Handles toggle, task input, side panel opening, and stats updates
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const taskInput = document.getElementById('taskInput');
  const taskSubmit = document.getElementById('taskSubmit');
  const activeTask = document.getElementById('activeTask');
  const activeTaskText = document.getElementById('activeTaskText');
  const taskClear = document.getElementById('taskClear');
  const taskSection = document.getElementById('taskSection');
  const openDashboard = document.getElementById('openDashboard');
  const soundSwitch = document.getElementById('soundSwitch');
  const overlaySwitch = document.getElementById('overlaySwitch');

  // ---- Load saved state ----
  chrome.storage.local.get(['extensionEnabled', 'currentTask', 'soundEnabled', 'overlayVisible'], (result) => {
    const enabled = result.extensionEnabled || false;
    toggleSwitch.checked = enabled;
    updateUI(enabled);

    if (result.currentTask) {
      showActiveTask(result.currentTask);
    }
    
    if (soundSwitch) {
      soundSwitch.checked = result.soundEnabled !== false;
    }

    if (overlaySwitch) {
      overlaySwitch.checked = result.overlayVisible === true;
    }
  });

  if (soundSwitch) {
    soundSwitch.addEventListener('change', () => {
      const soundOn = soundSwitch.checked;
      chrome.storage.local.set({ soundEnabled: soundOn });
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'sound_toggled',
            enabled: soundOn
          }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
        }
      });
    });
  }

  if (overlaySwitch) {
    overlaySwitch.addEventListener('change', () => {
      const overlayOn = overlaySwitch.checked;
      chrome.storage.local.set({ overlayVisible: overlayOn });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'toggle_overlay',
            visible: overlayOn
          }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
        }
      });
    });
  }

  // ---- Toggle switch handler ----
  toggleSwitch.addEventListener('change', () => {
    const enabled = toggleSwitch.checked;
    chrome.storage.local.set({ extensionEnabled: enabled });
    updateUI(enabled);

    // Send message to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'toggle_extension',
          enabled: enabled
        }).catch(() => {
          // Content script might not be injected yet
          console.log('[Popup] Content script not available on this tab');
        });
      }
    });

    // Send message to background
    chrome.runtime.sendMessage({
      type: 'extension_toggled',
      enabled: enabled
    });

    // Auto-open side panel when enabled
    if (enabled) {
      openSidePanel();
    }
  });

  // ---- Task input handler ----
  taskSubmit.addEventListener('click', submitTask);
  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitTask();
  });

  taskClear.addEventListener('click', () => {
    chrome.storage.local.remove('currentTask');
    activeTask.style.display = 'none';
    taskInput.value = '';
    taskInput.parentElement.style.display = 'flex';

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'task_updated',
          task: null
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      }
    });
    // Notify side panel
    chrome.runtime.sendMessage({ type: 'task_updated', task: null }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
  });

  function submitTask() {
    const task = taskInput.value.trim();
    if (!task) return;

    chrome.storage.local.set({ currentTask: task });
    showActiveTask(task);

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'task_updated',
          task: task
        }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
      }
    });
    // Notify side panel
    chrome.runtime.sendMessage({ type: 'task_updated', task: task }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
  }

  function showActiveTask(task) {
    activeTaskText.textContent = task;
    activeTask.style.display = 'flex';
    taskInput.parentElement.style.display = 'none';
  }

  // ---- Dashboard button ----
  openDashboard.addEventListener('click', openSidePanel);

  function openSidePanel() {
    chrome.runtime.sendMessage({ type: 'open_side_panel' });
  }

  // ---- UI updates ----
  function updateUI(enabled) {
    if (enabled) {
      statusDot.classList.add('active');
      statusText.classList.add('active');
      statusText.textContent = 'Active';
    } else {
      statusDot.classList.remove('active');
      statusText.classList.remove('active');
      statusText.textContent = 'Inactive';
    }
  }

  // ---- Listen for stats updates from background ----
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'stats_update') {
      const data = message.data;
      if (data.detected !== undefined) {
        animateCounter('statDetected', data.detected);
      }
      if (data.protected !== undefined) {
        animateCounter('statProtected', data.protected);
      }
      if (data.latency !== undefined) {
        document.getElementById('statLatency').textContent = data.latency;
      }
    }
  });

  function animateCounter(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseInt(element.textContent) || 0;
    if (currentValue === targetValue) return;

    const duration = 400;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const value = Math.round(currentValue + (targetValue - currentValue) * eased);
      element.textContent = value;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }
});
