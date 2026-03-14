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
  } catch (e) {
    try {
      sendResponse({ success: false, error: String(e && e.message ? e.message : e) });
    } catch {}
    return true;
  }
  return true;
});
