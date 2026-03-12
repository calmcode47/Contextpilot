import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import config from './lib/config.js';
import { corsOptions, generalLimiter, chatLimiter, feedbackLimiter } from './middleware/security.js';

import chatRoutes from './routes/chat.js';
import feedbackRoutes from './routes/feedback.js';
import historyRoutes from './routes/history.js';
import pingRoutes from './routes/ping.js';

const app = express();

console.log(`AI provider: ${config.AI_PROVIDER} model: ${config.AI_PROVIDER === 'anthropic' ? config.ANTHROPIC_MODEL : config.GEMINI_MODEL}`);

app.use(generalLimiter);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

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

app.use((err, req, res, next) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : 'Error',
    message
  });
});

const PORT = config.PORT;
const ENV = config.NODE_ENV;

app.listen(PORT, () => {
  console.log(`ContextPilot API listening on port ${PORT} (${ENV})`);
});
