import { callClaude, extractTextFromContent } from '../lib/anthropic.js';

export function validateToolContext(toolName, pageContext) {
  const url = String(pageContext?.url || '').toLowerCase();
  const pageType = String(pageContext?.pageType || '').toLowerCase();
  if (toolName === 'generate_outreach_message') {
    const isLinkedIn =
      pageType === 'linkedin' ||
      url.includes('linkedin.com/in/') ||
      url.includes('linkedin.com/profile');
    if (!isLinkedIn) {
      return {
        valid: false,
        reason:
          'This tool only works on LinkedIn profile pages. Please navigate to a LinkedIn profile and try again.'
      };
    }
  }
  if (toolName === 'generate_cover_letter') {
    const knownBoards = [
      'linkedin.com/jobs',
      'indeed.com',
      'naukri.com',
      'greenhouse.io',
      'lever.co'
    ];
    const matchesBoard = pageType === 'jobboard' || knownBoards.some((d) => url.includes(d));
    if (!matchesBoard) {
      return {
        valid: true,
        note:
          'Note: This page may not be a job posting. Cover letter generated based on available content.'
      };
    }
  }
  return { valid: true };
}

export async function executeTool(toolName, toolInput, pageContext) {
  try {
    const ctx = validateToolContext(toolName, pageContext);
    if (!ctx.valid) {
      return JSON.stringify({ ok: false, tool: toolName, error: ctx.reason });
    }
    switch (toolName) {
      case 'summarize_page': {
        try {
          const focus = typeof toolInput?.focus === 'string' ? toolInput.focus : 'main_points';
          console.log('[TOOL EXECUTING] summarize_page', { focus, page: { title: pageContext?.title, url: pageContext?.url } });
          const systemPrompt =
            'You are an expert content analyst. Produce structured, scannable summaries. Be concise and precise.';
          const userMessage = [
            'Summarize the following webpage content.',
            `Focus: ${focus}`,
            'Format: Use bullet points. Group by theme if content is long. Start with a one-sentence TL;DR.',
            '',
            `Page Title: ${pageContext?.title ?? ''}`,
            `Page URL: ${pageContext?.url ?? ''}`,
            `Page Type: ${pageContext?.pageType ?? ''}`,
            '',
            'Content:',
            pageContext?.content ?? ''
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 800
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] summarize_page', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          const text = extractTextFromContent(resp.content) || '';
          console.log('[TOOL COMPLETE] summarize_page — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { focus },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'draft_email_reply': {
        try {
          const tone = typeof toolInput?.tone === 'string' ? toolInput.tone : 'formal';
          const intent = typeof toolInput?.intent === 'string' ? toolInput.intent : 'respond appropriately';
          console.log('[TOOL EXECUTING] draft_email_reply', { tone, intent });
          const systemPrompt =
            'You are an expert email writer. Write professional, natural-sounding email replies. Match the requested tone exactly. Never add placeholder text like [Your Name] — write a complete, ready-to-send reply.';
          const userMessage = [
            `Draft a ${tone} email reply for the following email thread.`,
            `Goal of this reply: ${intent}`,
            '',
            'Important instructions:',
            '- Write the complete reply body only',
            '- Do not include subject line',
            '- Match the formality of the original thread',
            '- Be concise — no unnecessary filler sentences',
            '',
            'Email thread:',
            pageContext?.content ?? ''
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 600
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] draft_email_reply', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          const text = extractTextFromContent(resp.content) || '';
          console.log('[TOOL COMPLETE] draft_email_reply — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { tone, intent },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'answer_question': {
        try {
          const question = typeof toolInput?.question === 'string' ? toolInput.question : '';
          console.log('[TOOL EXECUTING] answer_question', { question });
          const systemPrompt =
            'You are a precise research assistant. Answer questions strictly based on the provided source content. If the answer is not in the content, say so clearly — never fabricate. Cite specific parts of the content when relevant.';
          const userMessage = [
            'Answer the following question using only the page content provided below.',
            '',
            `Question: ${question}`,
            '',
            `Page Title: ${pageContext?.title ?? ''}`,
            `Source URL: ${pageContext?.url ?? ''}`,
            '',
            'Page Content:',
            pageContext?.content ?? '',
            '',
            "If the answer cannot be found in the content, respond: 'This information is not available on the current page.'"
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 700
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] answer_question', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          const text = extractTextFromContent(resp.content) || '';
          console.log('[TOOL COMPLETE] answer_question — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { question },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'extract_structured_data': {
        try {
          const dataType = typeof toolInput?.dataType === 'string' ? toolInput.dataType : 'list';
          console.log('[TOOL EXECUTING] extract_structured_data', { dataType });
          const systemPrompt =
            'You are a data extraction specialist. Extract clean, well-organized structured data from raw webpage content. Format output as clean markdown tables or labeled lists. Never guess or infer data that is not explicitly present.';
          const userMessage = [
            `Extract all ${dataType} data from the following webpage content.`,
            '',
            'Formatting rules:',
            "- For 'table': output as a proper markdown table with headers",
            "- For 'list': output as a clean bulleted list",
            "- For 'contacts': output Name, Title, Email, Phone (if available) per contact",
            "- For 'pricing': output Plan name, Price, Key features per tier",
            "- For 'specifications': output Spec name: Value format",
            "- For 'dates': output Event/Deadline: Date format, sorted chronologically",
            '',
            `If no ${dataType} data is found, respond: 'No ${dataType} data found on this page.'`,
            '',
            'Page Content:',
            pageContext?.content ?? ''
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 900
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] extract_structured_data', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          const text = extractTextFromContent(resp.content) || '';
          console.log('[TOOL COMPLETE] extract_structured_data — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { dataType },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'generate_outreach_message': {
        try {
          const purpose = typeof toolInput?.purpose === 'string' ? toolInput.purpose : 'connection_request';
          const tone = typeof toolInput?.tone === 'string' ? toolInput.tone : 'formal';
          console.log('[TOOL EXECUTING] generate_outreach_message', { purpose, tone });
          const systemPrompt =
            'You are an expert at writing personalized professional outreach messages. You study LinkedIn profiles carefully and craft messages that feel genuinely researched — never generic. You reference specific details from the profile.';
          const userMessage = [
            `Write a ${tone} ${purpose} message for this LinkedIn profile.`,
            '',
            'Rules by purpose:',
            '- connection_request: Maximum 300 characters. Reference ONE specific detail from their profile. No generic openers like \'I came across your profile\'.',
            '- cold_outreach: 3–4 sentences. Reference their role and a specific achievement. State your purpose clearly in the last sentence.',
            '- collaboration: 4–5 sentences. Show you understand their work. Propose something specific, not vague.',
            '',
            'LinkedIn Profile Content:',
            pageContext?.content ?? ''
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 400
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] generate_outreach_message', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          const text = extractTextFromContent(resp.content) || '';
          console.log('[TOOL COMPLETE] generate_outreach_message — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { purpose, tone },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'generate_cover_letter': {
        try {
          const tone = typeof toolInput?.tone === 'string' ? toolInput.tone : 'professional';
          const candidateBackground =
            typeof toolInput?.candidateBackground === 'string' ? toolInput.candidateBackground : '';
          console.log('[TOOL EXECUTING] generate_cover_letter', { tone });
          const systemPrompt =
            'You are a senior career coach who writes cover letters that get interviews. Your letters are specific, confident, and demonstrate real understanding of the role. You never use filler phrases like \'I am a hard worker\' or \'I am passionate about\'. Every sentence earns its place.';
          const userMessage = [
            `Write a ${tone} cover letter for the following job posting.`,
            '',
            'Candidate background provided by user:',
            candidateBackground,
            '',
            'Instructions:',
            '- Opening paragraph: Hook with a specific reason you want THIS role at THIS company',
            '- Middle paragraph: Connect 2–3 specific candidate achievements to specific job requirements',
            '- Closing paragraph: Clear call to action, no fluff',
            '- Length: 3 paragraphs, maximum 300 words',
            '- Do NOT include address blocks or date — just the letter body',
            '',
            'Job Posting:',
            pageContext?.content ?? ''
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 800
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] generate_cover_letter', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          let text = extractTextFromContent(resp.content) || '';
          const check = validateToolContext('generate_cover_letter', pageContext);
          if (check?.note) {
            text = `${check.note}\n\n${text}`;
          }
          console.log('[TOOL COMPLETE] generate_cover_letter — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { candidateBackground, tone },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'explain_concept': {
        try {
          const targetAudience = typeof toolInput?.targetAudience === 'string' ? toolInput.targetAudience : 'beginner';
          const conceptToExplain =
            typeof toolInput?.conceptToExplain === 'string' ? toolInput.conceptToExplain : '';
          console.log('[TOOL EXECUTING] explain_concept', { targetAudience, conceptToExplain });
          const systemPrompt =
            'You are a world-class technical educator. You explain complex concepts at exactly the right level for your audience. You use precise analogies, concrete examples, and avoid both dumbing things down and unnecessary jargon. Your explanations always start with what the thing IS, then explain why it matters, then show how it works.';
          const userMessage = [
            `Explain the following concept to a ${targetAudience}.`,
            '',
            `Concept to explain: ${conceptToExplain}`,
            '',
            'Explanation structure:',
            '1. What it is (1–2 sentences, plain language)',
            '2. Why it matters / what problem it solves (2–3 sentences)',
            '3. How it works (use an analogy appropriate for ' + targetAudience + ')',
            '4. Key things to remember (2–3 bullet points)',
            '',
            'Base your explanation on this page content where relevant:',
            pageContext?.content ?? ''
          ].join('\n');
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 700
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] explain_concept', err);
            return JSON.stringify({ ok: false, tool: toolName, error: err });
          }
          const text = extractTextFromContent(resp.content) || '';
          console.log('[TOOL COMPLETE] explain_concept — chars:', text.length);
          return JSON.stringify({
            ok: true,
            tool: toolName,
            input: { targetAudience, conceptToExplain },
            result: text
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      default: {
        return JSON.stringify({
          ok: false,
          error: `Unknown tool: ${toolName}`
        });
      }
    }
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Tool execution failed: ${err?.message || String(err)}`
    });
  }
}
