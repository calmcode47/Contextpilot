import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const staticAllowed = new Set(['http://localhost:3000', 'http://localhost:5173']);

function parseEnvAllowed() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('chrome-extension://')) return callback(null, true);
    if (staticAllowed.has(origin)) return callback(null, true);
    const envAllowed = parseEnvAllowed();
    if (envAllowed.includes(origin)) return callback(null, true);
    const err = new Error('Not allowed by CORS');
    return callback(err, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
  credentials: true
};

function makeLimiter(windowMs, limit, { skip, keyGenerator } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retrySeconds = Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', String(retrySeconds));
      res.status(429).json({ error: 'Too many requests', retryAfter: `${retrySeconds} seconds` });
    },
    skip: typeof skip === 'function' ? skip : undefined,
    keyGenerator:
      typeof keyGenerator === 'function'
        ? keyGenerator
        : (req) => ipKeyGenerator(req)
  });
}

export const generalLimiter = makeLimiter(15 * 60 * 1000, 100, {
  skip: (req) => req.path === '/health'
});
export const chatLimiter = makeLimiter(60 * 1000, 30, {
  skip: (req) => req.path === '/health',
  keyGenerator: (req) => {
    try {
      const id = req.body && req.body.userId;
      if (id && typeof id === 'string' && id.trim().length > 0) return `user:${id}`;
    } catch {}
    return ipKeyGenerator(req);
  }
});
export const feedbackLimiter = makeLimiter(15 * 60 * 1000, 30, {
  skip: (req) => req.path === '/health',
  keyGenerator: (req) => {
    try {
      const id = req.body && req.body.userId;
      if (id && typeof id === 'string' && id.trim().length > 0) return `user:${id}`;
    } catch {}
    return ipKeyGenerator(req);
  }
});
