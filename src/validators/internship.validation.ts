import { z } from 'zod';
import { dateRangeQuery, idParams, pageQuery, sortQuery, uuid } from './common';

export const enrollSchema = {
  body: z.object({
    domainId: uuid,
    durationWeeks: z.number().int().positive(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  }),
};

export const enrollmentIdSchema = { params: idParams };

export const adminListInternshipsSchema = {
  query: pageQuery
    .merge(dateRangeQuery)
    .merge(sortQuery(['createdAt', 'startDate', 'endDate', 'internId', 'status']))
    .extend({ domainId: uuid.optional(), status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional() }),
};

export const cancelInternshipSchema = { params: idParams, body: z.object({ reason: z.string().trim().min(3).max(500) }) };
