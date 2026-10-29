import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound('Route not found'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof ZodError) e = AppError.badRequest('Validation failed', err.flatten());
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    e = AppError.conflict('Duplicate resource');
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') e = AppError.notFound();
  else if (err instanceof SyntaxError && 'body' in (err as object)) e = AppError.badRequest('Malformed JSON body');
  else {
    logger.error({ err, path: req.path }, 'Unhandled error');
    e = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
  }
  if (e.statusCode >= 500 && e.code !== 'INTERNAL_ERROR') logger.error({ code: e.code, msg: e.message }, 'Server error');
  res.status(e.statusCode).json({
    success: false,
    message: e.message,
    error: { code: e.code, message: e.message, details: e.details },
  });
}
