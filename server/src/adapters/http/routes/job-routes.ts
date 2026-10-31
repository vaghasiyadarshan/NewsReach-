import { Router } from 'express';
import type { UseCases } from '../../../composition.ts';

export function jobRoutes(uc: UseCases): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    res.status(201).json(await uc.createJob.execute(req.body));
  });

  router.get('/', async (_req, res) => {
    res.json(await uc.listJobs.execute());
  });

  router.get('/:id', async (req, res) => {
    res.json(await uc.getJob.execute(req.params.id));
  });

  router.put('/:id', async (req, res) => {
    res.json(await uc.updateJob.execute(req.params.id, req.body));
  });

  return router;
}
