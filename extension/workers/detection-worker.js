/* ================================================================
   PrivacyShield AI — Face Detection Web Worker
   Uses Chrome's built-in Shape Detection API (FaceDetector)
   No external dependencies — works within MV3 CSP restrictions
   ================================================================ */

let faceDetector = null;
let webGpuDetector = null;
let modelLoading = false;
let modelReady = false;
let useNativeApi = false;

// Attempt to load Transformers.js if running via blob with injected __ext_url__
try {
  if (typeof __ext_url__ !== 'undefined') {
    importScripts(__ext_url__ + 'workers/libs/transformers.min.js');
  }
} catch (e) {
  console.warn('[DetectionWorker] Could not load transformers.js:', e);
}

// Notify main thread of model status
function sendStatus(status, progress = 0) {
  self.postMessage({ type: 'model_status', status, progress });
}

// Initialize the model
async function initModel() {
  if (modelLoading || modelReady) return;
  modelLoading = true;

  sendStatus('loading', 10);
  console.log('[DetectionWorker] Initializing detection pipeline...');

  try {
    // Try Chrome's built-in FaceDetector API (Shape Detection API)
    if (typeof FaceDetector !== 'undefined') {
      sendStatus('loading', 50);

      faceDetector = new FaceDetector({
        maxDetectedFaces: 10,
        fastMode: true
      });

      // Verify the API works with a small test image
      const testCanvas = new OffscreenCanvas(10, 10);
      const testCtx = testCanvas.getContext('2d');
      testCtx.fillStyle = '#ffffff';
      testCtx.fillRect(0, 0, 10, 10);
      await faceDetector.detect(testCanvas);

      useNativeApi = true;
      modelReady = true;
      modelLoading = false;
      sendStatus('ready', 100);
      console.log('[DetectionWorker] Native FaceDetector API ready ✅ (zero-download)');
      return;
    }
  } catch (nativeError) {
    console.warn('[DetectionWorker] Native FaceDetector not available:', nativeError.message);
  }

  // Fallback: WebGPU / WASM Object Detection via Transformers.js (Crucial for Firefox)
  try {
    sendStatus('loading', 70);
    if (self['@xenova/transformers']) {
      console.log('[DetectionWorker] Loading WebGPU Transformers.js model...');
      const { pipeline, env } = self['@xenova/transformers'];
      
      // Configure environment for extension
      env.allowLocalModels = false; // We use HTTP fetch with absolute URL, not FS
      env.allowRemoteModels = false;
      if (typeof __ext_url__ !== 'undefined') {
        env.localModelPath = __ext_url__ + 'workers/models/';
        env.allowLocalModels = true; // Required to use localModelPath via fetch
      }
      env.backends.onnx.wasm.numThreads = 1;
      
      // Load a tiny object detection model
      webGpuDetector = await pipeline('object-detection', 'Xenova/yolos-tiny', {
        progress_callback: (info) => {
          if (info.status === 'progress') {
            sendStatus('loading', 70 + Math.floor(info.progress * 0.25));
          }
        }
      });
      
      useNativeApi = false;
      modelReady = true;
      modelLoading = false;
      sendStatus('ready', 100);
      console.log('[DetectionWorker] WebGPU Transformers.js Object Detection ready ✅');
      return;
    }
  } catch (error) {
    console.warn('[DetectionWorker] Transformers.js WebGPU fallback failed:', error);
  }

  // Absolute fallback: canvas-based skin-tone heuristic detection
  try {
    useNativeApi = false;
    modelReady = true;
    modelLoading = false;
    sendStatus('ready', 100);
    console.log('[DetectionWorker] Using canvas-based heuristic detection (absolute fallback) ✅');
  } catch (error) {
    console.error('[DetectionWorker] All detection methods failed:', error);
    modelLoading = false;
    sendStatus('error', 0);
  }
}

// Run face detection using Native FaceDetector API
async function detectFacesNative(imageBitmap) {
  try {
    const results = await faceDetector.detect(imageBitmap);

    return (results || []).map(r => ({
      x: Math.round(r.boundingBox.x),
      y: Math.round(r.boundingBox.y),
      width: Math.round(r.boundingBox.width),
      height: Math.round(r.boundingBox.height),
      confidence: 0.85, // Native API doesn't provide confidence scores
      label: 'face'
    }));
  } catch (error) {
    console.error('[DetectionWorker] Native detection error:', error);
    return [];
  }
}

// Fallback: canvas-based skin-tone heuristic detection
function detectFacesHeuristic(imageBitmap) {
  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageBitmap, 0, 0);

    // Downsample for performance
    const scale = Math.min(1, 320 / Math.max(imageBitmap.width, imageBitmap.height));
    const sw = Math.round(imageBitmap.width * scale);
    const sh = Math.round(imageBitmap.height * scale);

    const smallCanvas = new OffscreenCanvas(sw, sh);
    const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
    smallCtx.drawImage(imageBitmap, 0, 0, sw, sh);

    const imageData = smallCtx.getImageData(0, 0, sw, sh);
    const data = imageData.data;

    // Skin-tone detection using RGB thresholds
    const skinMap = new Uint8Array(sw * sh);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Simple skin-tone classifier
      if (r > 95 && g > 40 && b > 20 &&
          r > g && r > b &&
          (r - g) > 15 &&
          Math.abs(r - g) > 15 &&
          r - b > 15) {
        skinMap[i / 4] = 1;
      }
    }

    // Find connected components (simple blob detection)
    const faces = [];
    const visited = new Uint8Array(sw * sh);
    const MIN_BLOB_SIZE = Math.max(80, Math.round(sw * sh * 0.003)); // Min size for face blobs
    const MAX_BLOB_SIZE = Math.round(sw * sh * 0.35);   // Max 35% of image

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = y * sw + x;
        if (skinMap[idx] && !visited[idx]) {
          // BFS to find connected component
          let minX = x, maxX = x, minY = y, maxY = y;
          let count = 0;
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0 && count < MAX_BLOB_SIZE) {
            const current = queue.shift();
            const cx = current % sw;
            const cy = Math.floor(current / sw);
            count++;

            minX = Math.min(minX, cx);
            maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy);
            maxY = Math.max(maxY, cy);

            // Check 4-connected neighbors
            const neighbors = [
              cy > 0 ? current - sw : -1,
              cy < sh - 1 ? current + sw : -1,
              cx > 0 ? current - 1 : -1,
              cx < sw - 1 ? current + 1 : -1
            ];

            for (const n of neighbors) {
              if (n >= 0 && n < sw * sh && skinMap[n] && !visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }

          // Check if blob could be a face (aspect ratio and size constraints)
          const blobW = maxX - minX + 1;
          const blobH = maxY - minY + 1;
          const aspectRatio = blobW / (blobH || 1);

          if (count >= MIN_BLOB_SIZE && count < MAX_BLOB_SIZE &&
              aspectRatio > 0.45 && aspectRatio < 2.2 &&
              blobW > 6 && blobH > 6) {
            // Scale back to original coordinates
            faces.push({
              x: Math.round(minX / scale),
              y: Math.round(minY / scale),
              width: Math.round(blobW / scale),
              height: Math.round(blobH / scale),
              confidence: 0.85,
              label: 'face'
            });
          }
        }
      }
    }

    // Limit to top 5 largest blobs (most likely to be faces)
    faces.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return faces.slice(0, 5);

  } catch (error) {
    console.error('[DetectionWorker] Heuristic detection error:', error);
    return [];
  }
}

// Run WebGPU object detection
async function detectWebGPU(imageBitmap) {
  try {
    // Transformers.js object detection requires an image URL or Blob/Canvas
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);
    const blob = await canvas.convertToBlob();
    const url = URL.createObjectURL(blob);
    
    // Run detection
    const results = await webGpuDetector(url, { threshold: 0.5 });
    URL.revokeObjectURL(url);
    
    // Map bounding boxes and filter for person/face related labels
    return results
      .filter(r => r.label === 'person' || r.label === 'face' || r.label.includes('human'))
      .map(r => ({
        x: Math.round(r.box.xmin),
        y: Math.round(r.box.ymin),
        width: Math.round(r.box.xmax - r.box.xmin),
        height: Math.round(r.box.ymax - r.box.ymin),
        confidence: r.score,
        label: 'face' // Treat people/faces as the same for redaction
      }));
  } catch (error) {
    console.error('[DetectionWorker] WebGPU detection error:', error);
    return [];
  }
}

// Run face detection on an image
async function detectFaces(imageBase64) {
  if (!modelReady) {
    if (!modelLoading) initModel();
    return [];
  }

  try {
    const response = await fetch(imageBase64);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    let faces = [];
    if (useNativeApi && faceDetector) {
      faces = await detectFacesNative(imageBitmap);
    } else if (webGpuDetector) {
      faces = await detectWebGPU(imageBitmap);
    } else {
      faces = detectFacesHeuristic(imageBitmap);
    }

    imageBitmap.close();
    return faces;
  } catch (err) {
    console.error('[DetectionWorker] Detection pipeline error:', err);
    return [];
  }
}

// Worker message handler
self.onmessage = async function(e) {
  const msg = e.data;
  
  if (msg.type === 'init') {
    await initModel();
  }

  if (msg.type === 'detect') {
    // Auto-init if needed
    if (!modelReady && !modelLoading) {
      await initModel();
    }

    const faces = await detectFaces(msg.image);

    self.postMessage({
      type: 'detection_result',
      faces: faces,
      timestamp: Date.now()
    });
  }
};
