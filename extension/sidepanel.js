const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const pageBadge = document.getElementById('pageBadge');
const emptyState = document.getElementById('emptyState');
const emptyPageType = document.getElementById('emptyPageType');
const typingEl = document.getElementById('typing');
const presetsEl = document.getElementById('presets');
const charHint = document.getElementById('charHint');
const gearBtn = document.querySelector('.cp-gear');

const state = {
  sessionId: null,
  userId: null,
  pageContext: null,
  messages: [],
  isLoading: false,
  currentPageType: 'generic',
  sessionTokens: 0,
  lastResponseMs: 0,
  debugMode: false,
  lastApiRequest: null,
  lastApiResponse: null,
  lastResponseTimeMs: null,
  errorLog: [],
  totalTokensThisSession: 0
};

let profilePanelOpen = false;
let cachedProfile = null;

const PRESET_COMMANDS = {
  gmail: [
    { label: '✉️ Draft Reply', message: 'Draft a professional reply to this email thread' },
    { label: '📋 Summarize Thread', message: 'Summarize this email thread in bullet points' },
    { label: '✅ Action Items', message: 'Extract all action items and deadlines from this thread' }
  ],
  linkedin_profile: [
    { label: '🤝 Generate Outreach', message: 'Generate a personalized connection request for this profile' },
    { label: '📝 Summarize Profile', message: "Summarize this person's background and expertise" }
  ],
  linkedin_job: [
    { label: '📄 Cover Letter', message: 'Generate a cover letter for this job posting based on my background as a full-stack developer with experience in React, Node.js, and AI integration' },
    { label: '🔍 Analyze Role', message: 'Analyze this job posting and tell me the key requirements and red flags' }
  ],
  github: [
    { label: '📖 Explain Repo', message: 'Explain what this GitHub repository does and its tech stack' },
    { label: '🔧 Summarize Code', message: 'Summarize the main functionality of this page' }
  ],
  docs: [
    { label: '💡 Summarize Doc', message: "Summarize this document's key points" },
    { label: '❓ Explain This', message: 'Explain the main concept on this page in simple terms' }
  ],
  news: [
    { label: '📰 TL;DR', message: 'Give me a TL;DR of this article' },
    { label: '🔍 Key Facts', message: 'Extract the key facts and data points from this article' }
  ],
  jobboard: [
    { label: '📝 Auto-Fill Application', message: 'Fill this job application form with my details' }
  ],
  generic: [
    { label: '📝 Summarize', message: 'Summarize the main content of this page' },
    { label: '❓ Explain', message: 'Explain what this page is about' },
    { label: '💬 Ask', message: 'What can you help me with on this page?' },
    { label: '📋 Fill This Form', message: 'Fill this form for me using my saved details' },
    { label: '💾 Save My Details', action: 'save_details_prompt', message: null }
  ]
};

function setLoading(v) {
  state.isLoading = v;
  sendBtn.disabled = v || !inputEl.value.trim();
  typingEl.classList.toggle('hidden', !v);
}

function markdownToHtml(md) {
  try {
    if (typeof marked !== 'undefined') {
      return marked.parse(md || '');
    }
  } catch {}
  const div = document.createElement('div');
  div.textContent = md || '';
  return div.innerHTML;
}

function formatTokens(n) {
  const x = Number(n || 0);
  if (x >= 1000) return `${(x / 1000).toFixed(1)}k`;
  return String(x);
}

function buildMetadataBar(toolsChain, iterations, usage) {
  const hasTools = Array.isArray(toolsChain) && toolsChain.length > 0;
  const hasIterations = typeof iterations === 'number' && !Number.isNaN(iterations);
  const totalTokens =
    usage && (Number(usage.inputTokens || 0) + Number(usage.outputTokens || 0));
  const hasTokens = !!totalTokens;
  if (!hasTools && !hasIterations && !hasTokens) {
    return null;
  }
  const meta = document.createElement('div');
  meta.className = 'message-metadata';
  const left = document.createElement('span');
  left.textContent = '🔧';
  meta.appendChild(left);
  if (hasTools) {
    for (let i = 0; i < toolsChain.length; i++) {
      const p = document.createElement('span');
      p.className = 'tool-pill';
      p.textContent = toolsChain[i];
      meta.appendChild(p);
      if (i < toolsChain.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'tool-arrow';
        arrow.textContent = '→';
        meta.appendChild(arrow);
      }
    }
  } else {
    const p = document.createElement('span');
    p.className = 'tool-pill';
    p.textContent = 'direct answer';
    meta.appendChild(p);
  }
  if (hasIterations) {
    const iter = document.createElement('span');
    iter.textContent = `· ${Number(iterations)} iteration${Number(iterations) === 1 ? '' : 's'}`;
    meta.appendChild(iter);
  }
  if (hasTokens) {
    const tok = document.createElement('span');
    tok.textContent = `· ${formatTokens(totalTokens)} tokens`;
    meta.appendChild(tok);
  }
  return meta;
}

/**
 * Renders a chat message bubble in the side panel.
 *
 * @param {string} role                     'user' or 'assistant'
 * @param {string} content                  Message text (markdown for assistant)
 * @param {string|null} toolUsed            Last tool used, or null for direct answers
 * @param {string|null} messageId           UUID for feedback targeting
 * @param {string[]=} toolsCalledChain      Ordered array of tools invoked
 * @param {number|null=} iterations         Agent loop iteration count
 * @param {object|null=} usage              { inputTokens, outputTokens }
 * @param {boolean=} animated               true for new messages, false for history
 */
function renderMessage(role, content, toolUsed, messageId, toolsCalledChain, iterations, usage, animated = true) {
  const safeToolsChain = Array.isArray(toolsCalledChain) ? toolsCalledChain : (toolUsed ? [toolUsed] : []);
  const safeIterations = typeof iterations === 'number' ? iterations : null;
  const safeUsage = usage && typeof usage === 'object' ? usage : null;
  const safeAnimated = typeof animated === 'boolean' ? animated : true;
  const d = document.createElement('div');
  d.className = `cp-msg ${role === 'user' ? 'cp-user' : 'cp-assistant'}${safeAnimated ? '' : ' cp-static'}`;
  if (role === 'assistant') {
    const body = document.createElement('div');
    body.className = 'markdown-body';
    body.innerHTML = markdownToHtml(content || '(no response)');
    d.appendChild(body);
    const metaEl = buildMetadataBar(safeToolsChain, safeIterations, safeUsage);
    if (metaEl) {
      d.appendChild(metaEl);
    }
    const fb = document.createElement('div');
    fb.className = 'cp-feedback';
    const up = document.createElement('button');
    up.className = 'cp-thumb';
    up.textContent = '👍';
    const down = document.createElement('button');
    down.className = 'cp-thumb';
    down.textContent = '👎';
    up.addEventListener('click', () => handleThumbsUp(messageId, up, down));
    down.addEventListener('click', () => handleThumbsDown(messageId, d, up, down));
    fb.appendChild(up);
    fb.appendChild(down);
    d.appendChild(fb);
  } else {
    d.textContent = content;
  }
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function handleThumbsUp(messageId, upBtn, downBtn) {
  try {
    upBtn.classList.add('selected-up');
    upBtn.disabled = true;
    downBtn.disabled = true;
    const result = await submitFeedback(messageId, 'positive', null);
    showToast('Thanks for the feedback! ✓');
    return result;
  } catch {
    showToast('Thanks for the feedback! ✓');
  }
}

async function handleThumbsDown(messageId, messageElement, upBtn, downBtn) {
  downBtn.classList.add('selected-down');
  if (messageElement.querySelector('.cp-correction')) {
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'cp-correction';
  const ta = document.createElement('textarea');
  ta.placeholder = 'What should I have done differently? (optional)';
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
  const actions = document.createElement('div');
  actions.className = 'actions';
  const skip = document.createElement('button');
  skip.className = 'skip';
  skip.textContent = 'Skip';
  const submit = document.createElement('button');
  submit.className = 'submit';
  submit.textContent = 'Submit Correction';
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    await submitFeedback(messageId, 'negative', ta.value.trim() || null);
    wrap.remove();
    upBtn.disabled = true;
    downBtn.disabled = true;
    showToast("Correction saved — I'll do better next time");
  });
  skip.addEventListener('click', async () => {
    await submitFeedback(messageId, 'negative', null);
    wrap.remove();
    upBtn.disabled = true;
    downBtn.disabled = true;
    showToast('Thanks — feedback recorded');
  });
  actions.appendChild(skip);
  actions.appendChild(submit);
  wrap.appendChild(ta);
  wrap.appendChild(actions);
  messageElement.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function submitFeedback(messageId, rating, correction) {
  const result = await callBackendAPI('/api/feedback', 'POST', {
    messageId,
    userId: state.userId || 'anonymous',
    rating,
    correction: correction || null
  });
  if (!result.success) {
    if (String(result.error || '').includes('409')) {
      return result;
    }
  } else if (result.data?.correctionLearned) {
    showToast("✓ I've learned from this correction and will apply it going forward");
  }
  return result;
}

function showToast(message, duration = 3000) {
  const t = document.createElement('div');
  t.className = 'cp-toast';
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, duration);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function getPagePayload() {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('No active tab');
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT', forceRefresh: true });
    if (res?.success && res.data) return res.data;
  } catch {}
  try {
    const ctx = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
    return {
      url: ctx.url,
      title: ctx.title,
      content: ctx.content,
      pageType: ctx.pageType,
      extractedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}

async function getSessionId() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION_ID' });
  if (res?.ok) return res.sessionId;
  return crypto.randomUUID();
}

function pageTypeBadge(pt) {
  switch (pt) {
    case 'gmail': return '📧 Gmail';
    case 'linkedin_profile': return '💼 LinkedIn';
    case 'linkedin_job': return '💼 LinkedIn Job';
    case 'github': return '🐙 GitHub';
    case 'news': return '📄 Article';
    case 'jobboard': return '🧳 Job Board';
    case 'docs': return '📘 Docs';
    default: return '🌐 Web';
  }
}

function renderPresetCommands(pt) {
  presetsEl.innerHTML = '';
  const items = PRESET_COMMANDS[pt] || PRESET_COMMANDS.generic;
  items.forEach((it, idx) => {
    const b = document.createElement('button');
    b.className = 'cp-pill';
    b.textContent = it.label;
    b.style.animationDelay = `${idx * 50}ms`;
    b.addEventListener('click', () => {
      if (it && it.action === 'save_details_prompt') {
        const template = 'Save my details: Name: , Email: , Phone: , College: , Year: ';
        inputEl.value = template;
        inputEl.focus();
        const cursorPos = template.indexOf('Name: ') + 6;
        inputEl.setSelectionRange(cursorPos, cursorPos);
        sendBtn.disabled = !inputEl.value.trim();
        autoResize();
        return;
      }
      sendMessage(it.message);
    });
    presetsEl.appendChild(b);
  });
}

document.getElementById('profile-icon-btn')?.addEventListener('click', openProfilePanel);
document.getElementById('profile-back-btn')?.addEventListener('click', closeProfilePanel);
document.getElementById('profile-update-btn')?.addEventListener('click', () => {
  closeProfilePanel();
  inputEl.value = 'Update my details: ';
  inputEl.focus();
  inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  sendBtn.disabled = !inputEl.value.trim();
});
document.getElementById('profile-delete-all-btn')?.addEventListener('click', async () => {
  if (confirm('Delete all your saved profile data? This cannot be undone.')) {
    await deleteAllProfileData();
  }
});

async function openProfilePanel() {
  profilePanelOpen = true;
  const panel = document.getElementById('profile-panel');
  panel.classList.remove('hidden');
  panel.classList.add('visible');
  await loadAndRenderProfile();
}

function closeProfilePanel() {
  profilePanelOpen = false;
  const panel = document.getElementById('profile-panel');
  panel.classList.remove('visible');
  panel.classList.add('hidden');
}

async function loadAndRenderProfile() {
  const userId = state.userId || 'anonymous';
  const result = await callBackendAPI(`/api/profile/${userId}`, 'GET');
  const emptyState = document.getElementById('profile-empty-state');
  const profileContent = document.getElementById('profile-content');
  const lastUpdated = document.getElementById('profile-last-updated');
  if (!result.success || !result.data?.data?.details || Object.keys(result.data.data.details).length === 0) {
    emptyState.classList.remove('hidden');
    profileContent.classList.add('hidden');
    return;
  }
  cachedProfile = result.data.data;
  emptyState.classList.add('hidden');
  profileContent.classList.remove('hidden');
  if (cachedProfile.updated_at) {
    const date = new Date(cachedProfile.updated_at);
    lastUpdated.textContent = `Last updated: ${date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })}`;
  } else {
    lastUpdated.textContent = '';
  }
  profileContent.innerHTML = renderProfileCategories(cachedProfile.details || {});
}

function renderProfileCategories(details) {
  const categoryConfig = {
    personal: { icon: '👤', label: 'Personal Info' },
    academic: { icon: '🎓', label: 'Academic Details' },
    professional: { icon: '💼', label: 'Professional Info' },
    address: { icon: '📍', label: 'Address' },
    custom: { icon: '⚙️', label: 'Custom Fields' }
  };
  let html = '';
  for (const [category, fields] of Object.entries(details || {})) {
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) continue;
    const config = categoryConfig[category] || { icon: '📋', label: category };
    const items = Object.entries(fields)
      .map(([key, value]) => {
        if (!value || (Array.isArray(value) && !value.length)) return '';
        const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
        const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        return `
           <div class="profile-field" data-category="${category}" data-key="${key}">
             <span class="profile-field-key">${displayKey}</span>
             <span class="profile-field-value">${displayValue}</span>
           </div>`;
      })
      .join('');
    if (!items) continue;
    html += `
     <div class="profile-category">
       <div class="profile-category-header">
         <span class="profile-category-icon">${config.icon}</span>
         <span class="profile-category-label">${config.label}</span>
       </div>
       <div class="profile-fields">
         ${items}
       </div>
     </div>`;
  }
  return html || '<p class="profile-no-data">No details saved yet.</p>';
}

async function deleteAllProfileData() {
  const userId = state.userId || 'anonymous';
  const result = await callBackendAPI(`/api/profile/${userId}`, 'DELETE');
  if (result.success) {
    cachedProfile = null;
    showToast('Profile data deleted.');
    await loadAndRenderProfile();
  } else {
    showToast('Failed to delete profile. Please try again.', 3000);
  }
}
function setPageBadge(pt) {
  const badgeText = pageTypeBadge(pt);
  pageBadge.textContent = badgeText;
  pageBadge.classList.remove('gmail', 'linkedin', 'github', 'news', 'jobboard', 'docs', 'generic', 'cp-badge-pulse');
  let cls = 'generic';
  if (pt === 'gmail') cls = 'gmail';
  else if (pt === 'linkedin_profile') cls = 'linkedin';
  else if (pt === 'linkedin_job') cls = 'linkedin';
  else if (pt === 'github') cls = 'github';
  else if (pt === 'news') cls = 'news';
  else if (pt === 'jobboard') cls = 'jobboard';
  else if (pt === 'docs') cls = 'docs';
  pageBadge.classList.add(cls);
  pageBadge.classList.add('cp-badge-pulse');
  setTimeout(() => pageBadge.classList.remove('cp-badge-pulse'), 650);
}

function markContentFresh() {
  try {
    pageBadge.classList.add('content-fresh');
    setTimeout(() => pageBadge.classList.remove('content-fresh'), 2000);
  } catch {}
}

async function callBackendAPI(endpoint, method, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const options = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, options);
    clearTimeout(timeoutId);
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      return { success: false, code: 429, error: `Rate limited. Please wait ${retryAfter} seconds.` };
    }
    if (response.status === 401) {
      return { success: false, code: 401, error: 'Authentication required.' };
    }
    if (response.status >= 500) {
      let errorDetail = 'Server error';
      try {
        const errBody = await response.json();
        errorDetail = errBody.details || errBody.error || errorDetail;
      } catch {}
      return { success: false, code: response.status, error: `Agent error: ${errorDetail}` };
    }
    if (!response.ok) {
      let msg = `Request failed (${response.status})`;
      try {
        const errBody = await response.json();
        const details = errBody.details || errBody.error;
        if (details) msg = `Request failed (${response.status}): ${details}`;
      } catch {}
      return { success: false, code: response.status, error: msg };
    }
    try {
      const data = await response.json();
      return { success: true, data };
    } catch {
      return { success: false, code: 0, error: 'Invalid response format from server.' };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, code: 0, error: `Request timed out after ${CONFIG.REQUEST_TIMEOUT_MS / 1000}s. The AI is taking too long — try a shorter message.` };
    }
    if (!navigator.onLine) {
      return { success: false, code: 0, error: 'No internet connection.' };
    }
    return { success: false, code: 0, error: `Network error: ${err.message}` };
  }
}

function scrollToBottom(animated = false) {
  if (!animated) {
    chatEl.scrollTop = chatEl.scrollHeight;
    return;
  }
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
}

function showHistoryLoadingSkeleton() {
  hideHistoryLoadingSkeleton();
  const sk = document.createElement('div');
  sk.className = 'cp-skeleton';
  sk.id = 'cpHistorySkeleton';
  for (let i = 0; i < 3; i++) {
    const row = document.createElement('div');
    row.className = `cp-skel-row ${i % 2 === 0 ? 'cp-skel-left' : 'cp-skel-right'}`;
    const bubble = document.createElement('div');
    bubble.className = 'cp-skel-bubble';
    row.appendChild(bubble);
    sk.appendChild(row);
  }
  chatEl.appendChild(sk);
}

function hideHistoryLoadingSkeleton() {
  const sk = document.getElementById('cpHistorySkeleton');
  if (sk) sk.remove();
}

function showEmptyState() {
  emptyPageType.textContent = pageBadge.textContent.toLowerCase();
  emptyState.classList.remove('hidden');
}

function showHistoryLoadedBadge(count) {
  showToast(`${count} messages loaded`, 2000);
}

async function loadChatHistory() {
  if (!state.sessionId) return;
  showHistoryLoadingSkeleton();
  const result = await callBackendAPI(`/api/history?sessionId=${encodeURIComponent(state.sessionId)}&limit=20`, 'GET');
  hideHistoryLoadingSkeleton();
  if (!result.success || !Array.isArray(result.data?.messages) || result.data.count === 0) {
    showEmptyState();
    return;
  }
  // Clear chat area except typing/empty state
  chatEl.querySelectorAll('.cp-msg').forEach((n) => n.remove());
  emptyState.classList.add('hidden');
  result.data.messages.forEach((msg) => {
    renderMessage(
      msg.role,
      msg.content,
      msg.tool_used || null,
      msg.id || null,
      msg.tool_used ? [msg.tool_used] : [],
      null,
      null,
      false
    );
  });
  state.messages = result.data.messages;
  scrollToBottom(false);
  showHistoryLoadedBadge(result.data.count);
}

async function initializePanel() {
  const backendOk = await checkBackendConnectivity();
  if (!backendOk) {
    showConnectionError();
    return;
  }
  try {
    state.sessionId = await getSessionId();
    state.userId = null;
    const ctx = await getPagePayload();
    if (!ctx) {
      setPageBadge('generic');
      emptyPageType.textContent = 'an unsupported page';
      sendBtn.disabled = true;
      return;
    }
    state.pageContext = {
      url: ctx.url,
      title: ctx.title,
      content: ctx.content,
      pageType: ctx.pageType
    };
    state.currentPageType = ctx.pageType || 'generic';
    setPageBadge(state.currentPageType);
    emptyPageType.textContent = pageBadge.textContent.toLowerCase();
    renderPresetCommands(state.currentPageType);
    await loadChatHistory();
    sendBtn.disabled = true;
  } catch {
    setPageBadge('generic');
  }
}

function showConnectionError() {
  emptyState.classList.add('hidden');
  chatEl.innerHTML = `
    <div class="connection-error">
      <div class="error-icon">⚠️</div>
      <div class="error-title">Backend Offline</div>
      <div class="error-detail">Cannot reach ${CONFIG.API_BASE_URL}</div>
      <div class="error-hint">Make sure the ContextPilot server is running</div>
      <button class="retry-btn">Retry Connection</button>
    </div>
  `;
  const btn = chatEl.querySelector('.retry-btn');
  btn.addEventListener('click', () => location.reload());
}
async function sendMessage(userMessage) {
  const text = String(userMessage || '').trim();
  if (!text || state.isLoading) return;
  state.isLoading = true;
  showTypingIndicator();
  state.lastSentMessage = text;
  emptyState.classList.add('hidden');
  addUserMessage(text);
  clearInput();
  try {
    if (!state.pageContext) {
      const refreshed = await getPagePayload();
      if (refreshed) {
        state.pageContext = refreshed;
        state.currentPageType = refreshed.pageType || 'generic';
        setPageBadge(state.currentPageType);
        renderPresetCommands(state.currentPageType);
      } else {
        addErrorMessage('No page content available yet. Click Retry Connection or refresh the tab, then try again.');
        return;
      }
    }
    const body = {
      message: text,
      pageContext: state.pageContext,
      sessionId: state.sessionId,
      userId: state.userId
    };
    const t0 = performance.now();
    const result = await callBackendAPI('/api/chat', 'POST', body);
    const t1 = performance.now();
    if (!result.success) {
      addErrorMessage(result.error || 'The AI agent encountered an error. Please try again.');
      const err = { time: new Date().toISOString(), error: result.error || 'error' };
      state.errorLog.unshift(err);
      state.errorLog = state.errorLog.slice(0, 5);
      updateDebugPanel();
      return;
    }
    const d = result.data || {};
    state.lastResponseTimeMs = Math.round(t1 - t0);
    state.lastApiResponse = d;
    state.totalTokensThisSession += Number((d.usage && d.usage.inputTokens) || 0) + Number((d.usage && d.usage.outputTokens) || 0);
    const assistantEntry = {
      role: 'assistant',
      content: d.response || '(no response)',
      toolUsed: d.toolUsed ?? null,
      messageId: d.messageId ?? null,
      toolsCalledChain: d.toolsCalledChain || [],
      iterations: d.iterations ?? 0,
      usage: d.usage || { inputTokens: 0, outputTokens: 0 },
      timestamp: Date.now()
    };
    state.messages.push(assistantEntry);
    const usedTokens = Number((assistantEntry.usage && assistantEntry.usage.inputTokens) || 0) + Number((assistantEntry.usage && assistantEntry.usage.outputTokens) || 0);
    state.sessionTokens += usedTokens;
    state.lastResponseMs = state.lastResponseTimeMs;
    renderMessage('assistant', assistantEntry.content, assistantEntry.toolUsed, assistantEntry.messageId, assistantEntry.toolsCalledChain, assistantEntry.iterations, assistantEntry.usage);
    try {
      if (d.fillPayload && d.fillPayload.action === 'fill_form_ready') {
        const formFields = await scanCurrentPageFormFields();
        await showFillReviewUI(d.fillPayload, formFields);
      }
    } catch (e) {
      console.warn('[SidePanel] Fill review UI initialization failed:', e?.message || e);
    }
    updateDevPanel();
    updateDebugPanel();
  } catch (unexpectedError) {
    addErrorMessage('An unexpected error occurred. Please try again.');
    console.error('[ContextPilot] Unexpected error in sendMessage:', unexpectedError);
  } finally {
    state.isLoading = false;
    hideTypingIndicator();
    scrollToBottom(true);
    focusInput();
    sendBtn.disabled = false;
  }
}

async function scanCurrentPageFormFields() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM_FIELDS' });
    return (response && response.fields) || [];
  } catch (err) {
    console.warn('[SidePanel] Could not scan form fields:', err?.message || err);
    return [];
  }
}

async function showFillReviewUI(fillPayload, scannedFields) {
  const { fillInstructions, skippedFields, stats } = fillPayload || {
    fillInstructions: [],
    skippedFields: [],
    stats: { fieldsToFill: 0, highConfidence: 0, lowConfidence: 0 }
  };
  const reviewCard = document.createElement('div');
  reviewCard.className = 'fill-review-card';
  reviewCard.id = 'fill-review-card';
  reviewCard.innerHTML = `
    <div class="fill-review-header">
      <span class="fill-review-icon">📋</span>
      <span class="fill-review-title">Ready to Fill ${stats.fieldsToFill} Fields</span>
      <span class="fill-stats">${stats.highConfidence} confirmed · ${stats.lowConfidence} to review</span>
    </div>
    <div class="fill-fields-list">
      ${fillInstructions
        .map(
          (instr) => `
        <div class="fill-field-item ${instr.confidence === 'low' ? 'fill-field-low-conf' : ''}">
          <div class="fill-field-info">
            <span class="fill-field-label">${instr.fieldLabel || instr.selector}</span>
            ${instr.confidence === 'low' ? '<span class="fill-confidence-badge">Review</span>' : ''}
          </div>
          <span class="fill-field-value">${String(instr.value || '').slice(0, 140)}</span>
        </div>`
        )
        .join('')}
      ${
        (Array.isArray(skippedFields) && skippedFields.length > 0)
          ? `
        <div class="fill-skipped-section">
          <div class="fill-skipped-label">Skipped (${skippedFields.length})</div>
          ${skippedFields
            .map(
              (f) => `
            <div class="fill-field-item fill-field-skipped">
              <span class="fill-field-label">${f.fieldLabel || f.selector}</span>
              <span class="fill-skip-reason">${f.skipReason || 'Skipped'}</span>
            </div>`
            )
            .join('')}
        </div>`
          : ''
      }
    </div>
    <div class="fill-review-actions">
      <button id="fill-confirm-btn" class="btn-fill-confirm">✅ Fill ${stats.fieldsToFill} Fields</button>
      <button id="fill-cancel-btn" class="btn-fill-cancel">Cancel</button>
    </div>
    <div class="fill-disclaimer">
      ContextPilot will fill these fields but will NOT submit the form.
      Always review before submitting.
    </div>
  `;
  chatEl.appendChild(reviewCard);
  try {
    reviewCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } catch {}
  const confirmBtn = reviewCard.querySelector('#fill-confirm-btn');
  const cancelBtn = reviewCard.querySelector('#fill-cancel-btn');
  confirmBtn?.addEventListener('click', async () => {
    await executeFillInstructions(fillPayload.fillInstructions, reviewCard);
  });
  cancelBtn?.addEventListener('click', () => {
    reviewCard.remove();
    renderMessage('assistant', 'Form fill cancelled. Your data is still saved for next time.', null, null, null, null, null, true);
  });
}

async function executeFillInstructions(fillInstructions, reviewCard) {
  const confirmBtn = document.getElementById('fill-confirm-btn');
  if (confirmBtn) {
    confirmBtn.textContent = '⏳ Filling...';
    confirmBtn.disabled = true;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM_FIELDS', fillInstructions });
    if (!response || !response.success) {
      throw new Error('Fill execution failed');
    }
    const results = Array.isArray(response.results) ? response.results : [];
    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const failedCount = results.filter((r) => !r.success && !r.skipped).length;
    reviewCard.innerHTML = `
      <div class="fill-result-header">
        <span class="fill-result-icon">${failedCount === 0 ? '✅' : '⚠️'}</span>
        <span class="fill-result-title">
          Filled ${successCount} field${successCount !== 1 ? 's' : ''}${failedCount > 0 ? ` · ${failedCount} failed` : ''}
        </span>
      </div>
      <div class="fill-result-list">
        ${results
          .map(
            (r) => `
          <div class="fill-result-item ${r.success ? 'fill-result-ok' : r.skipped ? 'fill-result-skip' : 'fill-result-fail'}">
            <span>${r.success ? '✓' : r.skipped ? '–' : '✗'}</span>
            <span class="fill-result-label">${r.fieldLabel || r.selector}</span>
            ${r.success ? `<span class="fill-result-val">${String(r.value || '').slice(0, 140)}</span>` : ''}
            ${!r.success && !r.skipped ? `<span class="fill-result-err">${r.message || 'Failed'}</span>` : ''}
          </div>`
          )
          .join('')}
      </div>
      <div class="fill-result-footer">
        ✋ Please review all filled fields before submitting.
      </div>
    `;
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'fill-feedback';
    feedbackDiv.innerHTML = `
      <span class="fill-feedback-label">Was this fill accurate?</span>
      <button class="fill-fb-yes">👍 Yes</button>
      <button class="fill-fb-no">👎 No</button>
    `;
    reviewCard.appendChild(feedbackDiv);
    const yesBtn = feedbackDiv.querySelector('.fill-fb-yes');
    const noBtn = feedbackDiv.querySelector('.fill-fb-no');
    yesBtn?.addEventListener('click', () => handleFillFeedback(true));
    noBtn?.addEventListener('click', () => handleFillFeedback(false));
    showToast(`Filled ${successCount} field${successCount !== 1 ? 's' : ''} ✅`);
  } catch (err) {
    reviewCard.innerHTML = `
      <div class="fill-error">
        <span>⚠️</span>
        <span>Could not fill the form. Make sure the form is visible on the page.</span>
        <button id="fill-dismiss-btn">Dismiss</button>
      </div>
    `;
    const dismiss = reviewCard.querySelector('#fill-dismiss-btn');
    dismiss?.addEventListener('click', () => reviewCard.remove());
    console.error('[SidePanel] Fill execution error:', err);
  }
}

function handleFillFeedback(positive) {
  try {
    const lastAssistant = [...(state.messages || [])].reverse().find((m) => m.role === 'assistant');
    const msgId = lastAssistant?.messageId || null;
    if (msgId) {
      submitFeedback(msgId, positive ? 'positive' : 'negative', positive ? null : 'Form fill inaccurate');
    }
    showToast(positive ? 'Thanks! We’ll keep doing that.' : 'Thanks — we’ll improve next time.');
  } catch {}
}

function autoResize() {
  inputEl.style.height = 'auto';
  const max = parseFloat(getComputedStyle(inputEl).lineHeight) * 4 + 8;
  inputEl.style.height = Math.min(inputEl.scrollHeight, max) + 'px';
}

sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
inputEl.addEventListener('input', () => {
  autoResize();
  sendBtn.disabled = state.isLoading || !inputEl.value.trim();
});
inputEl.addEventListener('focus', () => charHint.classList.remove('hidden'));
inputEl.addEventListener('blur', () => charHint.classList.add('hidden'));
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

(async function init() {
  await initializePanel();
})();

function ensureDevPanel() {
  let dev = document.getElementById('cp-devpanel');
  if (!dev) {
    dev = document.createElement('div');
    dev.id = 'cp-devpanel';
    dev.className = 'cp-devpanel';
    const app = document.querySelector('.cp-app');
    const composer = document.querySelector('.cp-composer');
    app.insertBefore(dev, composer);
  }
  return dev;
}

function updateDevPanel() {
  const dev = ensureDevPanel();
  const totalMessages = state.messages.length;
  const url = CONFIG.API_BASE_URL;
  dev.innerHTML = `
    <div class="cp-devrow">sessionId: ${state.sessionId || 'null'}</div>
    <div class="cp-devrow">messages: ${totalMessages}</div>
    <div class="cp-devrow">sessionTokens: ${state.sessionTokens}</div>
    <div class="cp-devrow">backend: ${url}</div>
    <div class="cp-devrow">lastResponseMs: ${state.lastResponseMs}</div>
  `;
}

function toggleDevPanel() {
  const dev = ensureDevPanel();
  const show = !dev.classList.contains('show');
  if (show) {
    updateDevPanel();
    dev.classList.add('show');
  } else {
    dev.classList.remove('show');
  }
}

if (gearBtn) {
  gearBtn.addEventListener('click', toggleDevPanel);
}

function ensureDebugPanel() {
  let dp = document.getElementById('debug-panel');
  if (!dp) {
    dp = document.createElement('div');
    dp.id = 'debug-panel';
    dp.className = 'debug-panel';
    dp.innerHTML = `
      <div class="debug-header"><span>⚙ ContextPilot Debug</span><span id="debug-close" class="debug-close">✕</span></div>
      <div class="debug-section"><div class="debug-label">SESSION</div><div id="debug-session" class="debug-value mono"></div></div>
      <div class="debug-section"><div class="debug-label">LAST RESPONSE TIME</div><div id="debug-response-time" class="debug-value mono"></div></div>
      <div class="debug-section"><div class="debug-label">SESSION TOKENS</div><div id="debug-tokens" class="debug-value mono"></div></div>
      <div class="debug-section"><div class="debug-label">LAST API RESPONSE</div><pre id="debug-last-response" class="debug-json"></pre></div>
      <div class="debug-section"><div class="debug-label">ERROR LOG</div><div id="debug-errors" class="debug-value mono"></div></div>
      <div class="debug-section"><div class="debug-label">BACKEND</div><div id="debug-backend" class="debug-value mono"></div></div>
    `;
    document.body.appendChild(dp);
    const close = dp.querySelector('#debug-close');
    close.addEventListener('click', () => {
      dp.classList.remove('visible');
      state.debugMode = false;
    });
  }
  return dp;
}

function updateDebugPanel() {
  const dp = ensureDebugPanel();
  const sEl = dp.querySelector('#debug-session');
  const rEl = dp.querySelector('#debug-response-time');
  const tEl = dp.querySelector('#debug-tokens');
  const jEl = dp.querySelector('#debug-last-response');
  const eEl = dp.querySelector('#debug-errors');
  const bEl = dp.querySelector('#debug-backend');
  sEl.textContent = `${state.sessionId || 'null'} | pageType=${state.currentPageType}`;
  rEl.textContent = `${state.lastResponseTimeMs ?? 0} ms`;
  tEl.textContent = String(state.totalTokensThisSession || 0);
  try {
    jEl.textContent = JSON.stringify(state.lastApiResponse || {}, null, 2);
  } catch {
    jEl.textContent = String(state.lastApiResponse || '');
  }
  eEl.textContent = (state.errorLog || []).map((x) => `${x.time} — ${x.error}`).join('\n');
  bEl.textContent = CONFIG.API_BASE_URL;
}

function toggleDebugPanel() {
  const dp = ensureDebugPanel();
  state.debugMode = !state.debugMode;
  if (state.debugMode) {
    updateDebugPanel();
    dp.classList.add('visible');
  } else {
    dp.classList.remove('visible');
  }
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
    toggleDebugPanel();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  try {
    if (message && message.type === 'PAGE_CONTENT_UPDATED' && message.data) {
      state.pageContext = message.data;
      state.currentPageType = message.data.pageType;
      setPageBadge(message.data.pageType);
      renderPresetCommands(message.data.pageType);
      if (typeof markContentFresh === 'function') markContentFresh();
    }
  } catch {}
});
function addErrorMessage(errorText) {
  const errorEl = document.createElement('div');
  errorEl.className = 'message-error';
  const icon = document.createElement('span');
  icon.className = 'error-icon';
  icon.textContent = '⚠';
  const text = document.createElement('span');
  text.className = 'error-text';
  text.textContent = errorText;
  const retry = document.createElement('button');
  retry.className = 'error-retry';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => retryLastMessage());
  errorEl.appendChild(icon);
  errorEl.appendChild(text);
  errorEl.appendChild(retry);
  chatEl.appendChild(errorEl);
}

function retryLastMessage() {
  if (state.lastSentMessage) {
    sendMessage(state.lastSentMessage);
  }
}

function showTypingIndicator() {
  typingEl.classList.remove('hidden');
}

function hideTypingIndicator() {
  typingEl.classList.add('hidden');
}

function addUserMessage(text) {
  const userEntry = { role: 'user', content: text, toolUsed: null, messageId: null, timestamp: Date.now() };
  state.messages.push(userEntry);
  renderMessage('user', text, null, null, null, null, null);
}

function clearInput() {
  inputEl.value = '';
  autoResize();
  sendBtn.disabled = true;
}

function focusInput() {
  inputEl.focus();
}
