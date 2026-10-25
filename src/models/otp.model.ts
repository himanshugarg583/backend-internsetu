import { OtpPurpose } from '@prisma/client';
import { prisma } from '../config/database';

export const otpModel = {
  latest: (email: string, purpose: OtpPurpose) =>
    prisma.otp.findFirst({ where: { email, purpose }, orderBy: { createdAt: 'desc' } }),
  latestActive: (email: string, purpose: OtpPurpose) =>
    prisma.otp.findFirst({
      where: { email, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
  invalidateAll: (email: string, purpose: OtpPurpose) =>
    prisma.otp.updateMany({ where: { email, purpose, usedAt: null }, data: { usedAt: new Date() } }),
};
