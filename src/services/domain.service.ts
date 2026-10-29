import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { domainModel } from '../models/domain.model';
import { AppError } from '../utils/AppError';
import { paged, pagination } from '../utils/helpers';

type ListQuery = { page?: number; limit?: number; search?: string; category?: string };

async function list(q: ListQuery, onlyActive: boolean) {
  const { skip, take, page, limit } = pagination(q);
  const where: Prisma.DomainWhereInput = {
    ...(onlyActive && { isActive: true }),
    ...(q.category && { category: { equals: q.category, mode: 'insensitive' } }),
    ...(q.search && { name: { contains: q.search, mode: 'insensitive' } }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.domain.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      ...(!onlyActive && { include: { _count: { select: { tasks: true, enrollments: true } } } }),
    }),
    prisma.domain.count({ where }),
  ]);
  return paged(items, total, page, limit);
}

export const domainService = {
  listPublic: (q: ListQuery) => list(q, true),
  listAdmin: (q: ListQuery) => list(q, false),

  async getPublicBySlug(slug: string) {
    const domain = await prisma.domain.findFirst({
      where: { slug, isActive: true },
      include: {
        tasks: {
          where: { isActive: true },
          orderBy: { sequence: 'asc' },
          select: { id: true, title: true, sequence: true, isJoiningTask: true },
        },
      },
    });
    if (!domain) throw AppError.notFound('Domain not found');
    return domain;
  },

  async getById(id: string) {
    const d = await prisma.domain.findUnique({
      where: { id },
      include: { _count: { select: { tasks: true, enrollments: true } } },
    });
    if (!d) throw AppError.notFound('Domain not found');
    return d;
  },

  async create(data: Prisma.DomainCreateInput) {
    if (await domainModel.findBySlug(data.slug)) throw AppError.conflict('Slug already in use');
    return prisma.domain.create({ data });
  },

  async update(id: string, data: Prisma.DomainUpdateInput) {
    await this.getById(id);
    return prisma.domain.update({ where: { id }, data });
  },
};
