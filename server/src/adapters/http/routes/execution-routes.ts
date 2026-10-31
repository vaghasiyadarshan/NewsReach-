import { Router } from 'express';
import { z } from 'zod';
import type { UseCases } from '../../../composition.ts';
import { parseInput } from '../parse.ts';

const positiveInt = z.coerce.number().int().positive();
const idParams = z.object({ id: positiveInt });
const listQuery = z.object({ scheduleId: positiveInt.optional() });

export function executionRoutes(uc: UseCases): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { scheduleId } = parseInput(listQuery, req.query, 'query');
    res.json(await uc.listExecutions.execute({ scheduleId }));
  });

  router.get('/:id', async (req, res) => {
    const { id } = parseInput(idParams, req.params, 'params');
    res.json(await uc.getExecution.execute(id));
  });

  return router;
}
