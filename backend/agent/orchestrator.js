/** 
 * agent/orchestrator.js 
 * Multi-step agent loop for ContextPilot. 
 * Orchestrates tool selection, execution, and response synthesis. 
 * Supports up to MAX_ITERATIONS tool calls per request. 
 */
import { callClaude, extractTextFromContent, extractToolUseFromContent } from '../lib/aiProvider.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { AGENT_TOOLS } from './tools.js';
import { executeTool } from './toolExecutor.js';

const VERBOSE = process.env.VERBOSE_AGENT === 'true';
function agentLog(label, data) {
  if (!VERBOSE) return;
  console.log('\n============================================================');
  console.log(`[AGENT DIAGNOSTIC] ${label}`);
  try {
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(String(data));
  }
  console.log('============================================================');
}

/** Runs the agent loop and returns the final response with metadata. */
export async function runAgent({
  message,
  pageContext,
  userId,
  sessionId,
  userPreferences,
  userCorrections
}) {
  try {
    console.log(
      `[ORCHESTRATOR] Agent start — sessionId: ${sessionId}, pageType: ${pageContext?.pageType || 'unknown'}, preview: "${String(message).slice(0, 200)}"`
    );
    const systemPrompt = await buildSystemPrompt(userPreferences, userCorrections);
    agentLog('system_prompt', { preview: String(systemPrompt || '').slice(0, 200) });

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
      agentLog('model_call_result', { stopReason: resp.stopReason, content: resp.content });
      totalInput += resp.usage?.inputTokens ?? 0;
      totalOutput += resp.usage?.outputTokens ?? 0;

      const stop = resp.stopReason;
      if (stop === 'end_turn') {
        finalContent = resp.content;
        finalStop = stop;
        console.log(`[ORCHESTRATOR] End turn — iterations: ${iterationCount}`);
        break;
      }

      if (stop === 'tool_use') {
        const toolUse = extractToolUseFromContent(resp.content);
        if (!toolUse || !toolUse.toolName) {
          throw new Error('Tool use requested but no tool_use block was found');
        }
        console.log(
          `[ORCHESTRATOR] Tool selected — iteration: ${iterationCount + 1}, tool: ${toolUse.toolName}`
        );
        agentLog('tool_detected', { name: toolUse.toolName, input: toolUse.toolInput });
        const toolResult = await executeTool(toolUse.toolName, toolUse.toolInput, pageContext);
        toolNameUsed = toolUse.toolName;
        toolsCalledChain.push(toolUse.toolName);

        const { isValid, reason, validatedText, serialized } = coerceAndValidateToolResult(
          toolUse.toolName,
          toolResult
        );
        agentLog('tool_executed', { preview: String(validatedText || toolResult || '').slice(0, 200) });
        messages.push({ role: 'assistant', content: resp.content });
        if (isValid) {
          const tuId = toolUseBlockId(resp.content);
          try {
            console.log(
              '[ORCHESTRATOR] Tool result injection —',
              'tool:',
              toolUse.toolName,
              'id:',
              tuId,
              'result_length:',
              String(serialized || validatedText || '').length
            );
          } catch {}
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: tuId, content: serialized }]
          });
        } else {
          const correctionMsg = `Tool ${toolUse.toolName} failed: ${reason}. Please try a different approach or answer directly from the page content without using this tool.`;
          console.log(
            `[ORCHESTRATOR] Tool result invalid — reason: ${reason}; instructing self-correction`
          );
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUseBlockId(resp.content), content: correctionMsg }]
          });
          failedTools += 1;
          if (failedTools >= 2) {
            break;
          }
        }
        agentLog('tool_result_injected', { messagesLength: messages.length });

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
      totalInput += finalCall.usage?.inputTokens ?? 0;
      totalOutput += finalCall.usage?.outputTokens ?? 0;
      finalContent = finalCall.content;
      finalStop = finalCall.stopReason ?? 'end_turn';
      agentLog('final_model_call', {
        stopReason: finalStop,
        preview: String(extractTextFromContent(finalContent) || '').slice(0, 200)
      });
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

    const toolsLabel =
      Array.isArray(toolsCalledChain) && toolsCalledChain.length > 0
        ? toolsCalledChain.join('->')
        : toolNameUsed || 'direct';
    console.log(
      `[ORCHESTRATOR] Agent loop complete — iterations: ${iterationCount}, tools: ${toolsLabel}, inputTokens: ${totalInput}, outputTokens: ${totalOutput}`
    );
    if (totalInput === 0 && totalOutput === 0) {
      console.warn(
        '[ORCHESTRATOR] Warning: Token counts are both zero. ' +
          'Check that lib/aiProvider.js usage keys match (expected: inputTokens, outputTokens). ' +
          'Provider: ' +
          (process.env.AI_PROVIDER || 'gemini')
      );
    }
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
