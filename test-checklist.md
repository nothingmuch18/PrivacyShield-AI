# PrivacyShield AI Testing Checklist

## MANUAL TESTING CHECKLIST

- [ ] Extension loads without errors in Chrome
- [ ] Popup appears and toggle works
- [ ] Side panel opens and shows dashboard
- [ ] Screen capture works (check console logs)
- [ ] Face detection model loads (check "Model Ready" status)
- [ ] Face detection boxes appear on the demo page's profile photos
- [ ] OCR extracts text from the page
- [ ] PII detector finds: Aadhaar, PAN, phone, email on demo page
- [ ] Redaction engine blurs faces in the screenshot
- [ ] Redaction engine masks PII text in the screenshot
- [ ] Before/After preview shows in side panel
- [ ] Server connection establishes (green dot)
- [ ] Server receives redacted screenshot (check server logs)
- [ ] Server returns an action command
- [ ] Extension executes the action (e.g., clicks a button)
- [ ] Floating badge shows "X items protected"
- [ ] Side panel shows performance metrics
- [ ] Detection feed updates in real-time
- [ ] Extension works when toggled OFF then ON again
- [ ] Extension works after browser restart
- [ ] Extension works on different websites (not just demo page)

## PERFORMANCE TESTING

- [ ] Total cycle time < 2 seconds
- [ ] Memory usage < 300MB
- [ ] No browser tab crashes after 5 minutes of continuous use
- [ ] Face detection accuracy: detects both faces on demo page
- [ ] PII detection: finds all 6+ PII items on demo page (Aadhaar, PAN, phone, email, DOB, address)
