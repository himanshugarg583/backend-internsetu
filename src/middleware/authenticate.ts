import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { userModel } from '../models/user.model';

interface AccessPayload {
  sub: string;
  role: 'STUDENT' | 'ADMIN';
  tv: number;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw AppError.unauthorized();
    let payload: AccessPayload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired access token');
    }
    const user = await userModel.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) throw AppError.unauthorized('Session is no longer valid');
    if (user.status === 'BLOCKED') throw AppError.forbidden('Account is blocked');
    req.user = { id: user.id, role: user.role };
    next();
  } catch (e) {
    next(e);
  }
}
