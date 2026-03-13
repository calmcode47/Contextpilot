async function getActiveTabIdFallback() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0].id : null;
}

async function ensureSessionForTab(tabId) {
  if (typeof tabId !== 'number') return null;
  const key = `session_${tabId}`;
  const existing = await chrome.storage.session.get(key);
  if (existing && existing[key]) {
    return existing[key];
  }
  const sessionId = crypto.randomUUID();
  await chrome.storage.session.set({ [key]: sessionId });
  return sessionId;
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
    }
    console.log('[ContextPilot] Extension installed/updated');
  } catch (e) {}
});

chrome.action.onClicked.addListener((tab) => {
  try {
    if (chrome.sidePanel?.open) {
      chrome.sidePanel.open({ tabId: tab.id });
    } else if (chrome.sidePanel?.setOptions) {
      chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
    }
  } catch (e) {}
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tabId = activeInfo?.tabId;
    const sessionId = await ensureSessionForTab(tabId);
    if (sessionId) {
      console.log(`[BACKGROUND] Tab activated: ${tabId} — sessionId: ${sessionId}`);
    }
  } catch (e) {}
});

chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    const tabId = tab?.id;
    const sessionId = await ensureSessionForTab(tabId);
    if (sessionId) {
      console.log(`[BACKGROUND] Tab created: ${tabId} — sessionId: ${sessionId}`);
    }
  } catch (e) {}
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const key = `session_${tabId}`;
    await chrome.storage.session.remove(key);
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === 'PING') {
        sendResponse({ ok: true });
        return;
      }
      if (msg && msg.type === 'GET_SESSION_ID') {
        let tabId = sender?.tab?.id ?? null;
        if (tabId === null || tabId === undefined) {
          tabId = await getActiveTabIdFallback();
        }
        if (typeof tabId !== 'number') {
          sendResponse({ ok: false, error: 'No active tab found' });
          return;
        }
        const key = `session_${tabId}`;
        const data = await chrome.storage.session.get(key);
        let sessionId = data?.[key];
        if (!sessionId) {
          sessionId = await ensureSessionForTab(tabId);
        }
        sendResponse({ ok: true, sessionId, tabId });
        return;
      }
      if (msg && msg.type === 'LOG') {
        console.log('[SIDE PANEL LOG]', msg?.data ?? null);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
