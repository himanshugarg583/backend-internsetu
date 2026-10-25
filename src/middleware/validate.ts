import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, z } from 'zod';

interface Schemas {
  body?: AnyZodObject;
  params?: AnyZodObject;
  query?: AnyZodObject;
}

export type Validated<S extends Schemas> = {
  body: S['body'] extends AnyZodObject ? z.infer<S['body']> : undefined;
  params: S['params'] extends AnyZodObject ? z.infer<S['params']> : undefined;
  query: S['query'] extends AnyZodObject ? z.infer<S['query']> : undefined;
};

/** Validates request parts; parsed values are stored on res.locals.v (ZodErrors handled by errorHandler). */
export const validate =
  (schemas: Schemas) => (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.v = {
        body: schemas.body ? schemas.body.strict().parse(req.body ?? {}) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
      };
      next();
    } catch (e) {
      next(e);
    }
  };
