import { Router } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';
import { scheduleController } from '../controller/schedule-controller.ts';

export function scheduleRoutes(uc: UseCases): Router {
  const controller = scheduleController(uc);
  const router = Router();

  router.post('/generate', controller.generate);
  router.get('/latest', controller.latest);
  router.post('/run', controller.run);

  return router;
}
