import type { ErrorRequestHandler, RequestHandler } from 'express';
import { NotFoundError } from '../../application/errors/errors.ts';
import { toErrorResponse } from './error-mapper.ts';

/** Turns a request that matched no route into a NotFoundError for the error handler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

/** The last middleware: every failure leaves the API as the same JSON error shape. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const { status, body } = toErrorResponse(error);
  if (status === 500) console.error(error);
  res.status(status).json(body);
};
