import argon2 from 'argon2';
import { AccountStatus, EnrollmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { publicUserSelect, userModel } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { orderBy, paged, pagination } from '../utils/helpers';

export const userService = {
  async me(userId: string) {
    const user = await userModel.findPublicById(userId);
    if (!user) throw AppError.notFound('User not found');
    return user;
  },

  updateMe: (userId: string, data: Prisma.UserUpdateInput) =>
    prisma.user.update({ where: { id: userId }, data, select: publicUserSelect }),

  async list(q: {
    page?: number;
    limit?: number;
    search?: string;
    status?: AccountStatus;
    domainId?: string;
    enrollmentStatus?: EnrollmentStatus | 'NONE';
    sortBy?: 'createdAt' | 'name' | 'email';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      status: q.status,
      ...(q.enrollmentStatus === 'NONE'
        ? { enrollments: { none: q.domainId ? { domainId: q.domainId } : {} } }
        : (q.domainId || q.enrollmentStatus) && {
            enrollments: { some: { domainId: q.domainId, status: q.enrollmentStatus } },
          }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { phone: { contains: q.search } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: orderBy(q.sortBy, q.sortOrder, 'createdAt'),
        select: publicUserSelect,
      }),
      prisma.user.count({ where }),
    ]);
    return paged(items, total, page, limit);
  },

  async adminCreate(input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    college?: string;
    course?: string;
    academicYear?: string;
    emailVerified: boolean;
  }) {
    const { password, emailVerified, ...profile } = input;
    if (await userModel.findByEmail(profile.email)) throw AppError.conflict('An account with this email already exists');
    return prisma.user.create({
      data: {
        ...profile,
        passwordHash: await argon2.hash(password),
        role: 'STUDENT',
        emailVerifiedAt: emailVerified ? new Date() : null,
      },
      select: publicUserSelect,
    });
  },

  async getWithDetails(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        enrollments: { include: { domain: { select: { name: true, slug: true } } } },
        payments: { orderBy: { createdAt: 'desc' } },
        certificates: { select: { id: true, verificationId: true, status: true, issueDate: true } },
      },
    });
    if (!user) throw AppError.notFound('User not found');
    return user;
  },

  async setStatus(adminId: string, id: string, status: AccountStatus) {
    if (adminId === id) throw AppError.badRequest('You cannot change your own status');
    const user = await userModel.findById(id);
    if (!user) throw AppError.notFound('User not found');
    if (user.role === 'ADMIN') throw AppError.forbidden('Admin accounts cannot be modified here');
    return prisma.user.update({
      where: { id },
      data: { status, ...(status === 'BLOCKED' && { tokenVersion: { increment: 1 } }) },
      select: publicUserSelect,
    });
  },
};
