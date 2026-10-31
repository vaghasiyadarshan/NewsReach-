import type { RequestHandler } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';
import { parseInput } from '../validation/parse.ts';
import { runScheduleBody } from '../validation/schemas.ts';

export function scheduleController(uc: UseCases) {
  const generate: RequestHandler = async (_req, res) => {
    res.status(201).json(await uc.generateSchedule.execute());
  };

  const latest: RequestHandler = async (_req, res) => {
    res.json(await uc.getLatestSchedule.execute());
  };

  // The body is optional; without a scheduleId the latest schedule runs.
  const run: RequestHandler = async (req, res) => {
    const { scheduleId } = parseInput(runScheduleBody, req.body ?? {}, 'body');
    res.json(await uc.runSchedule.execute({ scheduleId }));
  };

  return { generate, latest, run };
}
