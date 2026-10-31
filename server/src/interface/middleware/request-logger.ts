import type { RequestHandler } from 'express';

/** Logs one line per request (method, URL, status, duration) once the response is sent. */
export const requestLogger = (log: (line: string) => void): RequestHandler => (req, res, next) => {
  const started = performance.now();
  res.on('finish', () => {
    log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - started)}ms`);
  });
  next();
};
