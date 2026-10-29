import { z } from 'zod';
import { email, pageQuery, sortQuery, idParams } from './common';

export const enquiryTypes = ['GENERAL', 'ENROLLMENT', 'TASK_SUBMISSION', 'PAYMENT', 'CERTIFICATE', 'TECHNICAL', 'OTHER'] as const;
export const enquiryStatuses = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export const createEnquirySchema = {
  body: z.object({
    name: z.string().trim().min(1).max(100),
    email,
    subject: z.string().trim().min(1).max(150),
    type: z.enum(enquiryTypes),
    message: z.string().trim().min(10).max(1000),
    consent: z.literal(true),
    /** Honeypot: must stay empty. */
    website: z.string().max(0).optional(),
  }),
};

export const listEnquiriesSchema = {
  query: pageQuery
    .extend({ status: z.enum(enquiryStatuses).optional(), type: z.enum(enquiryTypes).optional() })
    .merge(sortQuery(['createdAt', 'status'])),
};

export const updateEnquirySchema = {
  params: idParams,
  body: z.object({ status: z.enum(enquiryStatuses).optional(), adminNote: z.string().trim().max(1000).nullable().optional() }),
};
