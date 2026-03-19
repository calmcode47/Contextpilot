/**
 * lib/aiProvider.js
 *
 * Unified AI provider wrapper for ContextPilot.
 * Supports both Anthropic Claude and Google Gemini via a single interface.
 *
 * All callers use callClaude() regardless of which provider is active.
 * Provider selection is controlled by the AI_PROVIDER environment variable.
 *
 * Response shape is standardized across providers — callers never need
 * to know which provider produced the response.
 *
 * @module aiProvider
 */
import Anthropic from '@anthropic-ai/sdk';
import config from './config.js';
import { toGeminiTools } from '../agent/tools.js';

// Gemini throttling: keep concurrency low to avoid 429s.
// This is intentionally simple (single-process in-memory queue).
let geminiQueue = Promise.resolve();
let geminiLastCallAtMs = 0;
const GEMINI_MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MS || 1200);

async function runGeminiQueued(fn) {
  const run = async () => {
    const now = Date.now();
    const waitMs = Math.max(0, GEMINI_MIN_INTERVAL_MS - (now - geminiLastCallAtMs));
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    try {
      return await fn();
    } finally {
      geminiLastCallAtMs = Date.now();
    }
  };
  const p = geminiQueue.then(run, run);
  // Ensure queue continues even if this call fails.
  geminiQueue = p.catch(() => {});
  return p;
}

function parseRetryDelaySecondsFromMessage(msg) {
  const s = String(msg || '');
  // Gemini often embeds: "Please retry in 54.2s." or RetryInfo retryDelay.
  const m = s.match(/Please retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (m?.[1]) {
    const n = Math.ceil(Number(m[1]));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isLikelyDailyQuotaExhaustion(msg) {
  const s = String(msg || '');
  return /RequestsPerDay|PerDay|per day|GenerateRequestsPerDay/i.test(s);
}

let anthropicClient = null;
if (config.AI_PROVIDER === 'anthropic') {
  anthropicClient = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY
  });
}

export default anthropicClient;

export async function checkGeminiKeyConnectivity() {
  try {
    if (config.AI_PROVIDER !== 'gemini') return;
    const key = config.GEMINI_API_KEY;
    if (!key || key.length < 20) {
      console.warn('[GEMINI] No API key present for connectivity check');
      return;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      key
    )}`;
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) {
      console.log('[GEMINI] Connectivity check: key accepted (models list fetched)');
    } else {
      const text = await res.text();
      console.warn(
        '[GEMINI] Connectivity check: key rejected',
        'status:',
        res.status,
        'body:',
        text.slice(0, 240)
      );
    }
  } catch (e) {
    console.warn('[GEMINI] Connectivity check failed:', e?.message || String(e));
  }
}

function classifyProviderError(error) {
  const message = error?.message || String(error || '');
  let details = '';
  try {
    if (error?.details) details = String(error.details);
  } catch {}
  const status = error?.status || error?.statusCode || 0;
  const hasZeroLimit = /limit:\s*0\b/i.test(message) || /limit:\s*0\b/i.test(details);
  if (
    status === 503 ||
    /503|Service Unavailable|high demand|temporarily unavailable|overloaded/i.test(message)
  ) {
    let retryAfter = 15;
    const m = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    if (m?.[1]) {
      const s = Math.ceil(Number(m[1]));
      if (Number.isFinite(s) && s > 0) retryAfter = Math.min(300, s);
    }
    return {
      type: 'PROVIDER_OVERLOADED',
      httpStatus: 503,
      userMessage:
        'Gemini is temporarily overloaded (high demand). Please retry shortly.',
      devMessage:
        'Gemini returned HTTP 503 (high demand). This is typically transient.\n' +
        'Mitigations:\n' +
        '  1) Retry with exponential backoff\n' +
        '  2) Use a fallback Gemini model when the preferred model is overloaded\n' +
        (details ? `\n\nDetails:\n${details}` : `\n\nRaw message:\n${message}`),
      retryAfter
    };
  }
  if (status === 403 || /403|PERMISSION_DENIED|permission denied|not authorized|API has not been used|access not configured/i.test(message)) {
    return {
      type: 'PERMISSION_DENIED',
      httpStatus: 503,
      userMessage:
        'AI provider request was blocked (permission denied). Check API enablement and key restrictions.',
      devMessage:
        'Gemini permission denied (often NOT an invalid key). Check:\n' +
        '  1) In Google Cloud Console, ensure the Generative Language API is enabled for the project tied to this key\n' +
        '  2) API key restrictions: remove/refine HTTP referrer / IP restrictions for server-side use\n' +
        '  3) If using a “browser key”, create an unrestricted server key for backend\n' +
        `  Current AI_PROVIDER: ${config.AI_PROVIDER}` +
        (details ? `\n\nDetails:\n${details}` : ''),
      retryAfter: 0
    };
  }
  if (status === 451 || /SAFETY|blocked|blockReason/i.test(message)) {
    return {
      type: 'SAFETY_BLOCKED',
      httpStatus: 503,
      userMessage:
        'AI provider blocked the response (safety policy). Try rephrasing your request or reducing sensitive content.',
      devMessage:
        `Gemini safety block detected. Raw message: ${message}`.slice(0, 1200) +
        (details ? `\n\nDetails:\n${details}` : ''),
      retryAfter: 0
    };
  }
  // Gemini can return 429 for both rate limiting and quota exhaustion (RESOURCE_EXHAUSTED).
  // If the message indicates quota/billing, classify as QUOTA_EXCEEDED with actionable guidance.
  if (
    status === 429 &&
    /RESOURCE_EXHAUSTED|exceeded your current quota|plan and billing|Quota exceeded for metric/i.test(message)
  ) {
    // Best-effort Retry-After extraction (Gemini sometimes embeds "Please retry in Xs").
    // If quota limit is literally 0, retries are not useful — treat as non-retriable.
    let retryAfter = hasZeroLimit ? 0 : 60;
    const m = message.match(/Please retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    if (m?.[1]) {
      const s = Math.ceil(Number(m[1]));
      if (!hasZeroLimit && Number.isFinite(s) && s > 0) retryAfter = Math.min(300, s);
    }
    return {
      type: 'QUOTA_EXCEEDED',
      httpStatus: 503,
      userMessage: hasZeroLimit
        ? "Gemini quota is set to 0 for this key/project (not 'used up'). Enable/allocate quota or switch AI provider."
        : 'Gemini quota is exhausted or unavailable for this project/key. Please check plan/billing.',
      devMessage:
        'Gemini returned RESOURCE_EXHAUSTED (HTTP 429). This usually means the project/key has no available quota.\n' +
        'If the error mentions limit: 0, free-tier quota is effectively disabled for this project.\n\n' +
        'Fix on Google side:\n' +
        '  1) Open the Gemini API rate-limit dashboard and confirm quotas are > 0\n' +
        '  2) Ensure the API key is created/managed for Gemini API access (AI Studio key or properly configured Cloud key)\n' +
        '  3) Verify billing/plan is active for the project if required\n' +
        (details ? `\n\nDetails:\n${details}` : `\n\nRaw message:\n${message}`),
      retryAfter
    };
  }

  if (status === 429 || /429|too many requests|rate limit/i.test(message)) {
    return {
      type: 'RATE_LIMITED',
      httpStatus: 503,
      userMessage: 'AI provider is rate limiting requests. Please wait a few seconds and retry.',
      devMessage:
        'Gemini returned HTTP 429 (rate limit). This is often per-minute / per-second throttling,\n' +
        'not the daily quota. Mitigations:\n' +
        '  1) Reduce concurrency (queue requests)\n' +
        '  2) Add backoff and retry-after handling\n' +
        '  3) Ensure the extension is not firing multiple /api/chat calls per prompt\n' +
        (details ? `\n\nDetails:\n${details}` : ''),
      retryAfter: 10
    };
  }
  if (/quota|RESOURCE_EXHAUSTED/i.test(message)) {
    return {
      type: 'QUOTA_EXCEEDED',
      httpStatus: 503,
      userMessage: 'AI provider quota exhausted. Please retry later.',
      devMessage: details ? `${message}\n\nDetails:\n${details}` : message,
      retryAfter: 60
    };
  }
  if (
    status === 401 ||
    /401|invalid.*key|API key not valid|x-api-key/i.test(message)
  ) {
    return {
      type: 'INVALID_API_KEY',
      httpStatus: 503,
      userMessage: 'AI provider authentication failed. Check your API key configuration.',
      devMessage:
        'Invalid API key detected. Check:\n' +
        '  1. ANTHROPIC_API_KEY or GEMINI_API_KEY in your .env\n' +
        '  2. Key is not expired or revoked\n' +
        '  3. Ensure the key is pasted WITHOUT quotes\n' +
        `  4. AI_PROVIDER matches the key you provided\n  Current AI_PROVIDER: ${config.AI_PROVIDER}`,
      retryAfter: 0
    };
  }
  if (status === 404 || /model.*not found/i.test(message)) {
    return {
      type: 'MODEL_NOT_FOUND',
      httpStatus: 503,
      userMessage: 'AI model not available. Check GEMINI_MODEL or ANTHROPIC_MODEL config.',
      devMessage: 'Model not found. Set GEMINI_MODEL=gemini-2.0-flash in your .env',
      retryAfter: 0
    };
  }
  return {
    type: 'PROVIDER_ERROR',
    httpStatus: 503,
    userMessage: 'AI provider is temporarily unavailable. Please try again.',
    devMessage: details ? `${message}\n\nDetails:\n${details}` : message,
    retryAfter: 30
  };
}

/** Unified model call with standardized content and usage fields. */
export async function callClaude({ systemPrompt, messages, tools, maxTokens } = {}) {
  try {
    if (config.AI_PROVIDER === 'gemini') {
      const startedAt = Date.now();
      const toolsCount = Array.isArray(tools) ? tools.length : 0;
      // Tool-calling requests can require multiple turns and are slower; give them a bigger budget.
      const defaultBudgetMs = toolsCount > 0 ? 45000 : 25000;
      const MAX_TOTAL_GEMINI_MS = Number(process.env.GEMINI_MAX_TOTAL_MS || defaultBudgetMs);
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
      function convertMessagesToGeminiHistory(msgs) {
        const history = [];
        const toolIdToName = {};
        const n = Array.isArray(msgs) ? msgs.length : 0;

        // Pass 1: build lookup of tool_use_id -> tool_name across all messages
        for (let i = 0; i < n; i++) {
          const m = msgs[i];
          const c = m?.content;
          if (Array.isArray(c)) {
            for (const block of c) {
              if (block?.type === 'tool_use' && block?.id && block?.name) {
                toolIdToName[block.id] = block.name;
              }
            }
          }
        }

        // Pass 2: build history for all but the last message
        for (let i = 0; i < Math.max(0, n - 1); i++) {
          const m = msgs[i];
          const role = m?.role === 'assistant' ? 'model' : 'user';
          const parts = [];
          const c = m?.content;
          if (typeof c === 'string') {
            if (c.trim().length > 0) parts.push({ text: c });
          } else if (Array.isArray(c)) {
            for (const block of c) {
              if (block?.type === 'text') {
                parts.push({ text: block.text || '' });
              } else if (block?.type === 'tool_use') {
                const callName = block?.name || '';
                parts.push({ functionCall: { name: callName, args: block?.input || {} } });
              } else if (block?.type === 'tool_result') {
                const resolvedName = toolIdToName[block?.tool_use_id] || 'unknown_tool';
                if (resolvedName === 'unknown_tool') {
                  console.error(
                    '[AI PROVIDER] Could not resolve tool name for tool_use_id:',
                    block?.tool_use_id,
                    '— known IDs:',
                    Object.keys(toolIdToName)
                  );
                }
                parts.push({
                  functionResponse: { name: resolvedName, response: { result: block?.content } }
                });
              }
            }
          }
          if (parts.length > 0) {
            history.push({ role, parts });
          }
        }
        return { history, toolIdToName };
      }
      const modelConfig = {
        model: config.GEMINI_MODEL,
        systemInstruction: systemPrompt || undefined
      };
      const functionDecls = Array.isArray(tools) && tools.length > 0 ? [{ functionDeclarations: toGeminiTools(tools) }] : undefined;
      if (functionDecls) {
        modelConfig.tools = functionDecls;
        modelConfig.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
      }
      const { history, toolIdToName } = convertMessagesToGeminiHistory(messages || []);
      console.log(`[GEMINI] Sending message — tools: ${Array.isArray(tools) ? tools.length : 0}, history: ${history.length}`);
      const last = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : { role: 'user', content: '' };
      let lastParts = [];
      if (typeof last?.content === 'string') {
        lastParts = [{ text: last.content }];
      } else if (Array.isArray(last?.content)) {
        for (const block of last.content) {
          if (block?.type === 'text') {
            lastParts.push({ text: block.text || '' });
          } else if (block?.type === 'tool_result') {
            const nameFromId = toolIdToName?.[block?.tool_use_id] || 'unknown_tool';
            lastParts.push({ functionResponse: { name: nameFromId, response: { result: block?.content } } });
          }
        }
        if (lastParts.length === 0) lastParts = [{ text: JSON.stringify(last.content) }];
      } else {
        lastParts = [{ text: '' }];
      }

      async function sendWithModel(modelName) {
        return runGeminiQueued(async () => {
          const cfg = { ...modelConfig, model: modelName };
          const model = genAI.getGenerativeModel(cfg);
          const chat = model.startChat({ history });
          return chat.sendMessage(lastParts);
        });
      }

      let result;
      const configuredModel = modelConfig.model;
      // Always respect the configured model as primary.
      // Some older configs may still point at non-tools variants; in that case we try known tools-capable fallbacks.
      const primaryModel = configuredModel || 'gemini-2.5-flash';
      const modelsToTry = [primaryModel];
      // Fallbacks stay within Gemini and avoid forcing a model that may have 0 quota (e.g. free-tier-only 2.0-flash).
      const fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-flash-exp', 'gemini-2.0-flash'];
      for (const m of fallbackModels) {
        if (!modelsToTry.includes(m)) modelsToTry.push(m);
      }

      let lastErr = null;
      for (const modelName of modelsToTry) {
        const maxAttemptsPerModel = 4;
        for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
          if (Date.now() - startedAt > MAX_TOTAL_GEMINI_MS) {
            throw Object.assign(
              new Error(`Gemini request exceeded ${MAX_TOTAL_GEMINI_MS}ms budget`),
              { status: 503 }
            );
          }
          try {
            result = await sendWithModel(modelName);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const status = err?.status || err?.code || 0;
            const msg = String(err?.message || '');
            if (String(status) === '429' || /Too Many Requests|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
              // IMPORTANT:
              // - If this is a daily quota exhaustion, retrying or switching models won't help.
              // - If Gemini provides a retry delay, respect it (prevents hammering + further throttling).
              console.warn(`[GEMINI] 429 — model: ${modelName}. Attempt ${attempt}/${maxAttemptsPerModel}`);
              if (isLikelyDailyQuotaExhaustion(msg)) {
                throw err;
              }
              const retryAfterS = parseRetryDelaySecondsFromMessage(msg);
              const base = 1500;
              const retryMs = retryAfterS
                ? Math.min(60000, retryAfterS * 1000)
                : Math.min(30000, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
              await new Promise((r) => setTimeout(r, retryMs));
              continue;
            }
            if (String(status) === '503' || /high demand|Service Unavailable|temporarily unavailable/i.test(msg)) {
              console.warn(`[GEMINI] 503 high demand — model: ${modelName}. Attempt ${attempt}/${maxAttemptsPerModel}`);
              // If primary model is overloaded, switch to fallback quickly.
              if (modelName === primaryModel) {
                break;
              }
              const base = 2000;
              const retryMs =
                Math.min(15000, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
              await new Promise((r) => setTimeout(r, retryMs));
              continue;
            }
            throw err;
          }
        }
        if (result) break;
        // If we got here due to repeated 429s, do NOT switch models (avoid consuming more quota).
        if (lastErr) {
          const status = lastErr?.status || lastErr?.code || 0;
          const msg = String(lastErr?.message || '');
          if (String(status) === '429' || /RESOURCE_EXHAUSTED|quota|Too Many Requests|rate limit/i.test(msg)) {
            throw lastErr;
          }
        }
      }
      if (!result) throw lastErr || new Error('Gemini call failed with no result');

      const responseObj = result?.response;
      const candidate = responseObj?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const usage = {
        inputTokens: responseObj?.usageMetadata?.promptTokenCount || 0,
        outputTokens: responseObj?.usageMetadata?.candidatesTokenCount || 0
      };

      // Newer SDKs expose helpers; use them first when present.
      try {
        const maybeText = typeof responseObj?.text === 'function' ? responseObj.text() : '';
        if (typeof maybeText === 'string' && maybeText.trim().length > 0) {
          console.log(`[GEMINI] Response received — type: text(helper), stopReason: end_turn`);
          return {
            success: true,
            content: [{ type: 'text', text: maybeText }],
            stopReason: 'end_turn',
            usage
          };
        }
      } catch {}

      // Handle blocked / empty-candidate responses with a clear error.
      const blockReason =
        responseObj?.promptFeedback?.blockReason ||
        responseObj?.promptFeedback?.blockReasonMessage ||
        candidate?.finishReason;
      if (!candidate || !Array.isArray(parts) || parts.length === 0) {
        let devDetails = '';
        try {
          devDetails = JSON.stringify(
            {
              model: candidate?.model,
              finishReason: candidate?.finishReason,
              promptFeedback: responseObj?.promptFeedback,
              candidatesCount: Array.isArray(responseObj?.candidates) ? responseObj.candidates.length : 0
            },
            null,
            2
          );
        } catch {}
        if (blockReason) {
          throw Object.assign(new Error(`Gemini blocked the response: ${String(blockReason)}`), {
            status: 403,
            details: devDetails
          });
        }
        throw Object.assign(new Error('No parts in Gemini response'), {
          status: 503,
          details: devDetails
        });
      }

      const firstPart = parts[0];
      if (firstPart.functionCall) {
        console.log(
          `[GEMINI] Response received — type: function_call, tool: ${firstPart.functionCall.name}`
        );
        return {
          success: true,
          content: [
            {
              type: 'tool_use',
              id: `gemini_tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: firstPart.functionCall.name,
              input: firstPart.functionCall.args || {}
            }
          ],
          stopReason: 'tool_use',
          usage
        };
      }

      const textPart = parts.find((p) => typeof p?.text === 'string' && p.text.trim().length > 0);
      if (textPart?.text) {
        console.log(`[GEMINI] Response received — type: text(parts), stopReason: end_turn`);
        return {
          success: true,
          content: [{ type: 'text', text: textPart.text }],
          stopReason: 'end_turn',
          usage
        };
      }
      throw new Error('Unhandled Gemini response part');
    }

    const response = await anthropicClient.messages.create({
      model: config.ANTHROPIC_MODEL,
      system: systemPrompt || undefined,
      messages: messages || [],
      tools: tools || undefined,
      max_tokens: typeof maxTokens === 'number' ? maxTokens : 1500
    });
    const usage = {
      inputTokens: response?.usage?.input_tokens || 0,
      outputTokens: response?.usage?.output_tokens || 0
    };
    return {
      success: true,
      content: response.content,
      usage,
      stopReason: response.stop_reason
    };
  } catch (error) {
    const classified = classifyProviderError(error);
    console.error('[AI PROVIDER] Error classified as:', classified.type);
    console.error('[AI PROVIDER] Dev message:', classified.devMessage);
    return {
      success: false,
      error: classified.userMessage,
      devError: classified.devMessage,
      errorType: classified.type,
      httpStatus: classified.httpStatus,
      retryAfter: classified.retryAfter,
      code: classified.httpStatus
    };
  }
}

/** Extracts the first text block from a content array. */
export function extractTextFromContent(contentArray) {
  if (!Array.isArray(contentArray)) return '';
  const block = contentArray.find((b) => b && b.type === 'text');
  return block && typeof block.text === 'string' ? block.text : '';
}

/** Extracts tool name, input, and full block from a tool_use content array. */
export function extractToolUseFromContent(contentArray) {
  if (!Array.isArray(contentArray)) return null;
  const block = contentArray.find((b) => b && b.type === 'tool_use');
  if (!block) return null;
  if (!block.name || typeof block.name !== 'string') {
    try {
      console.error(
        '[AI PROVIDER] extractToolUseFromContent: tool_use block missing name field',
        JSON.stringify(block)
      );
    } catch {}
    return null;
  }
  if (!block.id) {
    console.warn(
      '[AI PROVIDER] extractToolUseFromContent: tool_use block missing id — generating fallback'
    );
    block.id = `fallback_${Date.now()}_${block.name}`;
  }
  return {
    toolName: block.name,
    toolInput: block.input || {},
    toolUseBlock: block
  };
}
