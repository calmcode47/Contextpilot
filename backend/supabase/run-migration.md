# Running the Database Migration

## If you get "table does not exist" errors on startup:
1. Open your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New query"
4. Copy the entire contents of `backend/supabase/schema.sql`
5. Paste into the SQL Editor
6. Click "Run" (or press Ctrl+Enter)
7. Verify output shows no errors
8. Restart the backend server

## Verify tables exist:
In Supabase Table Editor, you should see:
- sessions
- messages
- feedback
- profiles
- user_profiles

## If you see RLS errors in backend logs:
Ensure the backend uses `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_ANON_KEY`).
The service role key bypasses all RLS policies.
