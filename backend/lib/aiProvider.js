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

let anthropicClient = null;
if (config.AI_PROVIDER === 'anthropic') {
  anthropicClient = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY
  });
}

export default anthropicClient;

/** Unified model call with standardized content and usage fields. */
export async function callClaude({ systemPrompt, messages, tools, maxTokens } = {}) {
  try {
    if (config.AI_PROVIDER === 'gemini') {
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
        const cfg = { ...modelConfig, model: modelName };
        const model = genAI.getGenerativeModel(cfg);
        const chat = model.startChat({ history });
        return chat.sendMessage(lastParts);
      }

      let result;
      let attempts = 0;
      const maxAttempts = 2;
      const modelsToTry = [modelConfig.model];
      if (!modelsToTry.includes('gemini-2.0-flash')) modelsToTry.push('gemini-2.0-flash');

      for (const modelName of modelsToTry) {
        attempts += 1;
        try {
          result = await sendWithModel(modelName);
          break;
        } catch (err) {
          const status = err?.status || err?.code || 0;
          const msg = String(err?.message || '');
          if (String(status) === '429' || /Too Many Requests|quota/i.test(msg)) {
            console.warn(`[GEMINI] Rate limit — model: ${modelName}. Attempt ${attempts}/${maxAttempts}`);
            const retryMs = 6000;
            await new Promise((r) => setTimeout(r, retryMs));
            if (attempts < maxAttempts) {
              continue;
            }
          }
          throw err;
        }
      }

      const candidate = result?.response?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const usage = {
        inputTokens: result?.response?.usageMetadata?.promptTokenCount || 0,
        outputTokens: result?.response?.usageMetadata?.candidatesTokenCount || 0
      };
        outputTokens: result?.response?.usageMetadata?.candidatesTokenCount || 0
      };
      const firstPart = parts[0];
      if (!firstPart) {
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
      if (firstPart.text) {
        console.log(`[GEMINI] Response received — type: text, stopReason: end_turn`);
        return {
          success: true,
          content: [{ type: 'text', text: firstPart.text }],
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
    return {
      success: false,
      error: error?.message || 'Model call failed',
      code: error?.status || 500
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
