// extension/utils/dom-reader.js

window.DOMReader = (function() {

  function getElementRole(el) {
    const roleAttr = el.getAttribute('role');
    if (roleAttr) return roleAttr;
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a': return el.href ? 'link' : 'generic';
      case 'button': return 'button';
      case 'input':
        const type = el.type || 'text';
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'password') return 'password';
        return 'textbox';
      case 'textarea': return 'textbox';
      case 'select': return 'combobox';
      case 'img': return 'image';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'p': return 'paragraph';
      case 'ul': case 'ol': return 'list';
      case 'li': return 'listitem';
      default: return 'generic';
    }
  }

  function getAccessibleName(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl) return labelEl.innerText;
    }
    if (el.tagName.toLowerCase() === 'img') return el.getAttribute('alt') || '';
    if (el.tagName.toLowerCase() === 'input' && el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.innerText;
    }
    if (['input', 'textarea'].includes(el.tagName.toLowerCase())) {
      return el.placeholder || el.name || '';
    }
    return el.innerText || el.textContent || '';
  }

  function getElementState(el) {
    const state = [];
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') state.push('disabled');
    if (el.checked || el.getAttribute('aria-checked') === 'true') state.push('checked');
    if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') state.push('required');
    if (document.activeElement === el) state.push('focused');
    return state.join(', ') || null;
  }
  function isElementVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 &&
           rect.left < window.innerWidth && rect.right > 0;
  }

  function isInteractable(el) {
    const tag = el.tagName.toLowerCase();
    return ['a', 'button', 'input', 'textarea', 'select'].includes(tag) ||
           el.getAttribute('role') === 'button' ||
           el.onclick !== null ||
           el.getAttribute('tabindex') !== null;
  }

  function getLayoutZone(rect, viewport) {
    const yCenter = rect.y + rect.height / 2;
    const xCenter = rect.x + rect.width / 2;
    
    if (yCenter < viewport.height * 0.15) return 'header';
    if (yCenter > viewport.height * 0.85) return 'footer';
    if (xCenter < viewport.width * 0.25) return 'sidebar-left';
    if (xCenter > viewport.width * 0.75) return 'sidebar-right';
    return 'main content';
  }

  function generateSummary(elements) {
    const counts = {
      button: 0,
      link: 0,
      input: 0,
      image: 0,
      text: 0
    };
    
    const zones = {
      header: 0,
      'main content': 0,
      footer: 0,
      sidebar: 0
    };

    const formLabels = [];

    elements.forEach(el => {
      // Classify type
      if (el.type === 'a' || el.attributes?.href) counts.link++;
      else if (el.type === 'button') counts.button++;
      else if (['input', 'textarea', 'select'].includes(el.type)) {
        counts.input++;
        if (el.type === 'input') {
          const label = el.name || el.placeholder || el.inputType || 'field';
          if (!formLabels.includes(label)) {
            formLabels.push(label);
          }
        }
      }
      else if (el.type === 'img') counts.image++;
      else counts.text++;

      // Classify zone
      if (el.zone === 'header') zones.header++;
      else if (el.zone === 'footer') zones.footer++;
      else if (el.zone.startsWith('sidebar')) zones.sidebar++;
      else zones['main content']++;
    });

    let summary = `The page has `;
    const parts = [];

    if (counts.input > 0) {
      const fieldList = formLabels.slice(0, 3).join(', ');
      parts.push(`a form with ${counts.input} fields (${fieldList})`);
    }
    if (counts.button > 0) parts.push(`${counts.button} buttons`);
    if (counts.link > 0) parts.push(`a navigation bar or links with ${counts.link} items`);
    if (counts.image > 0) parts.push(`${counts.image} images`);
    
    summary += parts.length > 0 ? parts.join(', and ') + '.' : 'text content.';

    return summary;
  }

  function readDOM() {
    try {
      const elements = [];
      const selectors = [
        'input', 'textarea', 'select', 'button', 'a',
        'span', 'td', 'p', 'label', 'img',
        '.detail-value', '.highlight-pii',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '[role="button"]', '[role="link"]', '[onclick]'
      ];

      let idCounter = 0;
      const viewport = { width: window.innerWidth, height: window.innerHeight };

      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!isElementVisible(el)) return;
          if (idCounter >= 250) return; // Limit to top 250 elements

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const tag = el.tagName.toLowerCase();
          
          let textContent = '';
          if (tag === 'img') {
             textContent = el.alt || '';
          } else {
             textContent = (el.innerText || el.textContent || '').trim().substring(0, 200);
          }

          let rawName = getAccessibleName(el).trim();
          const sanitizedName = window.ManifestBuilder ? window.ManifestBuilder.sanitizeString(rawName) : rawName;
          
          const elemData = {
            id: `ps-elem-${idCounter++}`,
            originalId: el.id || null,
            type: tag,
            role: getElementRole(el),
            accessibleName: sanitizedName,
            state: getElementState(el),
            inputType: el.type || null,
            text: textContent,
            value: el.value || null,
            placeholder: el.placeholder || null,
            name: el.name || null,
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            attributes: {
              href: el.href || null,
              src: el.src || null,
              alt: el.alt || null,
              autocomplete: el.autocomplete || null,
              'aria-label': el.getAttribute('aria-label') || null
            },
            isVisible: true,
            isInteractable: isInteractable(el),
            zone: getLayoutZone(rect, viewport)
          };

          elements.push(elemData);
        });
      });

      return {
        url: window.location.href,
        title: document.title,
        viewport: viewport,
        elements: elements,
        summary: generateSummary(elements)
      };
    } catch (error) {
      console.error('[PrivacyShield DOMReader] Error reading DOM:', error);
      return {
        url: window.location.href,
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        elements: [],
        summary: "Error reading DOM structure."
      };
    }
  }

  function scrapeTables(targetSelector) {
    try {
      let tables = [];
      if (targetSelector) {
        try {
          const el = document.querySelector(targetSelector);
          if (el) {
            const table = el.tagName.toLowerCase() === 'table' ? el : el.closest('table');
            if (table) tables.push(table);
          }
        } catch (e) {}
      }

      if (tables.length === 0) {
        tables = Array.from(document.querySelectorAll('table'));
      }

      const scrapedTables = [];

      tables.forEach((table, idx) => {
        const captionEl = table.querySelector('caption');
        const caption = captionEl ? captionEl.textContent.trim() : `Table ${idx + 1}`;

        // Get headers
        const headerEls = table.querySelectorAll('th');
        let headers = Array.from(headerEls).map(th => th.textContent.trim());

        // Get rows
        const rowEls = Array.from(table.querySelectorAll('tr'));
        let rows = [];

        rowEls.forEach((tr, rIdx) => {
          const cellEls = tr.querySelectorAll('td, th');
          if (cellEls.length === 0) return;
          const rowData = Array.from(cellEls).map(cell => cell.textContent.trim());

          if (headers.length === 0 && rIdx === 0) {
            headers = rowData;
          } else {
            rows.push(rowData);
          }
        });

        if (headers.length === 0 && rows.length > 0) {
          headers = rows[0].map((_, cIdx) => `Column ${cIdx + 1}`);
        }

        // Map into object array
        const dataObjects = rows.map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h || `Col_${i+1}`] = row[i] !== undefined ? row[i] : '';
          });
          return obj;
        });

        scrapedTables.push({
          id: table.id || `table-${idx + 1}`,
          caption: caption,
          headers: headers,
          rowCount: rows.length,
          rows: rows,
          data: dataObjects
        });
      });

      return {
        success: true,
        count: scrapedTables.length,
        tables: scrapedTables
      };
    } catch (err) {
      console.error('[PrivacyShield DOMReader] Table scrape error:', err);
      return { success: false, count: 0, tables: [], error: err.message };
    }
  }

  return {
    readDOM,
    scrapeTables
  };

})();

