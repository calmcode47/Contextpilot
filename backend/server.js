import config from './lib/config.js';
import app from './app.js';

const PORT = config.PORT;
const ENV = config.NODE_ENV;

// If Vercel imports this file, we should NOT call app.listen() (serverless runtime).
// The actual request handling is done via backend/api/index.js + serverless-http.
const runningOnVercel = Boolean(process.env.VERCEL);
if (!runningOnVercel) {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║         ContextPilot API Server        ║
╠════════════════════════════════════════╝
║  Environment: ${String(ENV).padEnd(24)}║
║  Port:        ${String(PORT).padEnd(24)}║
║  AI Provider: ${String(config.AI_PROVIDER || 'gemini').padEnd(24)}║
║  Supabase:    connected                ║
╚════════════════════════════════════════╝
`);
  });
} else {
  console.log('[server.js] Detected Vercel runtime — skipping app.listen().');
}

/* Legacy local server bootstrap (kept for reference; not executed in Vercel deployments)

import express from 'express';
import cors from 'cors';

import config from './lib/config.js';
import { validateAIProviderConfig } from './lib/config.js';
import { corsOptions, generalLimiter, chatLimiter, feedbackLimiter } from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';

import chatRoutes from './routes/chat.js';
import feedbackRoutes from './routes/feedback.js';
import historyRoutes from './routes/history.js';
import pingRoutes from './routes/ping.js';
import profileRoutes from './routes/profile.js';
import { validateDatabaseSchema } from './lib/supabase.js';

const app = express();

console.log(`AI provider: ${config.AI_PROVIDER} model: ${config.AI_PROVIDER === 'anthropic' ? config.ANTHROPIC_MODEL : config.GEMINI_MODEL}`);

if (config.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

validateAIProviderConfig();
await validateDatabaseSchema();

app.use(generalLimiter);
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.removeHeader('X-Powered-By');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  const ts = new Date().toISOString();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${ts} ${elapsedMs.toFixed(1)}ms`);
  });
  next();
});

app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/feedback', feedbackLimiter, feedbackRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/ping', pingRoutes);
app.use('/api/profile', profileRoutes);

// Handle CORS preflight for all routes
// Note: CORS preflights are handled by the global cors middleware above.

// Friendly root endpoint for quick connectivity checks
app.get('/', (req, res) => {
  res.json({
    service: 'ContextPilot API',
    status: 'ok',
    endpoints: ['/health', '/api/ping', 'POST /api/chat', 'GET /api/history', 'POST /api/feedback']
  });
});

app.get('/health', cors(), (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ContextPilot API'
  });
});

app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

app.use(errorHandler);

const PORT = config.PORT;
const ENV = config.NODE_ENV;

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║         ContextPilot API Server        ║
╠════════════════════════════════════════╣
║  Environment: ${String(ENV).padEnd(24)}║
║  Port:        ${String(PORT).padEnd(24)}║
║  AI Provider: ${String(config.AI_PROVIDER || 'gemini').padEnd(24)}║
║  Supabase:    connected                ║
╚════════════════════════════════════════╝
`);
});
*/
