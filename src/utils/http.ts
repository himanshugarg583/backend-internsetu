import { Response } from 'express';
import { env } from '../config/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const v = (res: Response): { body: any; params: any; query: any } => res.locals.v;

export const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export const REFRESH_COOKIE = 'refresh_token';

export const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.isProd,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86400000,
  });

export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });

export const sendPdf = (res: Response, fullPath: string, filename: string) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.download(fullPath, filename, { headers: { 'Content-Type': 'application/pdf' } });
};
