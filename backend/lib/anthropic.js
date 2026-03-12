import Anthropic from '@anthropic-ai/sdk';
import config from './config.js';

let anthropicClient = null;
if (config.AI_PROVIDER === 'anthropic') {
  anthropicClient = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY
  });
}

export default anthropicClient;

export async function callClaude({ systemPrompt, messages, tools, maxTokens } = {}) {
  try {
    if (config.AI_PROVIDER === 'gemini') {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
      const combined = [
        systemPrompt || '',
        '',
        ...(Array.isArray(messages)
          ? messages.map((m) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '')))
          : [])
      ]
        .filter(Boolean)
        .join('\n\n');

      const maxOut = Math.min(typeof maxTokens === 'number' ? maxTokens : 512, 1024);

      async function generateWithModel(modelName) {
        console.log(`[AI] Gemini generate with model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const resp = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: combined }] }],
          generationConfig: { maxOutputTokens: maxOut }
        });
        const text = resp?.response?.text?.() || '';
        return {
          success: true,
          content: [{ type: 'text', text }],
          usage: undefined,
          stopReason: 'end_turn'
        };
      }

      try {
        return await generateWithModel(config.GEMINI_MODEL);
      } catch (e) {
        const msg = String(e?.message || e || '');
        const isRateOrQuota =
          msg.includes('429') ||
          msg.toLowerCase().includes('too many requests') ||
          msg.toLowerCase().includes('quota');
        const candidates = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        if (isRateOrQuota) {
          for (const candidate of candidates) {
            if (candidate === config.GEMINI_MODEL) continue;
            console.warn(`[AI] Gemini quota/rate limit for ${config.GEMINI_MODEL}. Trying fallback ${candidate}.`);
            try {
              return await generateWithModel(candidate);
            } catch (e2) {
              const m2 = String(e2?.message || e2 || '');
              const notFound = m2.includes('404') || m2.toLowerCase().includes('not found');
              if (notFound) {
                continue;
              } else {
                throw e2;
              }
            }
          }
        }
        // If initial error wasn't rate/quota, but indicates model not found, try fallbacks anyway
        const notFoundInitial = msg.includes('404') || msg.toLowerCase().includes('not found');
        if (notFoundInitial) {
          for (const candidate of candidates) {
            if (candidate === config.GEMINI_MODEL) continue;
            console.warn(`[AI] Gemini model ${config.GEMINI_MODEL} not found. Trying fallback ${candidate}.`);
            try {
              return await generateWithModel(candidate);
            } catch (e3) {
              continue;
            }
          }
        }
        throw e;
      }
    }

    const response = await anthropicClient.messages.create({
      model: config.ANTHROPIC_MODEL,
      system: systemPrompt || undefined,
      messages: messages || [],
      tools: tools || undefined,
      max_tokens: typeof maxTokens === 'number' ? maxTokens : 1500
    });
    return {
      success: true,
      content: response.content,
      usage: response.usage,
      stopReason: response.stop_reason
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || 'Model call failed',
      code: error?.status || 500
    };
  }
}

export function extractTextFromContent(contentArray) {
  if (!Array.isArray(contentArray)) return '';
  const block = contentArray.find((b) => b && b.type === 'text');
  return block && typeof block.text === 'string' ? block.text : '';
}

export function extractToolUseFromContent(contentArray) {
  if (!Array.isArray(contentArray)) return null;
  const block = contentArray.find((b) => b && b.type === 'tool_use');
  if (!block) return null;
  return {
    toolName: block.name ?? null,
    toolInput: block.input ?? null
  };
}
