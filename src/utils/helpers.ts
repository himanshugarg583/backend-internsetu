import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const toDateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const todayUtc = () => toDateOnly(new Date());

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const pagination = (q: { page?: number; limit?: number }) => {
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.min(100, Math.max(1, q.limit ?? 20));
  return { skip: (page - 1) * limit, take: limit, page, limit };
};

export const paged = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  meta: { total, page, limit, pages: Math.ceil(total / limit) },
});

export const isHost = (url: string, hosts: string[]) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return hosts.some((host) => h === host || h.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

/** Inclusive YYYY-MM-DD range ? Prisma date filter (to is inclusive of the whole day). */
export const dateFilter = (from?: string, to?: string) =>
  from || to
    ? {
        ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
        ...(to && { lt: addDays(new Date(`${to}T00:00:00.000Z`), 1) }),
      }
    : undefined;

/** Builds an orderBy from already-whitelisted (validated) sort params. */
export const orderBy = <F extends string>(sortBy: F | undefined, sortOrder: 'asc' | 'desc' | undefined, fallback: F, fallbackOrder: 'asc' | 'desc' = 'desc') =>
  ({ [sortBy ?? fallback]: sortOrder ?? (sortBy ? 'desc' : fallbackOrder) }) as Record<F, 'asc' | 'desc'>;
