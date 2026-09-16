/**
 * Debug View Script
 * Listens for DEBUG_PAYLOAD messages from the Background Script
 * and renders them in the split-screen UI.
 */

const imagePreview = document.getElementById('imagePreview') as HTMLImageElement;
const imageWaiting = document.getElementById('imageWaiting')!;
const jsonPreview = document.getElementById('jsonPreview')!;
const jsonWaiting = document.getElementById('jsonWaiting')!;
const imgSizeLabel = document.getElementById('imgSize')!;
const jsonSizeLabel = document.getElementById('jsonSize')!;
const statusPulse = document.getElementById('statusPulse')!;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'DEBUG_PAYLOAD') {
    const { imageBase64, domState } = message.payload;

    console.log('[VisionLite:Debug] Received payload to render.');

    // 1. Render Image
    if (imageBase64) {
      imagePreview.src = imageBase64;
      imagePreview.style.display = 'block';
      imageWaiting.style.display = 'none';
      
      // Calculate approx size
      const sizeKB = Math.round((imageBase64.length * 0.75) / 1024);
      imgSizeLabel.textContent = `${sizeKB} KB`;
    }

    // 2. Render JSON
    if (domState) {
      const jsonString = JSON.stringify(domState, null, 2);
      jsonPreview.textContent = jsonString;
      jsonPreview.style.display = 'block';
      jsonWaiting.style.display = 'none';

      // Calculate approx size
      const sizeKB = Math.round(jsonString.length / 1024);
      jsonSizeLabel.textContent = `${sizeKB} KB`;
    }

    // Visual pulse effect
    statusPulse.style.backgroundColor = '#f87171'; // red
    statusPulse.style.boxShadow = '0 0 8px #ef4444';
    setTimeout(() => {
      statusPulse.style.backgroundColor = '#238636'; // back to green
      statusPulse.style.boxShadow = '0 0 8px #2ea043';
    }, 500);
  }
});

console.log('[VisionLite:Debug] Ready to intercept payloads.');

