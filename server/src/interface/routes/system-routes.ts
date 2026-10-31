import { Router } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';
import { systemController, type SystemControllerOptions } from '../controller/system-controller.ts';

export function systemRoutes(uc: UseCases, options: SystemControllerOptions): Router {
  const controller = systemController(uc, options);
  const router = Router();

  router.get('/health', controller.health);
  router.get('/machines', controller.machines);
  router.get('/dashboard', controller.dashboard);
  router.post('/dev/reset-sample', controller.resetSample);

  return router;
}
