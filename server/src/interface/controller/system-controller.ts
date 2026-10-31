import type { RequestHandler } from 'express';
import { NotFoundError } from '../../application/errors/errors.ts';
import type { UseCases } from '../../infrastructure/di/composition.ts';

export interface SystemControllerOptions {
  /** The sample-data reset wipes everything, so it can be switched off (it is off in production). */
  enableDevRoutes: boolean;
}

export function systemController(uc: UseCases, options: SystemControllerOptions) {
  const health: RequestHandler = (_req, res) => {
    res.json({ status: 'ok' });
  };

  const machines: RequestHandler = async (_req, res) => {
    res.json(await uc.listMachines.execute());
  };

  const dashboard: RequestHandler = async (_req, res) => {
    res.json(await uc.getDashboard.execute());
  };

  const resetSample: RequestHandler = async (_req, res) => {
    if (!options.enableDevRoutes) throw new NotFoundError('Route not found');
    res.json(await uc.resetSampleData.execute());
  };

  return { health, machines, dashboard, resetSample };
}
