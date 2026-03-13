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
    const content = extractCleanText();
    const payloadContent =
      content && content.trim().length >= 50
        ? content
        : 'Page content could not be extracted. This may be a special browser page, a PDF, or a page that requires login.';
    return {
      url,
      title,
      pageType: detectPageType(url),
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message && message.type === 'GET_PAGE_CONTENT') {
      const data = extractPageContent();
      sendResponse({ success: true, data });
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
