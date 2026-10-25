import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { orderBy, paged, pagination } from '../utils/helpers';

export const taskService = {
  async listForDomain(domainId: string) {
    const d = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!d) throw AppError.notFound('Domain not found');
    return prisma.task.findMany({ where: { domainId }, orderBy: { sequence: 'asc' } });
  },

  async adminListAll(q: {
    page?: number;
    limit?: number;
    search?: string;
    domainId?: string;
    type?: 'joining' | 'domain';
    isActive?: boolean;
    sortBy?: 'createdAt' | 'sequence' | 'title';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.TaskWhereInput = {
      domainId: q.domainId,
      isActive: q.isActive,
      ...(q.type && { isJoiningTask: q.type === 'joining' }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { description: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: q.sortBy ? orderBy(q.sortBy, q.sortOrder, 'createdAt') : [{ domainId: 'asc' }, { sequence: 'asc' }],
        include: { domain: { select: { id: true, name: true, slug: true } }, _count: { select: { submissions: true } } },
      }),
      prisma.task.count({ where }),
    ]);
    return paged(items, total, page, limit);
  },

  async create(
    domainId: string,
    data: Omit<Prisma.TaskUncheckedCreateInput, 'domainId'>,
  ) {
    const d = await prisma.domain.findUnique({ where: { id: domainId } });
    if (!d) throw AppError.notFound('Domain not found');
    if (data.isJoiningTask) {
      const existing = await prisma.task.findFirst({ where: { domainId, isJoiningTask: true } });
      if (existing) throw AppError.conflict('This domain already has a joining task');
    }
    return prisma.task.create({ data: { ...data, domainId } });
  },

  async update(id: string, data: Prisma.TaskUpdateInput) {
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Task not found');
    return prisma.task.update({ where: { id }, data });
  },
};
