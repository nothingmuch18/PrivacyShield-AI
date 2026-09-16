// extension/utils/redactor.js

window.Redactor = (function() {
  function applyBlur(ctx, x, y, width, height, radius) {
    // Simple pixelation-based blur (fast canvas approach)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

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

  async function redactFrame(canvas, detections) {
    const redactedCanvas = document.createElement('canvas');
    redactedCanvas.width = canvas.width;
    redactedCanvas.height = canvas.height;
    const ctx = redactedCanvas.getContext('2d');

    // Copy original image
    ctx.drawImage(canvas, 0, 0);

    const redactions = [];
    const confidenceThreshold = 0.5;
    const uncertainThreshold = 0.3;
    const dpr = window.devicePixelRatio || 1;

    // Redact faces
    if (detections.faces) {
      detections.faces.forEach((face, i) => {
        if (face.confidence < uncertainThreshold) return;

        const x = face.x * dpr;
        const y = face.y * dpr;
        const width = face.width * dpr;
        const height = face.height * dpr;

        if (face.confidence >= confidenceThreshold) {
          // Full blur redaction
          applyBlur(ctx, x, y, width, height, 20);

          // Semi-transparent overlay
          ctx.fillStyle = 'rgba(255, 0, 102, 0.3)';
          ctx.fillRect(x, y, width, height);

          // Label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillText('REDACTED', x + 4, y - 4);

          redactions.push({
            type: 'face',
            position: { x, y, width, height },
            replacement: `REDACTED_FACE_${i + 1}`
          });
        } else {
          // Uncertain — yellow overlay
          ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
          ctx.fillRect(x, y, width, height);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillText('UNCERTAIN', x + 4, y - 4);
        }
      });
    }

    // Redact text PII (from OCR positions or DOM positions)
    if (detections.piiItems) {
      detections.piiItems.forEach((pii) => {
        if (pii.position && pii.confidence >= confidenceThreshold) {
          const x = pii.position.x * dpr;
          const y = pii.position.y * dpr;
          const width = pii.position.width * dpr;
          const height = pii.position.height * dpr;

          // Color by severity
          let fillColor;
          if (pii.severity === 'high') {
            fillColor = '#000000';
          } else if (pii.severity === 'medium') {
            fillColor = '#374151';
          } else {
            fillColor = '#6b7280';
          }

          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, width, height);

          // Label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px Inter, sans-serif';
          const label = `[${pii.type.toUpperCase()}]`;
          ctx.fillText(label, x + 2, y + height - 3);

          redactions.push({
            type: pii.type,
            position: { x, y, width, height },
            replacement: `REDACTED_${pii.type.toUpperCase()} (${pii.maskedValue})`
          });
        }
      });
    }

    // Generate output
    const redactedBase64 = redactedCanvas.toDataURL('image/png');

    return {
      redactedCanvas: redactedCanvas,
      redactedBase64: redactedBase64,
      structuralDescription: {
        redactions: redactions,
        summary: `${redactions.filter(r => r.type === 'face').length} faces and ` +
                 `${redactions.filter(r => r.type !== 'face').length} PII items were redacted`
      }
    };
  }

  async function testRedactor() {
    console.log('[Redactor Test] Starting test...');
    const start = performance.now();

    // Create a dummy canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    
    // Draw some fake background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#000000';
    ctx.fillText('This is some text that contains a credit card 1234-5678-9012-3456.', 50, 100);
    ctx.fillText('There is also a face here.', 400, 300);

    const detections = {
      faces: [
        { x: 380, y: 280, width: 100, height: 100, confidence: 0.9 }, // Confident face
        { x: 100, y: 400, width: 80, height: 80, confidence: 0.4 } // Uncertain face
      ],
      piiItems: [
        { type: 'credit_card', maskedValue: 'XXXX XXXX XXXX 3456', severity: 'high', confidence: 0.95, position: { x: 50, y: 90, width: 250, height: 15 } },
        { type: 'phone', maskedValue: 'XXXXXX6789', severity: 'medium', confidence: 0.8, position: { x: 50, y: 150, width: 100, height: 15 } }
      ]
    };

    const result = await redactFrame(canvas, detections);
    
    const timeTaken = performance.now() - start;
    console.log(`[Redactor Test] Completed in ${Math.round(timeTaken)}ms.`);
    console.log(`[Redactor Test] Redactions:`, result.structuralDescription);
    
    return result;
  }

  return {
    redactFrame,
    testRedactor
  };
})();
