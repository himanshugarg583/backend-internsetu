import { prisma } from '../config/database';

export const taskModel = {
  activeForDomain: (domainId: string) =>
    prisma.task.findMany({ where: { domainId, isActive: true }, orderBy: { sequence: 'asc' } }),
  findById: (id: string) => prisma.task.findUnique({ where: { id } }),
};
