const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const pageBadge = document.getElementById('pageBadge');
const emptyState = document.getElementById('emptyState');
const emptyPageType = document.getElementById('emptyPageType');
const typingEl = document.getElementById('typing');
const presetsEl = document.getElementById('presets');
const charHint = document.getElementById('charHint');

const state = {
  sessionId: null,
  userId: null,
  pageContext: null,
  messages: [],
  isLoading: false,
  currentPageType: 'generic'
};

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
  generic: [
    { label: '📝 Summarize', message: 'Summarize the main content of this page' },
    { label: '❓ Explain', message: 'Explain what this page is about' },
    { label: '💬 Ask', message: 'What can you help me with on this page?' }
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

function renderMessage(role, content, toolUsed, messageId, animated = true) {
  const d = document.createElement('div');
  d.className = `cp-msg ${role === 'user' ? 'cp-user' : 'cp-assistant'}${animated ? '' : ' cp-static'}`;
  if (role === 'assistant') {
    const body = document.createElement('div');
    body.className = 'markdown-body';
    body.innerHTML = markdownToHtml(content || '(no response)');
    d.appendChild(body);
    if (toolUsed) {
      const tool = document.createElement('div');
      tool.className = 'cp-tool';
      tool.textContent = `🔧 Used: ${toolUsed}`;
      d.appendChild(tool);
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
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });
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
    b.addEventListener('click', () => sendMessage(it.message));
    presetsEl.appendChild(b);
  });
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

async function callBackendAPI(endpoint, method, body) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      return { success: false, status: res.status, error: msg, data };
    }
    return { success: true, status: res.status, data };
  } catch (e) {
    return { success: false, status: 0, error: 'Network error or timeout' };
  } finally {
    clearTimeout(t);
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
    renderMessage(msg.role, msg.content, msg.tool_used ?? null, msg.id ?? null, false);
  });
  state.messages = result.data.messages;
  scrollToBottom(false);
  showHistoryLoadedBadge(result.data.count);
}

async function initializePanel() {
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

async function sendMessage(userMessage) {
  const text = String(userMessage || '').trim();
  if (!text || state.isLoading) return;
  emptyState.classList.add('hidden');
  inputEl.value = '';
  autoResize();
  sendBtn.disabled = true;
  const userEntry = { role: 'user', content: text, toolUsed: null, messageId: null, timestamp: Date.now() };
  state.messages.push(userEntry);
  renderMessage('user', text, null, null);
  setLoading(true);
  const body = {
    message: text,
    pageContext: state.pageContext,
    sessionId: state.sessionId,
    userId: state.userId
  };
  const resp = await callBackendAPI('/api/chat', 'POST', body);
  if (resp.success) {
    const d = resp.data || {};
    const assistantEntry = {
      role: 'assistant',
      content: d.response || '(no response)',
      toolUsed: d.toolUsed ?? null,
      messageId: d.messageId ?? null,
      timestamp: Date.now()
    };
    state.messages.push(assistantEntry);
    renderMessage('assistant', assistantEntry.content, assistantEntry.toolUsed, assistantEntry.messageId);
  } else {
    let msg = 'The AI agent encountered an error. Please try again.';
    if (resp.status === 0) msg = 'Connection failed. Is the ContextPilot server running?';
    else if (resp.status === 429) msg = 'Too many requests. Please wait a moment.';
    else if (resp.status >= 500) msg = 'The AI agent encountered an error. Please try again.';
    renderMessage('assistant', msg, null, null);
  }
  setLoading(false);
  inputEl.focus();
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
