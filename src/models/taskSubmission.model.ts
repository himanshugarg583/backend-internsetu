import { prisma } from '../config/database';

export const submissionModel = {
  forEnrollment: (enrollmentId: string) => prisma.taskSubmission.findMany({ where: { enrollmentId } }),
  findById: (id: string) =>
    prisma.taskSubmission.findUnique({
      where: { id },
      include: { task: true, enrollment: { include: { user: { select: { id: true, name: true, email: true } } } } },
    }),
};
