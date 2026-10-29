import { Prisma, SubmissionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { submissionModel } from '../models/taskSubmission.model';
import { AppError } from '../utils/AppError';
import { dateFilter, isHost, orderBy, paged, pagination } from '../utils/helpers';
import { internshipService } from './internship.service';

const GITHUB_HOSTS = ['github.com'];
const LINKEDIN_HOSTS = ['linkedin.com'];

interface SubmitInput {
  githubUrl?: string;
  linkedinUrl?: string;
  notes?: string;
}

export const submissionService = {
  async submit(user: { id: string; role: string }, enrollmentId: string, taskId: string, input: SubmitInput) {
    const enrollment = await internshipService.getOwned(enrollmentId, { id: user.id, role: 'STUDENT' });
    if (enrollment.status !== 'ACTIVE') throw AppError.badRequest('Internship is not active');

    const tasks = await internshipService.tasks(enrollment.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw AppError.notFound('Task not found');
    if (task.locked) throw AppError.forbidden(task.lockReason ?? 'Task is locked');

    if (input.githubUrl && !isHost(input.githubUrl, GITHUB_HOSTS))
      throw AppError.badRequest('githubUrl must be an https://github.com link');
    if (input.linkedinUrl && !isHost(input.linkedinUrl, LINKEDIN_HOSTS))
      throw AppError.badRequest('linkedinUrl must be an https://linkedin.com link');
    if (task.requiresGithub && !input.githubUrl) throw AppError.badRequest('githubUrl is required for this task');
    if (task.requiresLinkedin && !input.linkedinUrl) throw AppError.badRequest('linkedinUrl is required for this task');
    if (!input.githubUrl && !input.linkedinUrl) throw AppError.badRequest('Provide at least one submission link');

    const data = {
      githubUrl: input.githubUrl ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      notes: input.notes ?? null,
    };

    return prisma.$transaction(async (tx) => {
      const current = await tx.taskSubmission.findUnique({
        where: { enrollmentId_taskId: { enrollmentId, taskId } },
      });
      if (!current) {
        return tx.taskSubmission.create({ data: { enrollmentId, taskId, ...data } });
      }
      if (current.status !== 'REJECTED') {
        throw AppError.conflict(
          current.status === 'APPROVED' ? 'Task already approved' : 'Submission is already pending review',
        );
      }
      const history = [
        ...((current.history as Prisma.JsonArray) ?? []),
        {
          attempt: current.attempt,
          githubUrl: current.githubUrl,
          linkedinUrl: current.linkedinUrl,
          notes: current.notes,
          status: current.status,
          adminRemarks: current.adminRemarks,
          reviewerId: current.reviewerId,
          submittedAt: current.submittedAt.toISOString(),
          reviewedAt: current.reviewedAt?.toISOString() ?? null,
        },
      ];
      // Conditional update guards against concurrent duplicate resubmissions.
      const res = await tx.taskSubmission.updateMany({
        where: { id: current.id, status: 'REJECTED', attempt: current.attempt },
        data: {
          ...data,
          status: 'PENDING',
          adminRemarks: null,
          reviewerId: null,
          reviewedAt: null,
          submittedAt: new Date(),
          attempt: current.attempt + 1,
          history,
        },
      });
      if (res.count !== 1) throw AppError.conflict('Submission was modified concurrently');
      return tx.taskSubmission.findUniqueOrThrow({ where: { id: current.id } });
    });
  },

  async list(q: {
    page?: number;
    limit?: number;
    search?: string;
    status?: SubmissionStatus;
    domainId?: string;
    from?: string;
    to?: string;
    sortBy?: 'submittedAt' | 'reviewedAt' | 'createdAt' | 'status';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.TaskSubmissionWhereInput = {
      status: q.status,
      submittedAt: dateFilter(q.from, q.to),
      ...(q.domainId && { task: { domainId: q.domainId } }),
      ...(q.search && {
        enrollment: {
          OR: [
            { internId: { contains: q.search, mode: 'insensitive' } },
            { user: { email: { contains: q.search, mode: 'insensitive' } } },
            { user: { name: { contains: q.search, mode: 'insensitive' } } },
          ],
        },
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.taskSubmission.findMany({
        where,
        skip,
        take,
        orderBy: orderBy(q.sortBy, q.sortOrder, 'submittedAt', 'asc'),
        include: {
          task: { select: { title: true, sequence: true, isJoiningTask: true } },
          enrollment: { select: { id: true, internId: true, domain: { select: { id: true, name: true } }, user: { select: { id: true, name: true, email: true } } } },
        },
      }),
      prisma.taskSubmission.count({ where }),
    ]);
    return paged(items, total, page, limit);
  },

  async get(id: string) {
    const s = await submissionModel.findById(id);
    if (!s) throw AppError.notFound('Submission not found');
    return s;
  },

  async review(reviewerId: string, id: string, status: 'APPROVED' | 'REJECTED', remarks?: string) {
    const res = await prisma.taskSubmission.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, adminRemarks: remarks ?? null, reviewerId, reviewedAt: new Date() },
    });
    if (res.count !== 1) {
      const exists = await prisma.taskSubmission.findUnique({ where: { id } });
      if (!exists) throw AppError.notFound('Submission not found');
      throw AppError.conflict(`Submission is already ${exists.status.toLowerCase()}`);
    }
    return this.get(id);
  },
};
