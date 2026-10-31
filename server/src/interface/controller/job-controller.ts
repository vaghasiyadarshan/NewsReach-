import type { RequestHandler } from 'express';
import type { UseCases } from '../../infrastructure/di/composition.ts';

export function jobController(uc: UseCases) {
  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await uc.createJob.execute(req.body));
  };

  const list: RequestHandler = async (_req, res) => {
    res.json(await uc.listJobs.execute());
  };

  const get: RequestHandler = async (req, res) => {
    res.json(await uc.getJob.execute(req.params.id as string));
  };

  const update: RequestHandler = async (req, res) => {
    res.json(await uc.updateJob.execute(req.params.id as string, req.body));
  };

  return { create, list, get, update };
}
