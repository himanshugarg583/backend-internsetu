import { prisma } from '../config/database';

export const certificateModel = {
  findById: (id: string) => prisma.certificate.findUnique({ where: { id } }),
  findByVerificationId: (verificationId: string) =>
    prisma.certificate.findUnique({
      where: { verificationId },
      include: { user: { select: { name: true } }, enrollment: { include: { domain: true } } },
    }),
};
