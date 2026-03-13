import { callClaude, extractTextFromContent, extractToolUseFromContent } from '../lib/anthropic.js';
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
    console.log(`[AGENT START] sessionId: ${sessionId} | pageType: ${pageContext?.pageType || 'unknown'} | message: "${String(message).slice(0, 200)}"`);
    const systemPrompt = await buildSystemPrompt(userPreferences, userCorrections);

    const contextBlock = [
      `Current page: ${pageContext?.title ?? ''} (${pageContext?.url ?? ''})`,
      `Page type: ${pageContext?.pageType ?? 'generic'}`,
      '',
      'Page content:',
      pageContext?.content ?? ''
    ].join('\n');
    const userMessage = `${contextBlock}\n\n---\n\n${message}`;
    const messages = [{ role: 'user', content: userMessage }];

    const MAX_ITERATIONS = 5;
    let iterationCount = 0;
    let toolsCalledChain = [];
    let toolNameUsed = null;
    let finalContent = null;
    let finalStop = null;

    let totalInput = 0;
    let totalOutput = 0;
    let failedTools = 0;

    while (iterationCount < MAX_ITERATIONS) {
      const resp = await callClaude({
        systemPrompt,
        messages,
        tools: AGENT_TOOLS,
        maxTokens: 1500
      });
      if (!resp.success) {
        throw new Error(resp.error || 'Claude call failed');
      }
      totalInput += resp.usage?.input_tokens ?? 0;
      totalOutput += resp.usage?.output_tokens ?? 0;

      const stop = resp.stopReason;
      if (stop === 'end_turn') {
        finalContent = resp.content;
        finalStop = stop;
        console.log(`[AGENT LOOP] end_turn reached after ${iterationCount} iterations`);
        break;
      }

      if (stop === 'tool_use') {
        const toolUse = extractToolUseFromContent(resp.content);
        if (!toolUse || !toolUse.toolName) {
          throw new Error('Tool use requested but no tool_use block was found');
        }
        console.log(`[AGENT LOOP] Iteration ${iterationCount + 1} — tool selected: ${toolUse.toolName}`);
        const toolResult = await executeTool(toolUse.toolName, toolUse.toolInput, pageContext);
        toolNameUsed = toolUse.toolName;
        toolsCalledChain.push(toolUse.toolName);

        const { isValid, reason, validatedText, serialized } = coerceAndValidateToolResult(
          toolUse.toolName,
          toolResult
        );
        messages.push({ role: 'assistant', content: resp.content });
        if (isValid) {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUseBlockId(resp.content), content: serialized }]
          });
        } else {
          const correctionMsg = `Tool ${toolUse.toolName} failed: ${reason}. Please try a different approach or answer directly from the page content without using this tool.`;
          console.log(`[AGENT] Tool result invalid — ${reason} — instructing agent to self-correct`);
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUseBlockId(resp.content), content: correctionMsg }]
          });
          failedTools += 1;
          if (failedTools >= 2) {
            break;
          }
        }

        iterationCount += 1;
        continue;
      }
      finalContent = resp.content;
      finalStop = stop;
      break;
    }

    if (!finalContent && (iterationCount >= MAX_ITERATIONS || failedTools >= 2)) {
      const finalCall = await callClaude({
        systemPrompt,
        messages,
        maxTokens: 1500
      });
      if (!finalCall.success) {
        throw new Error(finalCall.error || 'Final call failed');
      }
      totalInput += finalCall.usage?.input_tokens ?? 0;
      totalOutput += finalCall.usage?.output_tokens ?? 0;
      finalContent = finalCall.content;
      finalStop = finalCall.stopReason ?? 'end_turn';
    }

    let finalText = extractTextFromContent(finalContent) || '';
    if (!finalText || finalText.trim().length < 10) {
      finalText =
        'I was unable to generate a useful response for this page. Please try rephrasing your request.';
    } else {
      const lc = finalText.toLowerCase();
      const cannotCount =
        (lc.match(/\bi cannot\b/g) || []).length + (lc.match(/\bi am unable\b/g) || []).length;
      if (cannotCount > 2) {
        finalText = `${finalText} Try navigating to the specific page content you need help with.`;
      }
    }

    console.log(`[AGENT COMPLETE] ${toolsCalledChain.length} tools used | ${totalInput} input tokens | ${totalOutput} output tokens`);
    return {
      response: finalText,
      toolUsed: toolNameUsed,
      toolsCalledChain,
      iterations: iterationCount,
      inputTokens: totalInput,
      outputTokens: totalOutput
    };
  } catch (err) {
    throw new Error(`Agent run failed: ${err?.message || String(err)}`);
  }
}

function toolUseBlockId(contentArray) {
  if (!Array.isArray(contentArray)) return null;
  const block = contentArray.find((b) => b && b.type === 'tool_use');
  return block?.id ?? null;
}

function validateToolResult(toolName, toolResultText) {
  if (toolResultText === null || toolResultText === undefined) {
    return { valid: false, reason: 'Tool returned no output' };
  }
  const s = String(toolResultText).trim();
  if (s.length < 20) {
    return { valid: false, reason: 'Tool output too short to be useful' };
  }
  if (s.startsWith('Error:')) {
    return { valid: false, reason: 'Tool returned an error' };
  }
  if (s.startsWith('This tool only works on')) {
    return { valid: false, reason: 'Wrong page context for this tool' };
  }
  return { valid: true, reason: null };
}

function coerceAndValidateToolResult(toolName, toolResultRaw) {
  try {
    let parsed;
    try {
      parsed = JSON.parse(String(toolResultRaw));
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object') {
      if (parsed.ok === false) {
        const reason = parsed.error ? `Error: ${parsed.error}` : 'Error: Tool reported failure';
        const v = validateToolResult(toolName, reason);
        return {
          isValid: v.valid,
          reason: v.reason || reason,
          validatedText: '',
          serialized: reason
        };
      }
      if (parsed.ok === true && typeof parsed.result === 'string') {
        const v = validateToolResult(toolName, parsed.result);
        return {
          isValid: v.valid,
          reason: v.reason,
          validatedText: parsed.result,
          serialized: JSON.stringify(parsed)
        };
      }
      const fallback = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed);
      const v = validateToolResult(toolName, fallback);
      return {
        isValid: v.valid,
        reason: v.reason,
        validatedText: typeof parsed.result === 'string' ? parsed.result : '',
        serialized: typeof parsed.result === 'string' ? JSON.stringify(parsed) : fallback
      };
    }
    const asString = String(toolResultRaw || '').trim();
    const v = validateToolResult(toolName, asString);
    return { isValid: v.valid, reason: v.reason, validatedText: asString, serialized: asString };
  } catch (e) {
    return { isValid: false, reason: 'Tool returned no output', validatedText: '', serialized: '' };
  }
}
