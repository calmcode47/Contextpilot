import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

router.get('/', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

const testRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit reached',
      errorType: 'RATE_LIMITED',
      message: 'Test rate limit: 5 requests per minute'
    });
  }
});

router.get('/ratelimit-test', testRateLimiter, (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Request counted' });
});

export default router;
