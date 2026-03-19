import serverlessHttp from 'serverless-http';
import app from '../app.js';

const wrapped = serverlessHttp(app, {
  // Prevents waiting for the Node event loop to empty (important for serverless environments).
  callbackWaitsForEmptyEventLoop: false
});

export default function handler(req, res) {
  // When using rewrites, some platforms may forward the rewritten path instead of the original one.
  // Best-effort: if an original URI header exists, restore it so Express route matching works.
  try {
    const h = req.headers || {};
    const candidates = [
      'x-original-uri',
      'x-original-url',
      'x-forwarded-uri',
      'x-vercel-forwarded-uri',
      'x-vercel-forwarded-url',
      'x-vercel-forwarded-path',
      'x-matched-path'
    ];
    for (const key of candidates) {
      const v = h[key];
      if (typeof v === 'string' && v.startsWith('/')) {
        req.url = v;
        break;
      }
    }
  } catch {}

  return wrapped(req, res);
}

