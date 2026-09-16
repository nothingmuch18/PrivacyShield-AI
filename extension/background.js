/* ================================================================
   PrivacyShield AI — Background Service Worker
   Handles screen capture, message routing, and side panel management
   ================================================================ */

console.log('[PrivacyShield] Background service worker loaded');

// ---- Screen Capture ----
async function captureScreen() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 85
    });
    return dataUrl;
  } catch (error) {
    console.error('[PrivacyShield] Screen capture failed:', error.message);
    return null;
  }
}

// ---- Message Routing ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle screen capture requests from content script
  if (message.type === 'capture_screen') {
    captureScreen().then((dataUrl) => {
      sendResponse({ success: !!dataUrl, dataUrl: dataUrl });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // async response
  }

  // Handle side panel open request
  if (message.type === 'open_side_panel') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch((err) => {
          console.error('[PrivacyShield] Failed to open side panel:', err);
        });
      }
    });
    return false;
  }

  // Handle extension toggle notification
  if (message.type === 'extension_toggled') {
    console.log(`[PrivacyShield] Extension ${message.enabled ? 'ENABLED' : 'DISABLED'}`);
    // Auto-open side panel when enabled
    if (message.enabled) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });
        }
      });
    }
    return false;
  }

  // Relay detection updates from content script to side panel
  if (message.type === 'detection_update') {
    // Forward to all extension pages (side panel will pick this up)
    chrome.runtime.sendMessage({
      type: 'detection_update',
      data: message.data
    }).catch(() => {
      // Side panel might not be open — that's fine
    });
    return false;
  }

  // Relay stats updates to popup
  if (message.type === 'stats_update') {
    // Already being sent via chrome.runtime, popup will catch it
    return false;
  }

  // Handle Chrome notifications
  if (message.type === 'show_notification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png', // Fallback, Chrome will ignore if not found
      title: message.title,
      message: message.message
    });
    return false;
  }

  // Handle open_tab command from Agent Controller
  if (message.type === 'open_tab') {
    chrome.tabs.create({ url: message.url, active: true }, (tab) => {
      if (sendResponse) sendResponse({ success: true, tabId: tab.id });
    });
    return true; // async response
  }
});

// ---- Side Panel Behavior ----
// Set side panel to be available on all tabs
chrome.sidePanel.setOptions({
  enabled: true
}).catch(err => { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError); else console.warn(err); });

// ---- Installation ----
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[PrivacyShield] Extension installed successfully');
    chrome.storage.local.set({ extensionEnabled: false });
  }
});
