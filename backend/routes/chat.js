import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import config from '../lib/config.js';
import supabase, {
  saveMessage,
  getUserPreferences,
  getUserCorrections
} from '../lib/supabase.js';
import { runAgent } from '../agent/orchestrator.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { message, pageContext, sessionId, userId } = req.body || {};
    let msgStr = typeof message === 'string' ? message : '';
    const hadHtml = /<[^>]*>/i.test(msgStr);
    if (hadHtml) {
      console.warn('[SECURITY] message contained HTML tags; stripping');
    }
    msgStr = msgStr.replace(/<[^>]*>/g, '').replace(/\0/g, '');
    if (msgStr.length > 2000) {
      console.warn('[SECURITY] message length exceeded 2000; truncating');
      msgStr = msgStr.slice(0, 2000);
    }
    msgStr = msgStr.trim();
    const details = [];
    if (!msgStr) details.push('message is required and must be a non-empty string');
    if (!pageContext || typeof pageContext !== 'object') {
      details.push('pageContext is required');
    } else {
      if (!pageContext.url || typeof pageContext.url !== 'string') details.push('pageContext.url is required');
      if (!pageContext.content || typeof pageContext.content !== 'string') details.push('pageContext.content is required');
    }
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) details.push('sessionId is required');
    if (details.length) {
      return res.status(400).json({ error: 'Validation failed', details: details.join('; ') });
    }

    const { url, title, content, pageType } = pageContext;
    console.log(
      `[CHAT ROUTE] Request received — userId: ${userId || 'anonymous'}, sessionId: ${sessionId}, pageType: ${pageType || 'unknown'}, messageLen: ${msgStr.length}`
    );

    let sanitizedContent = String(content || '').replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
    if (sanitizedContent.length > config.MAX_PAGE_CONTENT_CHARS) {
      const originalLen = sanitizedContent.length;
      sanitizedContent = sanitizedContent.slice(0, config.MAX_PAGE_CONTENT_CHARS);
      console.warn(
        `[CHAT ROUTE] Content truncated — from: ${originalLen}, to: ${sanitizedContent.length}`
      );
    }
    if (/(ignore previous instructions|you are now)/i.test(sanitizedContent)) {
      console.warn('[SECURITY] possible prompt injection phrases detected in page content');
    }

    let userPreferences = null;
    let userCorrections = [];
    if (userId) {
      const [prefs, corrections] = await Promise.all([
        getUserPreferences(userId),
        getUserCorrections(userId)
      ]);
      userPreferences = prefs?.data || null;
      userCorrections = corrections?.data || [];
    }

    const upsert = await supabase
      .from('sessions')
      .upsert(
        [
          {
            id: sessionId,
            user_id: userId || null,
            page_url: url || null,
            page_title: title || null,
            page_type: pageType || null
          }
        ],
        { onConflict: 'id' }
      )
      .select('id')
      .single();
    if (upsert.error) {
      console.error('[DB] Failed to upsert session:', upsert.error);
    }

    const userMsg = await saveMessage(sessionId, userId || null, 'user', msgStr, null);
    if (userMsg.error) {
      console.error('[DB] Failed to save user message:', userMsg.error);
    }

    let agentResult;
    try {
      agentResult = await runAgent({
        message: msgStr,
        pageContext: { url, title, content: sanitizedContent, pageType },
        userId,
        sessionId,
        userPreferences,
        userCorrections
      });
    } catch (err) {
      if (err && err.providerErrorType) {
        const response = {
          error: err.message || 'AI provider call failed',
          errorType: err.providerErrorType,
          details: process.env.NODE_ENV !== 'production' ? err.devMessage : undefined
        };
        if (err.retryAfter) {
          res.setHeader('Retry-After', err.retryAfter);
        }
        return res.status(err.httpStatus || 503).json(response);
      }
      return res.status(500).json({ error: 'Agent failed', details: err?.message || String(err) });
    }

    const messageId = uuidv4();

    Promise.resolve()
      .then(() =>
        saveMessage(sessionId, userId || null, 'assistant', agentResult.response, agentResult.toolUsed)
      )
      .catch((err) => console.error('[DB] Failed to save assistant message:', err));

    return res.json({
      response: agentResult.response,
      toolUsed: agentResult.toolUsed,
      toolsCalledChain: agentResult.toolsCalledChain || [],
      iterations: agentResult.iterations ?? 0,
      messageId,
      sessionId,
      usage: {
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens
      },
      fillPayload: agentResult.fillPayload || null
    });
  } catch (err) {
    next(err);
  }
});

export default router;
