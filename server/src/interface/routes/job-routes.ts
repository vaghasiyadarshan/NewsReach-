import { Router } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';
import { jobController } from '../controller/job-controller.ts';

export function jobRoutes(uc: UseCases): Router {
  const controller = jobController(uc);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);

  return router;
}
