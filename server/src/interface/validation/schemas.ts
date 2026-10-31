import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

/** Optional body of POST /schedules/run. */
export const runScheduleBody = z.object({ scheduleId: z.number().int().positive().optional() });

/** `:id` path parameter of the execution routes. */
export const executionIdParams = z.object({ id: positiveInt });

/** Query string of GET /executions. */
export const listExecutionsQuery = z.object({ scheduleId: positiveInt.optional() });
