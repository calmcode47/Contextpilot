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
    .select('id, correction, created_at')
    .eq('user_id', userId)
    .eq('rating', 'negative')
    .not('correction', 'is', null)
    .neq('correction', '')
    .order('created_at', { ascending: false })
    .limit(5);
  return { data, error };
}

export async function validateDatabaseSchema() {
  const requiredTables = ['sessions', 'messages', 'feedback', 'profiles', 'user_profiles'];
  const missing = [];
  const probeColumn = {
    sessions: 'id',
    messages: 'id',
    feedback: 'id',
    profiles: 'user_id',
    user_profiles: 'user_id'
  };
  for (const table of requiredTables) {
    const col = probeColumn[table] || 'id';
    const { error } = await supabase.from(table).select(col).limit(1);
    if (error && error.code === '42P01') {
      missing.push(table);
      console.error(`[SUPABASE] ❌ Table missing: ${table}`);
    } else if (error && !(String(error.code || '').startsWith('PGRST'))) {
      console.warn(`[SUPABASE] ⚠️  Table check warning for ${table}: ${error.message}`);
    } else {
      console.log(`[SUPABASE] ✅ Table verified: ${table}`);
    }
  }
  if (missing.length > 0) {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║  FATAL: Required Supabase tables are missing                 ║
║  Missing tables: ${missing.join(', ')}                       ║
║  Run supabase/schema.sql in your Supabase SQL Editor         ║
║  Dashboard: https://supabase.com/dashboard                   ║
╚══════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }
  console.log('[SUPABASE] All required tables verified ✅');
}

export async function upsertProfile(userId, email) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert([{ user_id: userId, email }], { onConflict: 'user_id' })
    .select('*')
    .single();
  return { data, error };
}

// ---------------------------
// User Profiles (JSONB store)
// ---------------------------

function deepMerge(target, source) {
  const result = { ...(target || {}) };
  if (!source || typeof source !== 'object') return result;
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      result[key] = deepMerge(result[key] || {}, sv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

function flattenProfile(details) {
  const flat = {};
  for (const [category, fields] of Object.entries(details || {})) {
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      for (const [key, val] of Object.entries(fields)) {
        flat[key] = val;
        flat[`${category}_${key}`] = val;
      }
    }
  }
  return flat;
}

export async function upsertUserProfile(userId, parsedDetails) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { data: null, error: new Error('userId is required') };
  }
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('details, display_name, email')
    .eq('user_id', userId)
    .single();
  const mergedDetails = deepMerge(existing?.details || {}, parsedDetails || {});
  const displayName =
    (parsedDetails?.personal && parsedDetails.personal.fullName) ||
    existing?.display_name ||
    null;
  const email =
    (parsedDetails?.personal && parsedDetails.personal.email) ||
    existing?.email ||
    null;
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: userId,
        display_name: displayName,
        email,
        details: mergedDetails,
        last_updated_by: 'agent'
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  return { data, error };
}

export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

export async function getUserProfileFlat(userId) {
  const { data, error } = await getUserProfile(userId);
  if (error || !data) return { data: null, error };
  return { data: flattenProfile(data.details || {}), error: null };
}

export async function updateProfileField(userId, category, field, value) {
  if (!userId || !category || !field) {
    return { data: null, error: new Error('userId, category and field are required') };
  }
  const { data: existing, error: getErr } = await getUserProfile(userId);
  if (getErr) return { data: null, error: getErr };
  const details = existing?.details || {};
  const next = { ...details, [category]: { ...(details[category] || {}), [field]: value } };
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ details: next, last_updated_by: 'agent' })
    .eq('user_id', userId)
    .select()
    .single();
  return { data, error };
}

export async function deleteUserProfile(userId) {
  const { data, error } = await supabase.from('user_profiles').delete().eq('user_id', userId);
  return { data, error };
}
