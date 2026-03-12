import { createClient } from '@supabase/supabase-js';
import config from './config.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

export default supabase;

export async function saveMessage(sessionId, userId, role, content, toolUsed) {
  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        session_id: sessionId,
        user_id: userId,
        role,
        content,
        tool_used: toolUsed ?? null
      }
    ])
    .select('*')
    .single();
  return { data, error };
}

export async function getSessionMessages(sessionId, userId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return { data, error };
}

export async function getUserPreferences(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('tone, output_length, focus_areas')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

export async function saveUserFeedback(messageId, userId, rating, correction) {
  const { data, error } = await supabase
    .from('feedback')
    .insert([
      {
        message_id: messageId,
        user_id: userId,
        rating,
        correction: correction ?? null
      }
    ])
    .select('*')
    .single();
  return { data, error };
}

export async function getUserCorrections(userId) {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('user_id', userId)
    .lt('rating', 0)
    .not('correction', 'is', null)
    .neq('correction', '')
    .order('created_at', { ascending: false })
    .limit(5);
  return { data, error };
}

export async function upsertProfile(userId, email) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert([{ user_id: userId, email }], { onConflict: 'user_id' })
    .select('*')
    .single();
  return { data, error };
}
