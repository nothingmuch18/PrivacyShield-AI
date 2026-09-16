// extension/utils/manifest-builder.js

window.ManifestBuilder = (function() {
  let manifest = {
    total: 0,
    tokens: {}
  };
  
  // Maps original values to their tokens for quick lookup during sanitization
  let valueToTokenMap = new Map();
  
  let typeCounters = {};

  function reset() {
    manifest = {
      total: 0,
      tokens: {}
    };
    valueToTokenMap.clear();
    typeCounters = {};
  }

  function generateTokenName(type) {
    const safeType = (type || 'PII').toUpperCase().replace(/[^A-Z0-9]/g, '_');
    if (!typeCounters[safeType]) {
      typeCounters[safeType] = 1;
    } else {
      typeCounters[safeType]++;
    }
    return `[${safeType}_${typeCounters[safeType]}]`;
  }

  function buildManifest(detections) {
    reset();

    // Process faces
    if (detections.faces) {
      detections.faces.forEach((face, idx) => {
        if (face.confidence >= 0.5) {
          const token = `[FACE_${idx + 1}]`;
          manifest.tokens[token] = {
            type: 'face',
            severity: 'high',
            region: {
              x: face.x,
              y: face.y,
              width: face.width,
              height: face.height
            }
          };
          manifest.total++;
        }
      });
    }

    // Process text PII
    if (detections.piiItems) {
      detections.piiItems.forEach(pii => {
        if (pii.confidence >= 0.5) {
          const token = generateTokenName(pii.type);
          manifest.tokens[token] = {
            type: pii.type,
            label: pii.label,
            severity: pii.severity,
            format: pii.maskedValue
          };
          if (pii.position) {
            manifest.tokens[token].region = pii.position;
          }
          
          valueToTokenMap.set(pii.value, token);
          
          // Also set lowercased and trimmed versions for better matching
          valueToTokenMap.set(pii.value.toLowerCase(), token);
          valueToTokenMap.set(pii.value.trim(), token);
          
          manifest.total++;
        }
      });
    }

    return manifest;
  }

  function sanitizeString(text) {
    if (!text || typeof text !== 'string') return text;
    
    let sanitized = text;
    // Iterate over the keys (original PII values) and replace them in the text
    for (const [originalValue, token] of valueToTokenMap.entries()) {
      // Skip empty strings
      if (!originalValue) continue;
      // Need to escape regex characters in originalValue
      const escapedValue = originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedValue, 'gi');
      sanitized = sanitized.replace(regex, token);
    }
    
    return sanitized;
  }

  return {
    buildManifest,
    sanitizeString,
    getManifest: () => manifest
  };
})();
