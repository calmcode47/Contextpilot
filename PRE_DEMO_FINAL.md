# ContextPilot — Pre-Demo Final Checklist
## Run this 30 minutes before presenting

### Backend (2 minutes)
- [ ] `cd backend && npm run dev` — starts without errors
- [ ] Terminal shows: "AI provider: gemini model: gemini-2.0-flash"
- [ ] Terminal shows environment banner
- [ ] No startup warnings about unreliable models

### Quick Verification (5 minutes)
- [ ] `./verify-tools.sh http://localhost:3001`
      Expected: "✅ Tool calling is working! Tool used: summarize_page" and serialization OK
- [ ] `./test-api.sh http://localhost:3001` (or Railway URL)
      Expected: Majority passing; correction-loop prints Step 1–5 outcomes

### Extension (3 minutes)
- [ ] Open chrome://extensions — zero error badges on ContextPilot
- [ ] Open Gmail — badge shows "📧 Gmail"
- [ ] Preset shows "✉️ Draft Reply", "📋 Summarize Thread", "✅ Action Items"
- [ ] Open a LinkedIn profile — badge shows "💼 LinkedIn Profile"
- [ ] Preset shows "🤝 Generate Outreach", "📝 Summarize Profile"
- [ ] Press Ctrl+Shift+D — debug panel opens showing backend URL

### Demo Scenarios — Quick Fire (10 minutes)
#### Scenario 1: Gmail
- [ ] Open an email thread
- [ ] Click "✉️ Draft Reply"
- [ ] Response appears with 🔧 draft_email_reply tool badge
- [ ] Token count is non-zero
- [ ] Click thumbs down → type correction → submit → toast appears

#### Scenario 2: LinkedIn
- [ ] Navigate to a profile
- [ ] Panel updates (SPA detection working — green dot flashes)
- [ ] Click "🤝 Generate Outreach"
- [ ] Response references profile specifics
- [ ] Tool badge shows 🔧 generate_outreach_message

#### Scenario 3: Multi-Step Agent
- [ ] Open a documentation/Wikipedia article
- [ ] Prompt: "Summarize this and tell me the 3 most important takeaways"
- [ ] Response shows toolsCalledChain with 2 tools
- [ ] Iterations > 1

### If Railway (Production Demo)
- [ ] Run `./pre-demo-check.sh https://your-app.up.railway.app`
      Expected: "🚀 READY TO DEMO"
- [ ] extension/config.js points to Railway URL (not localhost)
- [ ] Reload the extension after config change

### Backup
- [ ] Backup demo video available locally
- [ ] Video plays correctly (test once)
- [ ] Video accessible in 2 locations (laptop + USB)

### Environment
- [ ] Browser zoom: 125% for audience visibility
- [ ] Close unrelated tabs
- [ ] Phone silenced
- [ ] Charger plugged in
