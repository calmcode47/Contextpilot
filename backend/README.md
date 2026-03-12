ContextPilot Backend

ContextPilot is an AI-powered browser assistant. This backend exposes secure HTTP endpoints built with Node.js 20+ and Express, integrates with Claude via @anthropic-ai/sdk, and persists data with Supabase. It includes CORS for Chrome extensions, JSON body parsing, rate limiting readiness, and centralized configuration via environment variables.

Getting Started

- Install dependencies:

  npm install

- Copy environment template and fill in values:

  cp .env.example .env

- Run in development:

  npm run dev

- Run in production:

  npm start
