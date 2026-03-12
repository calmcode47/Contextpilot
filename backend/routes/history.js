import { Router } from 'express';
import supabase from '../lib/supabase.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sessionId, userId, limit } = req.query || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'sessionId is required' });
    }

    let lim = parseInt(String(limit ?? '50'), 10);
    if (Number.isNaN(lim) || lim < 1) lim = 50;
    if (lim > 100) lim = 100;

    let query = supabase
      .from('messages')
      .select('id, role, content, tool_used, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(lim);

    if (userId && typeof userId === 'string' && userId.trim().length > 0) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Error', message: 'Failed to fetch session messages' });

    const messages = Array.isArray(data) ? data : [];
    return res.json({
      sessionId,
      messages,
      count: messages.length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
