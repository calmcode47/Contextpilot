function detectPageType(url) {
  try {
    const u = String(url || '').toLowerCase();
    if (u.includes('mail.google.com')) return 'gmail';
    if (/linkedin\.com\/in\//.test(u)) return 'linkedin_profile';
    if (/linkedin\.com\/jobs/.test(u)) return 'linkedin_job';
    if (u.includes('github.com')) return 'github';
    if (/(^|\.)(medium\.com|dev\.to|substack\.com|bbc\.|nytimes\.|theguardian\.)/i.test(u)) return 'news';
    if (/(indeed\.com|naukri\.com|greenhouse\.io|lever\.co|wellfound\.com)/i.test(u)) return 'jobboard';
    if (/(docs\.google\.com|notion\.so|confluence)/i.test(u)) return 'docs';
    return 'generic';
  } catch {
    return 'generic';
  }
}

function getPlatformDetector(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('mail.google.com')) {
    return {
      platform: 'gmail',
      triggerSelectors: ['[data-message-id]', '.a3s.aiL', '[role="listitem"]', 'div.gs'],
      debounceMs: 600,
      minContentLength: 50
    };
  }
  if (u.includes('linkedin.com')) {
    return {
      platform: 'linkedin',
      triggerSelectors: [
        '.pv-profile-section',
        '.scaffold-layout__main',
        '.jobs-description',
        '.artdeco-card',
        'h1.text-heading-xlarge'
      ],
      debounceMs: 1000,
      minContentLength: 100
    };
  }
  return { platform: 'generic', triggerSelectors: null, debounceMs: 1200, minContentLength: 30 };
}

function pickMainElement() {
  const candidates = [];
  const byTag = Array.from(document.querySelectorAll('article, main'));
  candidates.push(...byTag);
  const byRole = document.querySelector('[role="main"]');
  if (byRole) candidates.push(byRole);
  const idHints = Array.from(
    document.querySelectorAll('[id*="content"],[id*="main"],[id*="article"]')
  );
  candidates.push(...idHints);
  const seen = new Set();
  const unique = candidates.filter((el) => {
    if (!el) return false;
    const key = el.tagName + ':' + el.className + ':' + el.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length > 0) return unique[0];
  return document.body || document.documentElement;
}

function removeNoise(root) {
  const tags = ['script', 'style', 'noscript', 'nav', 'header', 'footer'];
  tags.forEach((t) => {
    root.querySelectorAll(t).forEach((n) => n.remove());
  });
  const noiseSelectors = [
    '[class*="nav"]',
    '[id*="nav"]',
    '[class*="menu"]',
    '[id*="menu"]',
    '[class*="sidebar"]',
    '[id*="sidebar"]',
    '[class*="footer"]',
    '[id*="footer"]',
    '[class*="header"]',
    '[id*="header"]',
    '[class*="cookie"]',
    '[id*="cookie"]',
    '[class*="banner"]',
    '[id*="banner"]',
    '[class*="ad"]',
    '[id*="ad"]',
    '[class*="popup"]',
    '[id*="popup"]',
    '[aria-hidden="true"]'
  ];
  noiseSelectors.forEach((sel) => {
    root.querySelectorAll(sel).forEach((n) => n.remove());
  });
}

function cleanAndTruncate(text, limit) {
  let t = String(text || '');
  t = t.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  t = t.replace(/[ \t]{2,}/g, ' ').trim();
  if (typeof limit === 'number' && limit > 0 && t.length > limit) {
    let cut = t.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 0 && lastSpace > limit - 80) {
      cut = cut.slice(0, lastSpace);
    }
    t = `${cut}\n[Content truncated — showing first ${limit} characters]`;
  }
  return t;
}

function extractCleanText() {
  try {
    const main = pickMainElement();
    const clone = main.cloneNode(true);
    removeNoise(clone);
    let text = '';
    try {
      text = clone.innerText || '';
      if (!text || text.trim().length === 0) {
        text = clone.textContent || '';
      }
    } catch {
      text = clone.textContent || '';
    }
    const cleaned = cleanAndTruncate(text, 8000);
    return cleaned;
  } catch {
    return '';
  }
}

function extractGmailContent() {
  try {
    const emailBody = document.querySelector('.a3s.aiL, [data-message-id] .a3s');
    if (emailBody) {
      const txt = String(emailBody.innerText || '').trim();
      if (txt.length > 50) {
        const subjectEl = document.querySelector('h2.hP');
        const subject = (subjectEl && subjectEl.innerText) || document.title || 'Email Thread';
        return {
          type: 'email_thread',
          content: cleanAndTruncate(txt, 8000),
          subject
        };
      }
    }
    const threadList = document.querySelector('[role="main"] table');
    if (threadList) {
      const listTxt = String(threadList.innerText || '').trim();
      if (listTxt.length > 0) {
        return {
          type: 'inbox_list',
          content: cleanAndTruncate(listTxt, 4000),
          subject: 'Gmail Inbox'
        };
      }
    }
  } catch {}
  return null;
}

function extractPageContent() {
  try {
    const url = window.location.href;
    let title = document.title || '';
    if (!title || title.trim().length === 0) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    const pageType = detectPageType(url);
    let content = '';
    if (pageType === 'gmail') {
      const g = extractGmailContent();
      if (g) {
        content = g.content;
        if (g.type === 'email_thread' && g.subject) {
          title = g.subject;
        }
      }
    }
    if (!content) {
      content = extractCleanText();
    }
    const payloadContent =
      content && content.trim().length >= 50
        ? content
        : 'Page content could not be extracted. This may be a special browser page, a PDF, or a page that requires login.';
    return {
      url,
      title,
      pageType,
      content: payloadContent,
      extractedAt: new Date().toISOString()
    };
  } catch {
    return {
      url: window.location.href,
      title: document.title || '',
      pageType: 'generic',
      content:
        'Page content could not be extracted. This may be a special browser page, a PDF, or a page that requires login.',
      extractedAt: new Date().toISOString()
    };
  }
}

// SPA handling: track URL changes and significant content mutations
let lastUrl = window.location.href;
let lastExtractedContent = null;
let contentRefreshTimeout = null;
let currentDetector = getPlatformDetector(window.location.href);

const urlObserver = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    currentDetector = getPlatformDetector(currentUrl);
    clearTimeout(contentRefreshTimeout);
    contentRefreshTimeout = setTimeout(() => {
      lastExtractedContent = extractPageContent();
      try {
        console.log('[ContextPilot Content] URL changed — content refreshed:', lastExtractedContent.pageType);
      } catch {}
    }, currentDetector.debounceMs);
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

const contentObserver = new MutationObserver((mutations) => {
  let shouldRefresh = false;
  if (currentDetector.triggerSelectors) {
    shouldRefresh = mutations.some((mutation) => {
      const addedNodes = Array.from(mutation.addedNodes || []);
      const hasTargetNode = addedNodes.some((node) => {
        if (!node || node.nodeType !== 1) return false;
        return currentDetector.triggerSelectors.some((sel) => {
          try {
            return node.matches?.(sel) || node.querySelector?.(sel);
          } catch {
            return false;
          }
        });
      });
      if (hasTargetNode) return true;
      return currentDetector.triggerSelectors.some((sel) => {
        try {
          return mutation.target?.matches?.(sel);
        } catch {
          return false;
        }
      });
    });
  } else {
    shouldRefresh = mutations.some((m) => (m.addedNodes ? m.addedNodes.length : 0) > 5);
  }
  if (shouldRefresh) {
    clearTimeout(contentRefreshTimeout);
    contentRefreshTimeout = setTimeout(() => {
      const newContent = extractPageContent();
      const isMeaningfullyDifferent =
        (!lastExtractedContent || newContent.content !== lastExtractedContent.content) &&
        newContent.content.length >= currentDetector.minContentLength;
      if (isMeaningfullyDifferent) {
        lastExtractedContent = newContent;
        chrome.runtime.sendMessage({ type: 'PAGE_CONTENT_UPDATED', data: newContent }).catch(() => {});
      }
    }, currentDetector.debounceMs);
  }
});
const mainContent = document.querySelector('main, [role="main"], #main, body');
if (mainContent) {
  contentObserver.observe(mainContent, { childList: true, subtree: true });
}

function scanFormFields() {
  const fields = [];
  const fieldSelectors =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select';
  const allFields = document.querySelectorAll(fieldSelectors);
  allFields.forEach((field, index) => {
    if (!field.offsetParent && field.type !== 'hidden') return;
    const descriptor = {
      selector: generateSelector(field, index),
      fieldType: getFieldType(field),
      label: extractFieldLabel(field),
      placeholder: field.placeholder || null,
      name: field.name || field.id || null,
      required: field.required || field.getAttribute('aria-required') === 'true',
      options: getFieldOptions(field),
      currentValue: field.value || null,
      ariaLabel: field.getAttribute('aria-label') || null
    };
    if (descriptor.label || descriptor.placeholder || descriptor.name || descriptor.ariaLabel) {
      fields.push(descriptor);
    }
  });
  try {
    console.log('[ContextPilot Content] Scanned', fields.length, 'form fields');
  } catch {}
  return fields;
}

function generateSelector(element, fallbackIndex) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.name) return `[name="${CSS.escape(element.name)}"]`;
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;
  const dataParams = element.getAttribute('data-params');
  if (dataParams) return `[data-params="${CSS.escape(dataParams)}"]`;
  if (element.placeholder) return `[placeholder="${CSS.escape(element.placeholder)}"]`;
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent) {
    const siblings = parent.querySelectorAll(tag);
    const idx = Array.from(siblings).indexOf(element);
    return `${tag}:nth-of-type(${idx + 1})`;
  }
  return `${element.tagName.toLowerCase()}:nth-child(${(fallbackIndex || 0) + 1})`;
}

function extractFieldLabel(field) {
  if (field.id) {
    const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
    if (label) return label.textContent.trim().replace(/\s+/g, ' ').replace(/\*$/, '').trim();
  }
  const ariaLabel = field.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  const labelledBy = field.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent.trim();
  }
  const wrappingLabel = field.closest('label');
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach((el) => el.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ');
  }
  const parent = field.parentElement;
  if (parent) {
    const prevSibling = parent.previousElementSibling;
    if (prevSibling) return prevSibling.textContent.trim().substring(0, 100);
  }
  const googleFormQuestion = field
    .closest('[role="listitem"]')
    ?.querySelector('[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle');
  if (googleFormQuestion) return googleFormQuestion.textContent.trim();
  return field.name || field.id || field.placeholder || null;
}

function getFieldType(field) {
  const tag = field.tagName.toLowerCase();
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  const type = (field.type || 'text').toLowerCase();
  return type;
}

function getFieldOptions(field) {
  if (field.tagName.toLowerCase() === 'select') {
    return Array.from(field.options).map((o) => ({
      value: o.value,
      text: o.textContent.trim()
    }));
  }
  if (field.type === 'radio') {
    const name = field.name;
    if (name) {
      return Array.from(
        document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
      ).map((r) => ({
        value: r.value,
        label: extractFieldLabel(r) || r.value
      }));
    }
  }
  return [];
}

function fillFormField(selector, value, fieldType) {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      const byLabel = findFieldByLabel(selector);
      if (!byLabel) {
        return { success: false, message: `Field not found: ${selector}` };
      }
      return fillFormField(byLabel, value, fieldType);
    }
    switch (fieldType) {
      case 'select':
        return fillSelectField(element, value);
      case 'radio':
        return fillRadioField(element.name || selector, value);
      case 'checkbox':
        return fillCheckboxField(element, value);
      case 'date':
        return fillDateField(element, value);
      default:
        return fillTextField(element, value);
    }
  } catch (err) {
    return { success: false, message: `Error filling field: ${err.message}` };
  }
}

function fillTextField(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  try {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  } catch {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  return { success: true, message: `Filled: ${value}` };
}

function fillSelectField(element, value) {
  const valueLower = String(value || '').toLowerCase().trim();
  for (const option of element.options) {
    if (String(option.value || '').toLowerCase() === valueLower) {
      element.value = option.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, message: `Selected: ${option.text}` };
    }
  }
  for (const option of element.options) {
    const txt = String(option.text || '').toLowerCase();
    if (txt.includes(valueLower) || valueLower.includes(txt)) {
      element.value = option.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, message: `Selected (text match): ${option.text}` };
    }
  }
  return { success: false, message: `No matching option for "${value}" in dropdown` };
}

function fillRadioField(fieldNameOrSelector, value) {
  const valueLower = String(value || '').toLowerCase().trim();
  const radios = document.querySelectorAll(
    `input[type="radio"][name="${CSS.escape(fieldNameOrSelector)}"]`
  );
  if (!radios.length) return { success: false, message: 'Radio group not found' };
  for (const radio of radios) {
    const radioLabel = extractFieldLabel(radio) || radio.value;
    if (
      String(radio.value || '').toLowerCase() === valueLower ||
      String(radioLabel || '').toLowerCase().includes(valueLower) ||
      valueLower.includes(String(radio.value || '').toLowerCase())
    ) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, message: `Selected radio: ${radio.value}` };
    }
  }
  return { success: false, message: `No radio option matches "${value}"` };
}

function fillCheckboxField(element, value) {
  const shouldCheck = ['true', 'yes', '1', 'checked', 'on'].includes(String(value).toLowerCase());
  if (element.checked !== shouldCheck) {
    element.click();
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { success: true, message: `Checkbox ${shouldCheck ? 'checked' : 'unchecked'}` };
}

function fillDateField(element, value) {
  let normalized = String(value || '');
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        normalized = `${parts[2]}-${String(parts[0]).padStart(2, '0')}-${String(parts[1]).padStart(
          2,
          '0'
        )}`;
      }
    }
  }
  return fillTextField(element, normalized);
}

function findFieldByLabel(labelText) {
  const allFields = document.querySelectorAll('input, textarea, select');
  const needle = String(labelText || '').toLowerCase();
  for (const field of allFields) {
    const label = extractFieldLabel(field);
    if (label && String(label).toLowerCase().includes(needle)) {
      return generateSelector(field, 0);
    }
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message && message.type === 'GET_PAGE_CONTENT') {
      lastExtractedContent = extractPageContent();
      sendResponse({ success: true, data: lastExtractedContent });
      return true;
    }
    if (message && message.type === 'GET_PAGE_CONTEXT') {
      const data = extractPageContent();
      sendResponse({
        title: data.title,
        url: data.url,
        content: data.content,
        pageType: data.pageType
      });
      return true;
    }
    if (message && message.type === 'SCAN_FORM_FIELDS') {
      const fields = scanFormFields();
      sendResponse({ success: true, fields, count: fields.length });
      return true;
    }
    if (message && message.type === 'FILL_FORM_FIELDS') {
      (async () => {
        const fillInstructions = Array.isArray(message.fillInstructions)
          ? message.fillInstructions
          : [];
        const results = [];
        for (const instruction of fillInstructions) {
          if (instruction.skip) {
            results.push({
              selector: instruction.selector,
              success: false,
              skipped: true
            });
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, 80));
          const result = fillFormField(
            instruction.selector,
            instruction.value,
            instruction.fieldType
          );
          results.push({
            selector: instruction.selector,
            fieldLabel: instruction.fieldLabel,
            value: instruction.value,
            ...result
          });
          try {
            console.log(
              '[ContextPilot Fill]',
              result.success ? '✅' : '❌',
              instruction.fieldLabel || instruction.selector,
              '→',
              instruction.value
            );
          } catch {}
        }
        const successCount = results.filter((r) => r.success).length;
        sendResponse({
          success: true,
          results,
          summary: `Filled ${successCount}/${fillInstructions.length} fields`
        });
      })();
      return true;
    }
  } catch (e) {
    try {
      sendResponse({ success: false, error: String(e && e.message ? e.message : e) });
    } catch {}
    return true;
  }
  return true;
});
