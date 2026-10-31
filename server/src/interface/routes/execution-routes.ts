import { Router } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';
import { executionController } from '../controller/execution-controller.ts';

export function executionRoutes(uc: UseCases): Router {
  const controller = executionController(uc);
  const router = Router();

  router.get('/', controller.list);
  router.get('/:id', controller.get);

  return router;
}
