import { callClaude, extractTextFromContent } from '../lib/anthropic.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { AGENT_TOOLS } from './tools.js';
import { executeTool } from './toolExecutor.js';

export async function runAgent({
  message,
  pageContext,
  userId,
  sessionId,
  userPreferences,
  userCorrections
}) {
  try {
    console.log('[AGENT] Building system prompt');
    const systemPrompt = await buildSystemPrompt(userPreferences, userCorrections);

    console.log('[AGENT] Building initial messages');
    const contextBlock = [
      `Current page: ${pageContext?.title ?? ''} (${pageContext?.url ?? ''})`,
      `Page type: ${pageContext?.pageType ?? 'generic'}`,
      '',
      'Page content:',
      pageContext?.content ?? ''
    ].join('\n');
    const userMessage = `${contextBlock}\n\n---\n\n${message}`;
    const messages = [{ role: 'user', content: userMessage }];

    console.log('[AGENT] First Claude call');
    const first = await callClaude({
      systemPrompt,
      messages,
      tools: AGENT_TOOLS,
      maxTokens: 1500
    });
    if (!first.success) {
      throw new Error(first.error || 'Claude call failed');
    }

    let totalInput = first.usage?.input_tokens ?? 0;
    let totalOutput = first.usage?.output_tokens ?? 0;
    let toolNameUsed = null;
    let finalContent = first.content;
    let finalStop = first.stopReason;

    console.log(`[AGENT] stop_reason: ${finalStop}`);
    if (finalStop === 'tool_use') {
      const toolUseBlock =
        Array.isArray(first.content) ? first.content.find((b) => b && b.type === 'tool_use') : null;
      if (!toolUseBlock) {
        throw new Error('Tool use requested but no tool_use block was found');
      }

      const toolName = toolUseBlock.name;
      const toolInput = toolUseBlock.input;
      console.log(`[AGENT] Tool called: ${toolName} with input: ${JSON.stringify(toolInput)}`);

      const toolResult = await executeTool(toolName, toolInput, pageContext);
      toolNameUsed = toolName;

      messages.push({ role: 'assistant', content: first.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }]
      });

      console.log('[AGENT] Second Claude call (after tool_result)');
      const second = await callClaude({
        systemPrompt,
        messages,
        maxTokens: 1500
      });
      if (!second.success) {
        throw new Error(second.error || 'Second Claude call failed');
      }
      finalContent = second.content;
      finalStop = second.stopReason;
      totalInput += second.usage?.input_tokens ?? 0;
      totalOutput += second.usage?.output_tokens ?? 0;
    }

    console.log('[AGENT] Extracting final text');
    const finalText = extractTextFromContent(finalContent) || 'I processed your request but had no text response to provide.';

    console.log('[AGENT] Done');
    return {
      response: finalText,
      toolUsed: toolNameUsed,
      inputTokens: totalInput,
      outputTokens: totalOutput
    };
  } catch (err) {
    throw new Error(`Agent run failed: ${err?.message || String(err)}`);
  }
}
