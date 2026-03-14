# ContextPilot Deployment Checklist

## Before Deploying

- [ ] All changes committed to GitHub
- [ ] .env file is in .gitignore (never commit secrets)
- [ ] test-api.sh passes locally (at least 12/14 tests)
- [ ] npm start runs without errors (test: NODE_ENV=production node server.js)

## Railway Environment Variables (set these in Railway dashboard)

| Variable | Value | Required |
|---|---|---|
| NODE_ENV | production | ✅ |
| ANTHROPIC_API_KEY | sk-ant-... | ✅ if using Claude |
| GEMINI_API_KEY | AI... | ✅ if using Gemini |
| AI_PROVIDER | gemini | ✅ |
| GEMINI_MODEL | gemini-2.0-flash | ✅ |
> Note: Do not use `gemini-1.5-flash` — it has inconsistent tool/function calling and will break agent tool use.
| SUPABASE_URL | https://xxx.supabase.co | ✅ |
| SUPABASE_ANON_KEY | eyJ... | ✅ |
| SUPABASE_SERVICE_ROLE_KEY | eyJ... | ✅ |
| MAX_PAGE_CONTENT_CHARS | 8000 | ✅ |
| EXTENSION_ORIGIN | chrome-extension://YOUR_ID | ✅ |
| ALLOWED_ORIGINS | (leave empty initially) | ⚠️ |
| VERBOSE_AGENT | false | ✅ |

## After Deploying

- [ ] GET https://your-app.up.railway.app/health returns 200
- [ ] POST /api/chat returns a real AI response (not stub)
- [ ] No errors in Railway deployment logs
- [ ] Extension config.js updated with Railway URL
- [ ] Extension reloaded in chrome://extensions
