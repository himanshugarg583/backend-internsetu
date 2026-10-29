import { z } from 'zod';
import { boolQuery, email, idParams, pageQuery, password, sortQuery, uuid } from './common';

export const updateMeSchema = {
  body: z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
      college: z.string().trim().min(2).max(200),
      course: z.string().trim().min(2).max(100),
      academicYear: z.string().trim().min(1).max(20),
      dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD').nullable(),
      gender: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']).nullable(),
      city: z.string().trim().min(2).max(100).nullable(),
    })
    .partial(),
};

export const adminListUsersSchema = {
  query: pageQuery.merge(sortQuery(['createdAt', 'name', 'email'])).extend({
    status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
    domainId: uuid.optional(),
    enrollmentStatus: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'NONE']).optional(),
    emailVerified: boolQuery.optional(),
  }),
};

export const adminUserStatusSchema = {
  params: idParams,
  body: z.object({ status: z.enum(['ACTIVE', 'BLOCKED']) }),
};

export const adminCreateUserSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email,
    phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number').optional(),
    password,
    college: z.string().trim().min(2).max(200).optional(),
    course: z.string().trim().min(2).max(100).optional(),
    academicYear: z.string().trim().min(1).max(20).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    emailVerified: z.boolean().default(true),
  }),
};