# Feedback UI Manual Smoke Test

Run this on any webpage with the extension open.

## Setup
- Extension panel open on any webpage
- Backend running (local or Railway)
- Supabase accessible

## Test A — Thumbs Up Flow
1. Send any message and get a response
2. Click 👍 thumbs up button
3. Expected: Button turns green/highlighted
4. Expected: Both buttons become disabled (no double-voting)
5. Expected: Brief toast notification appears and auto-dismisses
6. Verify in Supabase: `feedback` table has a new row with `rating: 'positive'`

## Test B — Thumbs Down + Correction Flow
1. Send any message and get a response
2. Click 👎 thumbs down button
3. Expected: Button turns red/highlighted
4. Expected: Correction input appears inline below the message
5. Type: "Always start with a one-sentence summary before any details"
6. Click "Submit Correction"
7. Expected: Toast shows "Correction saved — I'll do better next time"
8. Expected: Correction input disappears
9. Verify in Supabase: `feedback` row exists with the correction text

## Test C — Learning Loop Visible in Terminal
1. After Test B, send another message
2. Check backend terminal output
3. Expected: "[PROMPT BUILDER] Injecting 1 learned correction(s)..."
4. Expected: "[PROMPT BUILDER] Top correction preview: Always start with..."
5. Verify the AI response starts with a one-sentence summary

## Test D — Skip Correction Flow
1. Click 👎 on another message
2. Click "Skip" (submits without correction text)
3. Expected: Toast appears
4. Verify in Supabase: row exists with `rating: 'negative'`, `correction: null`
