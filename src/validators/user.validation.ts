import { z } from 'zod';
import { email, idParams, pageQuery, password, sortQuery, uuid } from './common';

export const updateMeSchema = {
  body: z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
      college: z.string().trim().min(2).max(200),
      course: z.string().trim().min(2).max(100),
      academicYear: z.string().trim().min(1).max(20),
    })
    .partial(),
};

export const adminListUsersSchema = {
  query: pageQuery.merge(sortQuery(['createdAt', 'name', 'email'])).extend({
    status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
    domainId: uuid.optional(),
    enrollmentStatus: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'NONE']).optional(),
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
    emailVerified: z.boolean().default(true),
  }),
};