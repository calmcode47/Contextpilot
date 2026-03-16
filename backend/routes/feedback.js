import { Router } from 'express';
import supabase, { saveUserFeedback, getUserCorrections } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

function normalizeRating(rawRating) {
  if (rawRating === 'positive' || rawRating === 1 || rawRating === '1') return 'positive';
  if (rawRating === 'negative' || rawRating === -1 || rawRating === '-1') return 'negative';
  return null;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { messageId, userId, rating, correction } = req.body || {};
    const normalizedRating = normalizeRating(rating);
    if (!messageId || !userId || !normalizedRating) {
      return res.status(400).json({
        error: 'Invalid rating value',
        details: 'rating must be "positive", "negative", 1, or -1'
      });
    }

    const dup = await supabase
      .from('feedback')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .limit(1);
    if (!dup.error && Array.isArray(dup.data) && dup.data.length > 0) {
      return res.status(409).json({ error: 'Feedback already submitted for this message' });
    }

    const { data, error } = await saveUserFeedback(messageId, userId, normalizedRating, correction ?? null);
    if (error) {
      return res.status(500).json({ error: 'Error', message: 'Failed to save feedback' });
    }

    const learned = normalizedRating === 'negative' && typeof correction === 'string' && correction.trim().length > 0;
    if (learned) {
      const length = correction.trim().length;
      console.log(`[FEEDBACK ROUTE] Correction learned — userId: ${userId}, length: ${length}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Feedback recorded',
      correctionLearned: learned
    });
  })
);

router.get(
  '/corrections/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'Bad Request', message: 'userId is required' });
    }
    const { data, error } = await getUserCorrections(userId);
    if (error) {
      return res.status(500).json({ error: 'Error', message: 'Failed to fetch corrections' });
    }
    return res.json({ userId, corrections: data ?? [] });
  })
);

export default router;
