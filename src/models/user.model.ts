import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  college: true,
  course: true,
  academicYear: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const userModel = {
  findById: (id: string) => prisma.user.findUnique({ where: { id } }),
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
  findPublicById: (id: string) => prisma.user.findUnique({ where: { id }, select: publicUserSelect }),
};
