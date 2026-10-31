import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import type { UseCases } from '../../composition.ts';
import { NotFoundError } from '../../domain/model/errors.ts';
import { toErrorResponse } from './error-mapper.ts';
import { executionRoutes } from './routes/execution-routes.ts';
import { jobRoutes } from './routes/job-routes.ts';
import { scheduleRoutes } from './routes/schedule-routes.ts';
import { systemRoutes } from './routes/system-routes.ts';

export interface AppOptions {
  enableDevRoutes?: boolean;
  /** Called once per request with a one-line summary; omit to stay silent. */
  log?: (line: string) => void;
}

const requestLogger = (log: (line: string) => void): RequestHandler => (req, res, next) => {
  const started = performance.now();
  res.on('finish', () => {
    log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - started)}ms`);
  });
  next();
};

export function createApp(uc: UseCases, options: AppOptions = {}): Express {
  const app = express();
  if (options.log) app.use(requestLogger(options.log));
  app.use(express.json());

  app.use('/api/jobs', jobRoutes(uc));
  app.use('/api/schedules', scheduleRoutes(uc));
  app.use('/api/executions', executionRoutes(uc));
  app.use('/api', systemRoutes(uc, { enableDevRoutes: options.enableDevRoutes ?? true }));

  app.use((req, _res, next) => next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`)));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const { status, body } = toErrorResponse(error);
    if (status === 500) console.error(error);
    res.status(status).json(body);
  };
  app.use(errorHandler);

  return app;
}
