import { Router } from 'express';
import { z } from 'zod';
import type { UseCases } from '../../../composition.ts';
import { parseInput } from '../parse.ts';

const runBody = z.object({ scheduleId: z.number().int().positive().optional() });

export function scheduleRoutes(uc: UseCases): Router {
  const router = Router();

  router.post('/generate', async (_req, res) => {
    res.status(201).json(await uc.generateSchedule.execute());
  });

  router.get('/latest', async (_req, res) => {
    res.json(await uc.getLatestSchedule.execute());
  });

  // The body is optional; without a scheduleId the latest schedule runs.
  router.post('/run', async (req, res) => {
    const { scheduleId } = parseInput(runBody, req.body ?? {}, 'body');
    res.json(await uc.runSchedule.execute({ scheduleId }));
  });

  return router;
}
