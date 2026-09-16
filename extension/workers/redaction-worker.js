/* ================================================================
   PrivacyShield AI — Redaction Web Worker
   Handles image blurring and drawing redaction overlays using OffscreenCanvas
   ================================================================ */

function applyBlur(ctx, x, y, width, height, radius) {
  // Simple pixelation-based blur (fast canvas approach)
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

  // Draw the region
  tempCtx.drawImage(ctx.canvas, x, y, width, height, 0, 0, width, height);

  // Pixelate by drawing small then scaling up
  const pixelSize = Math.max(4, Math.round(radius / 3));
  const smallW = Math.max(1, Math.round(width / pixelSize));
  const smallH = Math.max(1, Math.round(height / pixelSize));

  tempCtx.imageSmoothingEnabled = true;
  tempCtx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, smallW, smallH);
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(tempCanvas, 0, 0, smallW, smallH, 0, 0, width, height);

  // Draw back
  ctx.drawImage(tempCanvas, 0, 0, width, height, x, y, width, height);
}

async function redactFrame(imageBitmap, detections, dpr) {
  const redactedCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = redactedCanvas.getContext('2d', { willReadFrequently: true });

  // Copy original image
  ctx.drawImage(imageBitmap, 0, 0);

  const redactions = [];
  const confidenceThreshold = 0.5;
  const uncertainThreshold = 0.3;

  // Function to draw semantic mask
  function drawSemanticMask(x, y, width, height, labelText, bgColor) {
    // Solid background
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);

    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Semantic Label Text
    ctx.fillStyle = '#ffffff';
    // Dynamically size text based on box size, min 10px, max 24px
    let fontSize = Math.min(24, Math.max(10, Math.floor(height / 4)));
    ctx.font = `bold ${fontSize}px sans-serif`;
    
    // Center text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Split label into words if it's long
    const words = labelText.split(' ');
    let yOffset = y + (height / 2) - ((words.length - 1) * (fontSize * 0.6));
    
    words.forEach(word => {
        ctx.fillText(word, x + (width / 2), yOffset);
        yOffset += fontSize * 1.2;
    });
  }

  // Redact faces
  if (detections.faces) {
    detections.faces.forEach((face, i) => {
      if (face.confidence < uncertainThreshold) return;

      const x = face.x * dpr;
      const y = face.y * dpr;
      const width = face.width * dpr;
      const height = face.height * dpr;

      if (face.confidence >= confidenceThreshold) {
        // Full Semantic Obfuscation for Faces
        drawSemanticMask(x, y, width, height, `[FACE ${i+1}]`, '#111827');
        redactions.push({
          type: 'face',
          position: { x, y, width, height },
          replacement: `[FACE ${i+1}]`
        });
      } else {
        // Warning outline for low confidence
        ctx.strokeStyle = 'rgba(255, 153, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(x, y, width, height);
        ctx.setLineDash([]);
      }
    });
  }

  // Redact PII (Text/DOM)
  if (detections.piiItems) {
    detections.piiItems.forEach((pii) => {
      if (!pii.position) return;
      
      const x = pii.position.x * dpr;
      const y = pii.position.y * dpr;
      const width = pii.position.width * dpr;
      const height = pii.position.height * dpr;

      const bgColor = pii.severity === 'high' ? '#991b1b' : // Dark Red
                      pii.severity === 'medium' ? '#9a3412' : // Dark Orange
                      '#166534'; // Dark Green

      // Semantic Obfuscation for PII
      const semanticLabel = `[${pii.label.toUpperCase()}]`;
      drawSemanticMask(x, y, width, height, semanticLabel, bgColor);
      redactions.push({
        type: pii.type || 'pii',
        position: { x, y, width, height },
        replacement: semanticLabel
      });
    });
  }

  // Generate output as blob then to base64
  const blob = await redactedCanvas.convertToBlob({ type: 'image/png' });
  const reader = new FileReaderSync();
  const redactedBase64 = reader.readAsDataURL(blob);

  return {
    redactedBase64: redactedBase64,
    structuralDescription: {
      redactions: redactions,
      summary: `${redactions.filter(r => r.type === 'face').length} faces and ` +
               `${redactions.filter(r => r.type !== 'face').length} PII items were redacted`
    }
  };
}

self.onmessage = async function(e) {
  const msg = e.data;
  
  if (msg.type === 'redact') {
    try {
      const response = await fetch(msg.image);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      
      const result = await redactFrame(imageBitmap, msg.detections, msg.dpr);
      imageBitmap.close();
      
      self.postMessage({
        type: 'redact_result',
        result: result,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[RedactionWorker] Error during redaction:', err);
      self.postMessage({
        type: 'redact_error',
        error: err.message
      });
    }
  }
};
