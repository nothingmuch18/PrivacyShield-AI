// extension/utils/pii-detector.js

window.PIIDetector = (function() {

  const PII_PATTERNS = {
    // INDIAN-SPECIFIC PII
    aadhaar: {
      regex: /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g,
      severity: 'high',
      label: 'Aadhaar Number'
    },
    pan: {
      regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
      severity: 'high',
      label: 'PAN Card'
    },
    indian_phone: {
      regex: /(?:\+91[\s-]?|0)?[6-9](?:[\s-]?\d){9}\b/g,
      severity: 'medium',
      label: 'Phone Number'
    },
    indian_passport: {
      regex: /\b[A-Z][0-9]{7}\b/g,
      severity: 'medium',
      label: 'Passport'
    },
    voter_id: {
      regex: /\b[A-Z]{3}[0-9]{7}\b/g,
      severity: 'medium',
      label: 'Voter ID'
    },
    
    // UNIVERSAL PII
    email: {
      regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
      severity: 'medium',
      label: 'Email Address'
    },
    credit_card: {
      regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
      severity: 'high',
      label: 'Credit Card Number'
    },
    dob: {
      regex: /\b(?:0[1-9]|[12]\d|3[01])[\/\-](?:0[1-9]|1[0-2])[\/\-](?:19|20)\d{2}\b/g,
      severity: 'medium',
      label: 'Date of Birth'
    },
    ssn: {
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
      severity: 'high',
      label: 'Social Security Number'
    }
  };

  function maskValue(value, type) {
    if (!value) return 'REDACTED';
    if (type === 'aadhaar') {
      return 'XXXX XXXX ' + value.replace(/\s/g, '').slice(-4);
    }
    if (type === 'pan') {
      return 'XXXXX' + value.slice(-5);
    }
    if (type === 'credit_card') {
      return 'XXXX XXXX XXXX ' + value.replace(/[\s-]/g, '').slice(-4);
    }
    if (type === 'email') {
      const parts = value.split('@');
      if (parts.length === 2) {
        return parts[0][0] + '***@' + parts[1];
      }
    }
    if (type === 'indian_phone' || type === 'phone') {
      return 'XXXXXX' + value.slice(-4);
    }
    if (type === 'password') {
      return '••••••••';
    }
    return 'REDACTED';
  }

  function detectPII(textContent, domElements) {
    const piiItems = [];
    const seenMap = new Map(); // to deduplicate, keyed by type + value

    function addPII(item) {
      // Key includes element location/id so distinct fields on the page (profile vs form vs table) each get their own box!
      const posKey = item.position ? `${item.position.x},${item.position.y}` : (item.elementId || 'no-pos');
      const key = `${item.type}:${(item.value || '').toLowerCase()}:${posKey}`;
      
      const ocrKey = `${item.type}:${(item.value || '').toLowerCase()}:no-pos`;
      if (item.source === 'dom' && seenMap.has(ocrKey)) {
        const existingOcr = seenMap.get(ocrKey);
        existingOcr.position = item.position;
        existingOcr.source = 'dom';
        existingOcr.elementId = item.elementId;
        existingOcr.selector = item.selector;
        return;
      }

      if (!seenMap.has(key)) {
        seenMap.set(key, item);
        piiItems.push(item);
      }
    }

    // 1. Scan text content from OCR
    if (textContent) {
      // Regex based patterns
      for (const [type, config] of Object.entries(PII_PATTERNS)) {
        const matches = textContent.matchAll(config.regex);
        for (const match of matches) {
          addPII({
            type: type,
            label: config.label,
            value: match[0],
            maskedValue: maskValue(match[0], type),
            confidence: 0.9,
            severity: config.severity,
            source: 'ocr',
            position: null
          });
        }
      }

      // Heuristic based patterns for OCR text
      // Full Name
      const nameRegex = /\b(?:Name|Full Name)\s*[:\-]?\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
      for (const match of textContent.matchAll(nameRegex)) {
        addPII({
          type: 'full_name',
          label: 'Full Name',
          value: match[1],
          maskedValue: maskValue(match[1], 'full_name'),
          confidence: 0.8,
          severity: 'low',
          source: 'ocr',
          position: null
        });
      }
      
      // Password
      const pwdRegex = /\b(?:Password|PIN|OTP)\s*[:\-]?\s*([^\s]{4,})\b/g;
      for (const match of textContent.matchAll(pwdRegex)) {
        addPII({
          type: 'password',
          label: 'Password/PIN',
          value: match[1],
          maskedValue: '••••••••',
          confidence: 0.7,
          severity: 'high',
          source: 'ocr',
          position: null
        });
      }

      // Address
      const addrRegex = /\b(?:Address)\s*[:\-]?\s*(.{10,100}?)(?:\n|$)/gi;
      for (const match of textContent.matchAll(addrRegex)) {
        addPII({
          type: 'address',
          label: 'Address',
          value: match[1].trim(),
          maskedValue: 'REDACTED',
          confidence: 0.7,
          severity: 'low',
          source: 'ocr',
          position: null
        });
      }
    }

    // 2. Scan DOM elements
    if (domElements) {
      domElements.forEach(elem => {
        const valueToScan = (elem.value || elem.text || '').trim();
        if (!valueToScan) return;

        const elemId = elem.originalId || elem.id || null;
        const elemSelector = elem.originalId ? '#' + elem.originalId : null;

        // Check if input is a password field
        if (elem.type === 'input' && elem.inputType === 'password') {
          addPII({
            type: 'password',
            label: 'Password Field',
            value: elem.value || 'hidden_password',
            maskedValue: '••••••••',
            confidence: 1.0,
            severity: 'high',
            source: 'dom',
            position: elem.position,
            elementId: elemId,
            selector: elemSelector
          });
          return;
        }

        const nameIdStr = ((elem.name || '') + ' ' + (elem.originalId || '') + ' ' + (elem.placeholder || '') + ' ' + (elem.attributes?.autocomplete || '')).toLowerCase();

        // Check input hints
        const piiHints = {
          'aadhaar': 'aadhaar', 'aadhar': 'aadhaar',
          'pan': 'pan', 'phone': 'indian_phone', 'mobile': 'indian_phone',
          'email': 'email', 'mail': 'email',
          'dob': 'dob', 'birth': 'dob',
          'ssn': 'ssn', 'card': 'credit_card', 'password': 'password', 'pin': 'password', 'otp': 'password',
          'name': 'full_name', 'address': 'address'
        };

        let foundHint = null;
        for (const [hint, piiType] of Object.entries(piiHints)) {
          if (nameIdStr.includes(hint)) {
            foundHint = piiType;
            break;
          }
        }

        if (foundHint && valueToScan) {
           addPII({
             type: foundHint,
             label: PII_PATTERNS[foundHint]?.label || foundHint.replace('_', ' '),
             value: valueToScan,
             maskedValue: maskValue(valueToScan, foundHint),
             confidence: 0.9,
             severity: PII_PATTERNS[foundHint]?.severity || (['password', 'ssn', 'aadhaar', 'pan', 'credit_card'].includes(foundHint) ? 'high' : (['full_name', 'address'].includes(foundHint) ? 'low' : 'medium')),
             source: 'dom',
             position: elem.position,
             elementId: elemId,
             selector: elemSelector
           });
        } else {
           // Scan visible text or input value for regex patterns
           for (const [type, config] of Object.entries(PII_PATTERNS)) {
             const matches = valueToScan.matchAll(config.regex);
             for (const match of matches) {
               addPII({
                 type: type,
                 label: config.label,
                 value: match[0],
                 maskedValue: maskValue(match[0], type),
                 confidence: 0.85,
                 severity: config.severity,
                 source: 'dom',
                 position: elem.position,
                 elementId: elemId,
                 selector: elemSelector
               });
             }
           }
        }
      });
    }

    return piiItems;
  }

  return {
    detectPII,
    PII_PATTERNS
  };
})();
