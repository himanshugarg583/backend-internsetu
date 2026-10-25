import { prisma } from '../config/database';

export const domainModel = {
  findBySlug: (slug: string) => prisma.domain.findUnique({ where: { slug } }),
  findById: (id: string) => prisma.domain.findUnique({ where: { id } }),
};
