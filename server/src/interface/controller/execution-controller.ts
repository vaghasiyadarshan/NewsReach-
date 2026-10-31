import type { RequestHandler } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';
import { parseInput } from '../validation/parse.ts';
import { executionIdParams, listExecutionsQuery } from '../validation/schemas.ts';

export function executionController(uc: UseCases) {
  const list: RequestHandler = async (req, res) => {
    const { scheduleId } = parseInput(listExecutionsQuery, req.query, 'query');
    res.json(await uc.listExecutions.execute({ scheduleId }));
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = parseInput(executionIdParams, req.params, 'params');
    res.json(await uc.getExecution.execute(id));
  };

  return { list, get };
}
