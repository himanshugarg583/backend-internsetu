import { z } from 'zod';

export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });
export const pageQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(100).optional(),
});
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');
export const otpCode = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits');

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const dateRangeQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });
export const sortQuery = <T extends [string, ...string[]]>(fields: T) =>
  z.object({ sortBy: z.enum(fields).optional(), sortOrder: z.enum(['asc', 'desc']).optional() });
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
