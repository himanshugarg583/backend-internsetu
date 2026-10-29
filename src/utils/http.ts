import { Response } from 'express';
import { env } from '../config/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const v = (res: Response): { body: any; params: any; query: any } => res.locals.v;

export function ok(
  res: Response,
  data: unknown,
  messageOrStatus?: string | number,
  status = 200,
) {
  let message = 'Operation successful';
  let httpStatus = status;

  if (typeof messageOrStatus === 'number') {
    httpStatus = messageOrStatus;
    message = httpStatus === 201 ? 'Created successfully' : 'Operation successful';
  } else if (typeof messageOrStatus === 'string') {
    message = messageOrStatus;
  }

  if (
    data &&
    typeof data === 'object' &&
    'message' in data &&
    typeof (data as { message: unknown }).message === 'string' &&
    (!messageOrStatus || messageOrStatus === 'Operation successful')
  ) {
    message = (data as { message: string }).message;
  }

  return res.status(httpStatus).json({ success: true, message, data });
}

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
