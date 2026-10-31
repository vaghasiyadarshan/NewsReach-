import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from '../../interface/middleware/error-handler.ts';
import { requestLogger } from '../../interface/middleware/request-logger.ts';
import { executionRoutes } from '../../interface/routes/execution-routes.ts';
import { jobRoutes } from '../../interface/routes/job-routes.ts';
import { scheduleRoutes } from '../../interface/routes/schedule-routes.ts';
import { systemRoutes } from '../../interface/routes/system-routes.ts';
import type { UseCases } from '../di/composition.ts';

export interface AppOptions {
  enableDevRoutes?: boolean;
  /** Called once per request with a one-line summary; omit to stay silent. */
  log?: (line: string) => void;
}

export function createApp(uc: UseCases, options: AppOptions = {}): Express {
  const app = express();
  if (options.log) app.use(requestLogger(options.log));
  app.use(express.json());

  app.use('/api/jobs', jobRoutes(uc));
  app.use('/api/schedules', scheduleRoutes(uc));
  app.use('/api/executions', executionRoutes(uc));
  app.use('/api', systemRoutes(uc, { enableDevRoutes: options.enableDevRoutes ?? true }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
