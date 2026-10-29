import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { certificateFee } from '../config/payment';
import { enrollmentModel } from '../models/internshipEnrollment.model';
import { taskModel } from '../models/task.model';
import { submissionModel } from '../models/taskSubmission.model';
import { AppError } from '../utils/AppError';
import { addDays, dateFilter, orderBy, paged, pagination, todayUtc } from '../utils/helpers';
import { logger } from '../utils/logger';

const categoryCode = (category: string) =>
  (category.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'GEN').toUpperCase().padEnd(3, 'X');

export const internshipService = {
  async enroll(userId: string, input: { domainId: string; durationWeeks: number; startDate: string }) {
    if (!env.allowedDurations.includes(input.durationWeeks)) {
      throw AppError.badRequest(`durationWeeks must be one of ${env.allowedDurations.join(', ')}`);
    }
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
    if (Number.isNaN(startDate.getTime())) throw AppError.badRequest('Invalid startDate');
    const today = todayUtc();
    if (startDate < today) throw AppError.badRequest('startDate cannot be in the past');
    if (startDate > addDays(today, 90)) throw AppError.badRequest('startDate must be within 90 days');

    const domain = await prisma.domain.findFirst({ where: { id: input.domainId, isActive: true } });
    if (!domain) throw AppError.notFound('Domain not found');
    const existing = await prisma.internshipEnrollment.findUnique({
      where: { userId_domainId: { userId, domainId: domain.id } },
    });
    if (existing) throw AppError.conflict('You are already enrolled in this domain');

    const endDate = addDays(startDate, input.durationWeeks * 7 - 1);
    return prisma.$transaction(async (tx) => {
      const serial = await enrollmentModel.nextSerial(tx);
      const internId = `${env.INTERN_ID_PREFIX}-${startDate.getUTCFullYear()}-${categoryCode(domain.category)}-${String(serial).padStart(6, '0')}`;
      return tx.internshipEnrollment.create({
        data: { userId, domainId: domain.id, internId, durationWeeks: input.durationWeeks, startDate, endDate },
        include: { domain: true },
      });
    });
  },

  listMine: (userId: string) =>
    prisma.internshipEnrollment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { domain: true, offerLetter: { select: { generatedAt: true, downloadCount: true, lastDownloadedAt: true } } },
    }),

  /** Loads an enrollment and enforces ownership unless the caller is an admin. */
  async getOwned(id: string, user: { id: string; role: string }) {
    const e = await enrollmentModel.findById(id);
    if (!e || (user.role !== 'ADMIN' && e.userId !== user.id)) throw AppError.notFound('Internship not found');
    return e;
  },

  async getDetail(id: string, user: { id: string; role: string }) {
    const e = await this.getOwned(id, user);
    const [progress, eligibility] = await Promise.all([this.progress(e.id), this.eligibility(e.id)]);
    return {
      ...e,
      offerLetter: e.offerLetter
        ? { generatedAt: e.offerLetter.generatedAt, downloadCount: e.offerLetter.downloadCount }
        : null,
      progress,
      certificate: eligibility,
    };
  },

  /** Task list with server-computed lock state. */
  async tasks(enrollmentId: string) {
    const e = await prisma.internshipEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { offerLetter: true },
    });
    const [tasks, subs] = await Promise.all([taskModel.activeForDomain(e.domainId), submissionModel.forEnrollment(e.id)]);
    const byTask = new Map(subs.map((s) => [s.taskId, s]));
    const joining = tasks.find((t) => t.isJoiningTask);
    const joiningApproved = joining ? byTask.get(joining.id)?.status === 'APPROVED' : true;
    const offerDownloaded = Boolean(e.offerLetter && e.offerLetter.downloadCount > 0);

    return tasks.map((t) => {
      const s = byTask.get(t.id);
      const locked = t.isJoiningTask ? !offerDownloaded : !joiningApproved;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        sequence: t.sequence,
        isJoiningTask: t.isJoiningTask,
        requiresGithub: t.requiresGithub,
        requiresLinkedin: t.requiresLinkedin,
        locked,
        lockReason: locked
          ? t.isJoiningTask
            ? 'Download your offer letter to unlock the joining task'
            : 'Complete and get approval for the joining task first'
          : null,
        submission: s
          ? {
              id: s.id,
              status: s.status,
              githubUrl: s.githubUrl,
              linkedinUrl: s.linkedinUrl,
              notes: s.notes,
              adminRemarks: s.adminRemarks,
              attempt: s.attempt,
              submittedAt: s.submittedAt,
              reviewedAt: s.reviewedAt,
            }
          : null,
      };
    });
  },

  /** Progress counts only approved, active, non-joining tasks. */
  async progress(enrollmentId: string) {
    const e = await prisma.internshipEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    const [total, approved, pending, rejected] = await Promise.all([
      prisma.task.count({ where: { domainId: e.domainId, isActive: true, isJoiningTask: false } }),
      ...(['APPROVED', 'PENDING', 'REJECTED'] as const).map((status) =>
        prisma.taskSubmission.count({
          where: { enrollmentId, status, task: { isActive: true, isJoiningTask: false } },
        }),
      ),
    ]);
    const percent = total === 0 ? 0 : Math.round((approved / total) * 10000) / 100;
    return { totalTasks: total, approvedTasks: approved, pendingTasks: pending, rejectedTasks: rejected, percent };
  },

  async eligibility(enrollmentId: string) {
    const e = await prisma.internshipEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { certificates: { where: { status: 'VALID' }, select: { id: true, verificationId: true } } },
    });
    const progress = await this.progress(enrollmentId);
    const progressMet = progress.totalTasks > 0 && progress.percent >= env.CERTIFICATE_MIN_PROGRESS;
    const endDateReached = todayUtc() >= e.endDate;
    const existing = e.certificates[0] ?? null;
    const reasons: string[] = [];
    if (e.status === 'CANCELLED') reasons.push('Internship is cancelled');
    if (!progressMet) reasons.push(`At least ${env.CERTIFICATE_MIN_PROGRESS}% of tasks must be approved`);
    // If progress is met (>= 50%), student is eligible immediately without waiting for future end date
    if (!progressMet && !endDateReached) reasons.push('Internship end date has not been reached');
    if (existing) reasons.push('Certificate already issued');
    return {
      eligible: reasons.length === 0,
      progressPercent: progress.percent,
      requiredPercent: env.CERTIFICATE_MIN_PROGRESS,
      progressMet,
      endDate: e.endDate,
      endDateReached: endDateReached || progressMet,
      alreadyIssued: Boolean(existing),
      certificateId: existing?.id ?? null,
      reasons,
      fee: certificateFee(e.durationWeeks),
    };
  },

  async adminList(q: {
    page?: number;
    limit?: number;
    search?: string;
    domainId?: string;
    status?: Prisma.EnumEnrollmentStatusFilter['equals'];
    from?: string;
    to?: string;
    sortBy?: 'createdAt' | 'startDate' | 'endDate' | 'internId' | 'status';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.InternshipEnrollmentWhereInput = {
      domainId: q.domainId,
      status: q.status,
      createdAt: dateFilter(q.from, q.to),
      ...(q.search && {
        OR: [
          { internId: { contains: q.search, mode: 'insensitive' } },
          { user: { name: { contains: q.search, mode: 'insensitive' } } },
          { user: { email: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.internshipEnrollment.findMany({
        where,
        skip,
        take,
        orderBy: orderBy(q.sortBy, q.sortOrder, 'createdAt'),
        include: {
          domain: { select: { name: true } },
          user: { select: { id: true, name: true, email: true } },
          payments: { where: { status: 'PAID' }, select: { id: true } },
          certificates: { where: { status: 'VALID' }, select: { id: true } },
        },
      }),
      prisma.internshipEnrollment.count({ where }),
    ]);
    const withProgress = await Promise.all(items.map(async (e) => ({ ...e, progress: await this.progress(e.id) })));
    return paged(withProgress, total, page, limit);
  },

  async adminCancel(id: string, reason: string) {
    const res = await prisma.internshipEnrollment.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    if (res.count !== 1) {
      const e = await prisma.internshipEnrollment.findUnique({ where: { id } });
      if (!e) throw AppError.notFound('Internship not found');
      throw AppError.conflict(`Internship is already ${e.status.toLowerCase()}`);
    }
    logger.info({ enrollmentId: id, reason }, 'Internship cancelled by admin');
    return prisma.internshipEnrollment.findUniqueOrThrow({ where: { id } });
  },

  async adminGet(id: string) {
    const e = await prisma.internshipEnrollment.findUnique({
      where: { id },
      include: {
        domain: true,
        user: { select: { id: true, name: true, email: true, phone: true, college: true, status: true, emailVerifiedAt: true } },
        offerLetter: true,
        submissions: { include: { task: { select: { title: true, sequence: true, isJoiningTask: true } } } },
        payments: true,
        certificates: true,
      },
    });
    if (!e) throw AppError.notFound('Internship not found');
    return { ...e, progress: await this.progress(id) };
  },
};
