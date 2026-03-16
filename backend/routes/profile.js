import { Router } from 'express';
import {
  upsertUserProfile,
  getUserProfile,
  getUserProfileFlat,
  updateProfileField,
  deleteUserProfile
} from '../lib/supabase.js';

const router = Router();

function isNonEmptyString(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!isNonEmptyString(userId)) {
    return res.status(400).json({ data: null, error: 'userId is required' });
  }
  console.log('[PROFILE ROUTE] GET profile — userId:', userId);
  const { data, error } = await getUserProfile(userId);
  if (error) return res.status(500).json({ data: null, error: error.message || 'Error' });
  return res.json({ data, error: null });
});

router.get('/:userId/flat', async (req, res) => {
  const { userId } = req.params;
  if (!isNonEmptyString(userId)) {
    return res.status(400).json({ data: null, error: 'userId is required' });
  }
  console.log('[PROFILE ROUTE] GET flat profile — userId:', userId);
  const { data, error } = await getUserProfileFlat(userId);
  if (error) return res.status(500).json({ data: null, error: error.message || 'Error' });
  return res.json({ data, error: null });
});

router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!isNonEmptyString(userId)) {
    return res.status(400).json({ data: null, error: 'userId is required' });
  }
  const parsedDetails = req.body?.details || req.body || {};
  console.log('[PROFILE ROUTE] UPSERT profile — userId:', userId);
  const { data, error } = await upsertUserProfile(userId, parsedDetails);
  if (error) return res.status(500).json({ data: null, error: error.message || 'Error' });
  return res.json({ data, error: null });
});

router.patch('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { category, field, value } = req.body || {};
  if (!isNonEmptyString(userId) || !isNonEmptyString(category) || !isNonEmptyString(field)) {
    return res.status(400).json({ data: null, error: 'userId, category and field are required' });
    }
  console.log('[PROFILE ROUTE] UPDATE field — userId:', userId, 'path:', `${category}.${field}`);
  const { data, error } = await updateProfileField(userId, category, field, value ?? null);
  if (error) return res.status(500).json({ data: null, error: error.message || 'Error' });
  return res.json({ data, error: null });
});

router.delete('/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!isNonEmptyString(userId)) {
    return res.status(400).json({ data: null, error: 'userId is required' });
  }
  console.log('[PROFILE ROUTE] DELETE profile — userId:', userId);
  const { data, error } = await deleteUserProfile(userId);
  if (error) return res.status(500).json({ data: null, error: error.message || 'Error' });
  return res.json({ data, error: null });
});

export default router;

