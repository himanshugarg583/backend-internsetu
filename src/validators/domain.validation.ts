import { z } from 'zod';
import { idParams, pageQuery } from './common';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

export const domainSlugSchema = { params: z.object({ slug }) };

export const listDomainsSchema = { query: pageQuery.extend({ category: z.string().trim().max(80).optional() }) };

const domainBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
});

export const createDomainSchema = { body: domainBody };
export const updateDomainSchema = { params: idParams, body: domainBody.partial() };
export const domainStatusSchema = { params: idParams, body: z.object({ isActive: z.boolean() }) };
