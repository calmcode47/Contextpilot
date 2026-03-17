# ContextPilot

ContextPilot is an AI-powered Chrome side-panel assistant that understands the current webpage and can summarize, answer questions, draft content, and (optionally) help fill forms using saved profile details.

This repo contains:
- `backend/`: Node.js + Express API, agent loop + tools, Supabase persistence, Gemini/Anthropic provider wrapper.
- `extension/`: Chrome Extension (Manifest V3) side panel UI + content extraction + form scanning/fill.

---

## Requirements
- Node.js **20+** (recommended: latest LTS)
- A Supabase project (URL + keys)
- A Gemini API key (Google AI Studio / Gemini API)

---

## Quick start (local)

### 1) Backend setup
```bash
cd backend
npm install
```

Create `backend/.env` (example keys shown; do not commit secrets):
```env
PORT=3001
NODE_ENV=development

AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=gemini-2.5-flash

SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

EXTENSION_ORIGIN=*
MAX_PAGE_CONTENT_CHARS=8000
```

Run the backend:
```bash
npm run dev
```

Health check:
```bash
curl -s http://localhost:3001/health
```

### 2) Load the Chrome extension
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Open the ContextPilot side panel on any webpage

If you deploy the backend (e.g., Railway), update `extension/config.js`:
- `API_BASE_URL`: set to your deployed URL

---

## How to use

### Common prompts
- “Summarize this page”
- “Answer this question using this page: …”
- “Draft a professional reply to this email”
- “Extract pricing/specs from this page”

### Form intelligence (optional)
Recommended flow for best reliability:
1) Save details:
> “Save my details: Name: …, Email: …, Phone: …”

2) On a form page:
> “Fill this form for me”

The assistant will prepare a review payload and the extension will fill fields (it will **not** submit the form).

---

## Testing

Backend test assets live in `backend/test/`.

API test suite:
```bash
cd backend
bash test/test-api.sh http://localhost:3001
```

Environment check:
```bash
cd backend
bash test/check-env.sh
```

---

## Troubleshooting (Gemini)

### 503 “high demand”
This is Gemini model overload. ContextPilot retries automatically and can fall back to a more stable Gemini model when needed.

### 429 “RESOURCE_EXHAUSTED”
This is a quota/rate-limit response. ContextPilot respects Gemini’s retry delay and avoids quota-burning retries.

If you consistently see 429:
- Verify your quotas at `https://ai.dev/rate-limit`
- Reduce request volume (avoid sending multiple prompts rapidly)
- Wait the `Retry-After` seconds shown and retry

---

## Security notes
- Never commit `.env` files or API keys.
- Use `SUPABASE_SERVICE_ROLE_KEY` only on the server (backend).

