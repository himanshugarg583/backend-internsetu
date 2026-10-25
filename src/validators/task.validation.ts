import { z } from 'zod';
import { boolQuery, dateRangeQuery, idParams, pageQuery, sortQuery, uuid } from './common';

const taskBody = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(5000),
  sequence: z.number().int().min(0),
  isJoiningTask: z.boolean().default(false),
  requiresGithub: z.boolean().default(false),
  requiresLinkedin: z.boolean().default(false),
});

export const createTaskSchema = { params: idParams, body: taskBody };
export const updateTaskSchema = {
  params: idParams,
  body: taskBody.omit({ isJoiningTask: true }).partial().extend({
    requiresGithub: z.boolean().optional(),
    requiresLinkedin: z.boolean().optional(),
  }),
};
export const taskStatusSchema = { params: idParams, body: z.object({ isActive: z.boolean() }) };

export const submitTaskSchema = {
  params: z.object({ id: uuid, taskId: uuid }),
  body: z.object({
    githubUrl: z.string().trim().url().max(500).optional(),
    linkedinUrl: z.string().trim().url().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
};

export const listSubmissionsSchema = {
  query: pageQuery.merge(dateRangeQuery).merge(sortQuery(['submittedAt', 'reviewedAt', 'createdAt', 'status'])).extend({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    domainId: uuid.optional(),
  }),
};

export const approveSchema = { params: idParams, body: z.object({ remarks: z.string().trim().max(2000).optional() }) };
export const rejectSchema = { params: idParams, body: z.object({ remarks: z.string().trim().min(3).max(2000) }) };

export const adminListTasksSchema = {
  query: pageQuery.merge(sortQuery(['createdAt', 'sequence', 'title'])).extend({
    domainId: uuid.optional(),
    type: z.enum(['joining', 'domain']).optional(),
    isActive: boolQuery.optional(),
  }),
};