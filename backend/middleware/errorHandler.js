export function errorHandler(err, req, res, next) {
  const statusCode = err?.status || err?.statusCode || 500;
  const message = err?.message || 'Internal server error';
  const ts = new Date().toISOString();
  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  if (isDev) {
    console.error(`[${ts}] ${req.method} ${req.originalUrl} ${statusCode} ${message}`);
    if (err?.stack) console.error(err.stack);
  } else {
    console.error(`[${ts}] ${req.method} ${req.originalUrl} ${statusCode} ${message}`);
  }
  const body = {
    error: message,
    statusCode,
    timestamp: ts
  };
  if (isDev && err?.stack) {
    body.stack = err.stack;
  }
  res.status(statusCode).json(body);
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    const code = res.statusCode;
    const line = `${req.method} ${req.originalUrl} ${code} ${dur}ms`;
    if (code >= 500) {
      console.error(`🟥 ${line}`);
    } else if (code >= 400) {
      console.warn(`🟨 ${line}`);
    } else if (code >= 300) {
      console.log(`🟦 ${line}`);
    } else {
      console.log(`🟩 ${line}`);
    }
  });
  next();
}

export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
