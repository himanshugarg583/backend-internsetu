import { prisma } from '../config/database';

export const offerLetterModel = {
  findByEnrollment: (enrollmentId: string) => prisma.offerLetter.findUnique({ where: { enrollmentId } }),
  recordDownload: (id: string) =>
    prisma.offerLetter.update({
      where: { id },
      data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
    }),
};
