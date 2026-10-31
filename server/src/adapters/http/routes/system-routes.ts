import { Router } from 'express';
import type { UseCases } from '../../../composition.ts';
import { NotFoundError } from '../../../domain/model/errors.ts';

export interface SystemRouteOptions {
  /** The sample-data reset wipes everything, so it can be switched off (it is off in production). */
  enableDevRoutes: boolean;
}

export function systemRoutes(uc: UseCases, options: SystemRouteOptions): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/machines', async (_req, res) => {
    res.json(await uc.listMachines.execute());
  });

  router.get('/dashboard', async (_req, res) => {
    res.json(await uc.getDashboard.execute());
  });

  router.post('/dev/reset-sample', async (_req, res) => {
    if (!options.enableDevRoutes) throw new NotFoundError('Route not found');
    res.json(await uc.resetSampleData.execute());
  });

  return router;
}
