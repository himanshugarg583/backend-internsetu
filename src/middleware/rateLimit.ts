import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const make = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, try again later' } },
  });

export const globalLimiter = make(60_000, 300);
export const authLimiter = make(15 * 60_000, 30);
export const otpLimiter = make(15 * 60_000, 10);
