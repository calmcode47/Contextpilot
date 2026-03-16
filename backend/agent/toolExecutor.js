/**
 * agent/toolExecutor.js
 * LLM-as-executor tool implementations.
 * Each tool makes a focused AI sub-call with a task-specific system prompt.
 * Returns string results consumed by the orchestrator tool-result loop.
 */
import { callClaude, extractTextFromContent } from '../lib/aiProvider.js';

/** Validates whether the requested tool is appropriate for the current page context. */
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

function flattenForScope(scopedDetails) {
  const flat = {};
  for (const [category, fields] of Object.entries(scopedDetails || {})) {
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== null && value !== undefined) {
          flat[key] = value;
          flat[`${category}_${key}`] = value;
        }
      }
    }
  }
  return flat;
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
          console.log(
            `[TOOL] Executing summarize_page — focus: ${focus}, url: ${pageContext?.url || ''}`
          );
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
          console.log(
            `[TOOL] Executing draft_email_reply — tone: ${tone}, intent: ${intent}`
          );
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
          console.log(
            `[TOOL] Executing answer_question — question: ${question ? question.slice(0, 80) : ''}`
          );
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
      case 'save_profile': {
        try {
          const rawInput =
            typeof toolInput?.rawInput === 'string' ? toolInput.rawInput : String(toolInput || '');
          const updateMode =
            typeof toolInput?.updateMode === 'string' ? toolInput.updateMode : 'partial_update';
          console.log(`[TOOL] Executing save_profile — mode: ${updateMode}`);
          const systemPrompt =
            'You are a precise personal information extractor. Extract personal details from the user\'s message and return ONLY a valid JSON object. No preamble, no explanation, no markdown — only the JSON object.\n\nOutput schema:\n{\n  "personal": {\n    "fullName": "string or null",\n    "firstName": "string or null",\n    "lastName": "string or null",\n    "email": "string or null",\n    "phone": "string or null",\n    "dateOfBirth": "YYYY-MM-DD or null",\n    "gender": "string or null",\n    "nationality": "string or null"\n  },\n  "academic": {\n    "college": "string or null",\n    "university": "string or null",\n    "degree": "string or null",\n    "branch": "string or null",\n    "year": "string or null",\n    "rollNumber": "string or null",\n    "cgpa": "string or null",\n    "passingYear": "string or null"\n  },\n  "professional": {\n    "company": "string or null",\n    "jobTitle": "string or null",\n    "experience": "string or null",\n    "skills": ["array of strings or empty array"],\n    "linkedIn": "string or null",\n    "github": "string or null",\n    "portfolio": "string or null"\n  },\n  "address": {\n    "street": "string or null",\n    "city": "string or null",\n    "state": "string or null",\n    "country": "string or null",\n    "pincode": "string or null",\n    "zip": "string or null"\n  },\n  "custom": {}\n}\n\nRules:\n- Only include fields that are explicitly mentioned in the input\n- Set unmentioned fields to null\n- Normalize phone numbers: remove spaces and dashes\n- Normalize email: lowercase\n- For names: if only full name given, also split into firstName/lastName\n- For Indian users: "pincode" not "zip"\n- Return ONLY the JSON. No other text.';
          const userMessage = `Extract personal details from this message:\n\n"${rawInput}"`;
          const resp = await callClaude({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            tools: null,
            maxTokens: 800
          });
          if (!resp?.success) {
            const err = resp?.error || 'Model call failed';
            console.warn('[TOOL ERROR] save_profile', err);
            return `Failed to parse profile details: ${err}`;
          }
          let parsedDetails;
          try {
            const rawText = extractTextFromContent(resp.content) || '';
            const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsedDetails = JSON.parse(cleanJson || '{}');
          } catch (parseError) {
            console.error('[TOOL save_profile] JSON parse failed:', parseError.message);
            return 'Could not parse the details you provided. Please try again with clearer information like: "My name is [name], email is [email], studying at [college]"';
          }
          function removeNulls(obj) {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj || {})) {
              if (value === null || value === undefined) continue;
              if (typeof value === 'object' && !Array.isArray(value)) {
                const cleanedNested = removeNulls(value);
                if (Object.keys(cleanedNested).length > 0) {
                  cleaned[key] = cleanedNested;
                }
              } else if (Array.isArray(value) && value.length === 0) {
                continue;
              } else {
                cleaned[key] = value;
              }
            }
            return cleaned;
          }
          const cleanedDetails = removeNulls(parsedDetails);
          function countFields(obj, depth = 0) {
            let count = 0;
            for (const value of Object.values(obj || {})) {
              if (typeof value === 'object' && !Array.isArray(value) && depth < 2) {
                count += countFields(value, depth + 1);
              } else {
                count += 1;
              }
            }
            return count;
          }
          const fieldCount = countFields(cleanedDetails);
          if (fieldCount === 0) {
            return 'I could not identify any personal details in your message. Try being more specific: "Save my details: Name: [your name], Email: [your email], College: [your college]"';
          }
          const { upsertUserProfile } = await import('../lib/supabase.js');
          const uid = pageContext?.userId || 'anonymous';
          const { data: savedProfile, error: saveError } = await upsertUserProfile(uid, cleanedDetails);
          if (saveError) {
            console.error('[TOOL save_profile] Supabase error:', saveError);
            return `Details parsed successfully but failed to save: ${saveError.message}. Please try again.`;
          }
          const summary = [];
          if (cleanedDetails.personal) {
            const p = cleanedDetails.personal;
            if (p.fullName) summary.push(`Name: ${p.fullName}`);
            if (p.email) summary.push(`Email: ${p.email}`);
            if (p.phone) summary.push(`Phone: ${p.phone}`);
          }
          if (cleanedDetails.academic) {
            const a = cleanedDetails.academic;
            if (a.college || a.university) summary.push(`College: ${a.college || a.university}`);
            if (a.year) summary.push(`Year: ${a.year}`);
            if (a.degree) summary.push(`Degree: ${a.degree}`);
          }
          if (cleanedDetails.professional) {
            const pr = cleanedDetails.professional;
            if (pr.company) summary.push(`Company: ${pr.company}`);
            if (pr.jobTitle) summary.push(`Role: ${pr.jobTitle}`);
          }
          if (cleanedDetails.address) {
            const addr = cleanedDetails.address;
            if (addr.city) summary.push(`City: ${addr.city}`);
          }
          return JSON.stringify({
            success: true,
            action: 'profile_saved',
            fieldsExtracted: fieldCount,
            updateMode,
            summary: summary.join(' · '),
            message: `Successfully saved ${fieldCount} detail${fieldCount !== 1 ? 's' : ''} to your profile.`
          });
        } catch (e) {
          return JSON.stringify({ ok: false, tool: toolName, error: e?.message || String(e) });
        }
      }
      case 'fill_form': {
        const { formContext = '', fillScope = 'all_fields', skipConfirmation = false } = toolInput || {};
        const userId = pageContext?.userId || 'anonymous';
        console.log('[TOOL fill_form] Starting form fill —', 'userId:', userId, 'scope:', fillScope, 'context:', formContext || 'none');
        const { getUserProfileFlat } = await import('../lib/supabase.js');
        const { data: flatProfile, error: profileError } = await getUserProfileFlat(userId);
        if (profileError || !flatProfile) {
          return JSON.stringify({
            success: false,
            action: 'fill_form_error',
            errorType: 'no_profile',
            message:
              "You haven't saved any personal details yet. Say 'Save my details' followed by your information, and I'll remember it for future form fills."
          });
        }
        const { getUserProfile } = await import('../lib/supabase.js');
        const { data: fullProfile } = await getUserProfile(userId);
        let scopedProfile = flatProfile;
        if (fillScope !== 'all_fields' && fullProfile?.details) {
          const categoryMap = {
            personal_only: ['personal'],
            academic_only: ['academic'],
            professional_only: ['professional']
          };
          const allowedCategories = categoryMap[fillScope] || [];
          const scopedDetails = {};
          for (const cat of allowedCategories) {
            if (fullProfile.details[cat]) scopedDetails[cat] = fullProfile.details[cat];
          }
          scopedProfile = flattenForScope(scopedDetails);
        }
        const profileFieldCount = Object.keys(scopedProfile || {}).length;
        if (profileFieldCount === 0) {
          return JSON.stringify({
            success: false,
            action: 'fill_form_error',
            errorType: 'empty_scope',
            message: `No ${fillScope.replace('_only', '')} details found in your profile. Save some details first.`
          });
        }
        let formFields = Array.isArray(pageContext?.formFields) ? pageContext.formFields : [];
        if (!formFields.length && pageContext?.content) {
          const detectResult = await callClaude({
            systemPrompt:
              'You are a form field detector. Analyze the webpage content and identify all fillable form fields. Return ONLY a JSON array. No other text.\n\nEach field object:\n{\n  "selector": "CSS selector or field identifier",\n  "label": "visible label text",\n  "placeholder": "placeholder text if any",\n  "fieldType": "text|email|tel|number|select|radio|checkbox|textarea|date",\n  "name": "field name attribute if visible in content",\n  "required": true or false,\n  "options": ["for select/radio only — array of option values"]\n}',
            messages: [
              {
                role: 'user',
                content: `Page: ${pageContext.title}\nURL: ${pageContext.url}\n\nContent:\n${pageContext.content}`
              }
            ],
            tools: null,
            maxTokens: 1200
          });
          if (detectResult?.success) {
            try {
              const raw = (extractTextFromContent(detectResult.content) || '')
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
              formFields = JSON.parse(raw);
            } catch {
              formFields = [];
            }
          }
        }
        if (!formFields.length) {
          return JSON.stringify({
            success: false,
            action: 'fill_form_error',
            errorType: 'no_fields',
            message:
              "I couldn't detect any fillable form fields on this page. Make sure you're on a page with a form, then try again."
          });
        }
        const mappingResult = await callClaude({
          systemPrompt:
            'You are an expert at mapping personal profile data to web form fields. Your job is to intelligently match values from a user\'s profile to the correct form fields.\n\nRules for matching:\n- Match by semantic meaning, not exact text: "Full Name" matches "fullName", "Student Name", "Applicant Name", "Name of candidate"\n- For email fields: always use the email value\n- For phone/mobile fields: use the phone value\n- For date fields: format as YYYY-MM-DD unless field clearly expects another format\n- For select/dropdown fields: choose the closest matching option from the options array\n- For radio buttons: select the option that matches the profile value\n- For checkboxes: check if the profile indicates this option applies\n\nNEVER fill these field types (return "SKIP" for these):\n- Password fields\n- CAPTCHA fields\n- File upload fields\n- Fields labeled "confirm password" or "verify email" (already handled)\n- Hidden fields\n\nReturn ONLY a JSON array of fill instructions. No other text.\n\nEach instruction:\n{\n  "selector": "exact selector from the form fields list",\n  "value": "the value to fill in",\n  "fieldType": "text|email|tel|select|radio|checkbox|textarea|date",\n  "fieldLabel": "the field\'s label (for display in review UI)",\n  "confidence": "high|medium|low",\n  "skip": false,\n  "skipReason": null\n}\n\nFor fields that should be skipped:\n{\n  "selector": "...",\n  "fieldLabel": "...",\n  "skip": true,\n  "skipReason": "reason why this field cannot be filled"\n}',
          messages: [
            {
              role: 'user',
              content: `Form context: ${formContext || pageContext.title || 'Unknown form'}\nPage URL: ${pageContext.url}\n\nUser's profile (flat key-value):\n${JSON.stringify(scopedProfile, null, 2)}\n\nForm fields detected on page:\n${JSON.stringify(formFields, null, 2)}\n\nMap the user's profile values to the correct form fields.`
            }
          ],
          tools: null,
          maxTokens: 1500
        });
        if (!mappingResult?.success) {
          return JSON.stringify({
            success: false,
            action: 'fill_form_error',
            errorType: 'mapping_failed',
            message: 'Could not map your profile to the form fields. Please try again.'
          });
        }
        let fillInstructions;
        try {
          const raw = (extractTextFromContent(mappingResult.content) || '')
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          fillInstructions = JSON.parse(raw);
        } catch (e) {
          return JSON.stringify({
            success: false,
            action: 'fill_form_error',
            errorType: 'parse_failed',
            message: 'Received an invalid mapping response. Please try again.'
          });
        }
        const toFill = Array.isArray(fillInstructions) ? fillInstructions.filter((f) => !f?.skip) : [];
        const skipped = Array.isArray(fillInstructions) ? fillInstructions.filter((f) => f?.skip) : [];
        const highConf = toFill.filter((f) => f?.confidence === 'high').length;
        const lowConf = toFill.filter((f) => f?.confidence === 'low').length;
        if (toFill.length === 0) {
          return JSON.stringify({
            success: false,
            action: 'fill_form_error',
            errorType: 'no_matches',
            message:
              `Found ${formFields.length} form fields but none matched your saved profile. Your profile may be missing the required information. Try saving more details.`
          });
        }
        console.log(
          '[TOOL fill_form] Mapping complete —',
          'fillable:',
          toFill.length,
          'skipped:',
          skipped.length,
          'high confidence:',
          highConf,
          'low confidence:',
          lowConf
        );
        return JSON.stringify({
          success: true,
          action: 'fill_form_ready',
          fillInstructions: toFill,
          skippedFields: skipped,
          stats: {
            totalFormFields: formFields.length,
            fieldsToFill: toFill.length,
            fieldsSkipped: skipped.length,
            highConfidence: highConf,
            lowConfidence: lowConf
          },
          requiresReview: lowConf > 0,
          skipConfirmation: !!skipConfirmation,
          message: `Ready to fill ${toFill.length} field${toFill.length !== 1 ? 's' : ''} (${highConf} high confidence, ${lowConf} needs review)`
        });
      }
      case 'extract_structured_data': {
        try {
          const dataType = typeof toolInput?.dataType === 'string' ? toolInput.dataType : 'list';
          console.log(
            `[TOOL] Executing extract_structured_data — dataType: ${dataType}`
          );
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
          console.log(
            `[TOOL] Executing generate_outreach_message — purpose: ${purpose}, tone: ${tone}`
          );
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
          console.log(
            `[TOOL] Executing generate_cover_letter — tone: ${tone}`
          );
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
          console.log(
            `[TOOL] Executing explain_concept — audience: ${targetAudience}, concept: ${conceptToExplain ? conceptToExplain.slice(0, 60) : ''}`
          );
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
