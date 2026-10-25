import { z } from 'zod';
import { dateRangeQuery, dateStr, idParams, pageQuery, sortQuery, uuid } from './common';

export const listPaymentsSchema = {
  query: pageQuery
    .merge(dateRangeQuery)
    .merge(sortQuery(['createdAt', 'paidAt', 'totalAmount', 'status']))
    .extend({ status: z.enum(['CREATED', 'PAID', 'FAILED', 'REFUNDED']).optional() }),
};
export const listCertificatesSchema = {
  query: pageQuery
    .merge(sortQuery(['createdAt', 'issueDate', 'verificationId']))
    .extend({ status: z.enum(['VALID', 'REVOKED']).optional(), domainId: uuid.optional() }),
};
export const refundSchema = { params: idParams, body: z.object({ reason: z.string().trim().min(3).max(500) }) };
export const revokeSchema = { params: idParams, body: z.object({ reason: z.string().trim().min(3).max(500) }) };
export const verifySchema = { params: z.object({ uniqueId: z.string().trim().regex(/^[A-Z0-9-]{6,40}$/i) }) };
export const reportSchema = {
  query: z.object({ from: dateStr.optional(), to: dateStr.optional(), groupBy: z.enum(['day', 'month']).default('day') }),
};

export const taskReportSchema = { query: reportSchema.query.extend({ domainId: uuid.optional() }) };

export const activitySchema = { query: z.object({ limit: z.coerce.number().int().positive().max(100).default(20) }) };

export const updateSettingsSchema = {
  body: z
    .object({
      platformName: z.string().trim().min(2).max(100),
      supportEmail: z.string().trim().toLowerCase().email().max(254).nullable(),
      supportPhone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number').nullable(),
      notifications: z
        .object({
          emailOnRegistration: z.boolean(),
          emailOnSubmissionReview: z.boolean(),
          emailOnPayment: z.boolean(),
          emailOnCertificate: z.boolean(),
          adminDigest: z.boolean(),
        })
        .partial()
        .strict(),
    })
    .partial(),
};

export const clientVerifySchema = {
  body: z.object({
    razorpay_order_id: z.string().trim().min(1).max(100),
    razorpay_payment_id: z.string().trim().min(1).max(100),
    razorpay_signature: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'Invalid signature'),
  }),
};