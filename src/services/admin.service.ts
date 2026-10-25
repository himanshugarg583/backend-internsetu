import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { addDays, dateFilter, todayUtc } from '../utils/helpers';

function distribution<S extends string>(
  statuses: S[],
  grouped: { status: S; _count: { _all: number } }[],
  q: { from?: string; to?: string },
) {
  const total = grouped.reduce((a, g) => a + g._count._all, 0);
  const rows = statuses.map((status) => {
    const count = grouped.find((g) => g.status === status)?._count._all ?? 0;
    return { status, count, percent: total ? Math.round((count / total) * 10000) / 100 : 0 };
  });
  return { from: q.from ?? null, to: q.to ?? null, total, rows };
}

function range(from?: string, to?: string) {
  const end = to ? addDays(new Date(`${to}T00:00:00Z`), 1) : addDays(todayUtc(), 1);
  const start = from ? new Date(`${from}T00:00:00Z`) : addDays(end, -31);
  return { start, end };
}

export const adminService = {
  async stats() {
    const [students, verified, enrollments, activeDomains, pendingSubs, certs, revoked, revenue, offerLetters] =
      await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT' } }),
        prisma.user.count({ where: { role: 'STUDENT', emailVerifiedAt: { not: null } } }),
        prisma.internshipEnrollment.count(),
        prisma.domain.count({ where: { isActive: true } }),
        prisma.taskSubmission.count({ where: { status: 'PENDING' } }),
        prisma.certificate.count({ where: { status: 'VALID' } }),
        prisma.certificate.count({ where: { status: 'REVOKED' } }),
        prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { totalAmount: true }, _count: true }),
        prisma.offerLetter.count({ where: { downloadCount: { gt: 0 } } }),
      ]);
    return {
      students,
      verifiedStudents: verified,
      enrollments,
      activeDomains,
      pendingSubmissions: pendingSubs,
      certificatesIssued: certs,
      certificatesRevoked: revoked,
      paidPayments: revenue._count,
      revenue: (revenue._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      offerLetterDownloadRate: enrollments ? Math.round((offerLetters / enrollments) * 10000) / 100 : 0,
    };
  },

  async paymentReport(q: { from?: string; to?: string; groupBy: 'day' | 'month' }) {
    const { start, end } = range(q.from, q.to);
    const unit = q.groupBy === 'month' ? 'month' : 'day';
    const rows = await prisma.$queryRaw<
      { period: Date; status: string; count: bigint; base: Prisma.Decimal; gst: Prisma.Decimal; total: Prisma.Decimal }[]
    >`
      SELECT date_trunc(${unit}, "createdAt") AS period, status::text AS status, COUNT(*) AS count,
             COALESCE(SUM("baseAmount"),0) AS base, COALESCE(SUM("gstAmount"),0) AS gst, COALESCE(SUM("totalAmount"),0) AS total
      FROM "Payment" WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1, 2 ORDER BY 1`;
    const totals = await prisma.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: start, lt: end } },
      _sum: { baseAmount: true, gstAmount: true, totalAmount: true },
      _count: true,
    });
    return {
      from: start,
      to: end,
      groupBy: unit,
      rows: rows.map((r) => ({
        period: r.period,
        status: r.status,
        count: Number(r.count),
        baseAmount: Number(r.base).toFixed(2),
        gstAmount: Number(r.gst).toFixed(2),
        totalAmount: Number(r.total).toFixed(2),
      })),
      paidSummary: {
        count: totals._count,
        baseAmount: (totals._sum.baseAmount ?? 0).toString(),
        gstAmount: (totals._sum.gstAmount ?? 0).toString(),
        totalAmount: (totals._sum.totalAmount ?? 0).toString(),
      },
    };
  },

  async registrationReport(q: { from?: string; to?: string; groupBy: 'day' | 'month' }) {
    const { start, end } = range(q.from, q.to);
    const unit = q.groupBy === 'month' ? 'month' : 'day';
    const users = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
      SELECT date_trunc(${unit}, "createdAt") AS period, COUNT(*) AS count FROM "User"
      WHERE role = 'STUDENT' AND "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`;
    const enrollments = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
      SELECT date_trunc(${unit}, "createdAt") AS period, COUNT(*) AS count FROM "InternshipEnrollment"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`;
    const byDomain = await prisma.internshipEnrollment.groupBy({
      by: ['domainId'],
      where: { createdAt: { gte: start, lt: end } },
      _count: true,
    });
    const domains = await prisma.domain.findMany({
      where: { id: { in: byDomain.map((d) => d.domainId) } },
      select: { id: true, name: true },
    });
    const names = new Map(domains.map((d) => [d.id, d.name]));
    return {
      from: start,
      to: end,
      groupBy: unit,
      registrations: users.map((r) => ({ period: r.period, count: Number(r.count) })),
      enrollments: enrollments.map((r) => ({ period: r.period, count: Number(r.count) })),
      enrollmentsByDomain: byDomain
        .map((d) => ({ domainId: d.domainId, domain: names.get(d.domainId), count: d._count }))
        .sort((a, b) => b.count - a.count),
    };
  },
  async domainEnrollmentsReport(q: { from?: string; to?: string }) {
    const createdAt = dateFilter(q.from, q.to);
    const [domains, grouped] = await Promise.all([
      prisma.domain.findMany({ select: { id: true, name: true, slug: true, isActive: true } }),
      prisma.internshipEnrollment.groupBy({ by: ['domainId', 'status'], where: { createdAt }, _count: { _all: true } }),
    ]);
    const rows = domains.map((d) => {
      const byStatus = { ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 } as Record<string, number>;
      for (const g of grouped) if (g.domainId === d.id) byStatus[g.status] = g._count._all;
      return { domainId: d.id, domain: d.name, slug: d.slug, isActive: d.isActive, total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus };
    });
    return { from: q.from ?? null, to: q.to ?? null, rows: rows.sort((a, b) => b.total - a.total) };
  },

  async internshipStatusReport(q: { from?: string; to?: string }) {
    const grouped = await prisma.internshipEnrollment.groupBy({
      by: ['status'],
      where: { createdAt: dateFilter(q.from, q.to) },
      _count: { _all: true },
    });
    return distribution(['ACTIVE', 'COMPLETED', 'CANCELLED'], grouped, q);
  },

  async taskCompletionReport(q: { from?: string; to?: string; domainId?: string }) {
    const where: Prisma.TaskSubmissionWhereInput = {
      submittedAt: dateFilter(q.from, q.to),
      ...(q.domainId && { task: { domainId: q.domainId } }),
    };
    const [grouped, enrollments, activeTasks] = await Promise.all([
      prisma.taskSubmission.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.internshipEnrollment.count({ where: { domainId: q.domainId, status: { not: 'CANCELLED' } } }),
      prisma.task.count({ where: { domainId: q.domainId, isActive: true } }),
    ]);
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
    for (const g of grouped) c[g.status] = g._count._all;
    const total = c.PENDING + c.APPROVED + c.REJECTED;
    const reviewed = c.APPROVED + c.REJECTED;
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 10000) / 100 : 0);
    // Expected submissions approximated as active (non-cancelled) enrollments x active tasks in scope.
    const expected = q.domainId ? enrollments * activeTasks : null;
    return {
      from: q.from ?? null,
      to: q.to ?? null,
      domainId: q.domainId ?? null,
      submissions: { total, ...c },
      approvalRate: pct(c.APPROVED, reviewed),
      rejectionRate: pct(c.REJECTED, reviewed),
      reviewedRate: pct(reviewed, total),
      completionRate: expected !== null ? pct(c.APPROVED, expected) : null,
    };
  },

  async certificatesReport(q: { from?: string; to?: string; groupBy: 'day' | 'month' }) {
    const { start, end } = range(q.from, q.to);
    const unit = q.groupBy === 'month' ? 'month' : 'day';
    const rows = await prisma.$queryRaw<{ period: Date; status: string; count: bigint }[]>`
      SELECT date_trunc(${unit}, "createdAt") AS period, status::text AS status, COUNT(*) AS count
      FROM "Certificate" WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1, 2 ORDER BY 1`;
    const series = new Map<string, { period: Date; issued: number; valid: number; revoked: number }>();
    for (const r of rows) {
      const k = r.period.toISOString();
      const e = series.get(k) ?? { period: r.period, issued: 0, valid: 0, revoked: 0 };
      const n = Number(r.count);
      e.issued += n;
      if (r.status === 'VALID') e.valid += n;
      else e.revoked += n;
      series.set(k, e);
    }
    const items = [...series.values()];
    return { from: start, to: end, groupBy: unit, total: items.reduce((a, b) => a + b.issued, 0), rows: items };
  },

  async paymentStatusReport(q: { from?: string; to?: string }) {
    const grouped = await prisma.payment.groupBy({
      by: ['status'],
      where: { createdAt: dateFilter(q.from, q.to) },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    const base = distribution(['CREATED', 'PAID', 'FAILED', 'REFUNDED'], grouped, q);
    return {
      ...base,
      rows: base.rows.map((r) => ({
        ...r,
        totalAmount: (grouped.find((g) => g.status === r.status)?._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  },

  async reportsOverview(q: { from?: string; to?: string; groupBy: 'day' | 'month' }) {
    const [domainEnrollments, internshipStatus, taskCompletion, certificates, paymentStatus] = await Promise.all([
      this.domainEnrollmentsReport(q),
      this.internshipStatusReport(q),
      this.taskCompletionReport(q),
      this.certificatesReport(q),
      this.paymentStatusReport(q),
    ]);
    return { domainEnrollments, internshipStatus, taskCompletion, certificates, paymentStatus };
  },

  /** Recent activity merged from source tables; each source fetches `limit` rows then the merge is truncated. */
  async activity(limit: number) {
    const userSel = { select: { id: true, name: true, email: true } } as const;
    const [users, enrollments, submissions, payments, certificates] = await Promise.all([
      prisma.user.findMany({ where: { role: 'STUDENT' }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, name: true, email: true, createdAt: true } }),
      prisma.internshipEnrollment.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { user: userSel, domain: { select: { name: true } } } }),
      prisma.taskSubmission.findMany({
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { task: { select: { title: true } }, enrollment: { select: { internId: true, user: userSel } } },
      }),
      prisma.payment.findMany({ orderBy: { updatedAt: 'desc' }, take: limit, include: { user: userSel } }),
      prisma.certificate.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { user: userSel } }),
    ]);
    const items = [
      ...users.map((u) => ({ type: 'REGISTRATION', id: u.id, at: u.createdAt, user: { id: u.id, name: u.name, email: u.email }, message: `${u.name} registered` })),
      ...enrollments.map((e) => ({ type: 'ENROLLMENT', id: e.id, at: e.createdAt, user: e.user, message: `${e.user.name} enrolled in ${e.domain.name} (${e.internId})` })),
      ...submissions.map((s) => ({
        type: s.status === 'PENDING' ? 'SUBMISSION' : `SUBMISSION_${s.status}`,
        id: s.id,
        at: s.status === 'PENDING' ? s.submittedAt : (s.reviewedAt ?? s.updatedAt),
        user: s.enrollment.user,
        message: s.status === 'PENDING'
          ? `${s.enrollment.user.name} submitted "${s.task.title}"`
          : `"${s.task.title}" by ${s.enrollment.user.name} was ${s.status.toLowerCase()}`,
      })),
      ...payments.map((p) => ({ type: `PAYMENT_${p.status}`, id: p.id, at: p.paidAt ?? p.updatedAt, user: p.user, message: `Payment ${p.status.toLowerCase()}: ${p.currency} ${p.totalAmount.toFixed(2)} by ${p.user.name}` })),
      ...certificates.map((c) => ({ type: c.status === 'VALID' ? 'CERTIFICATE_ISSUED' : 'CERTIFICATE_REVOKED', id: c.id, at: c.revokedAt ?? c.createdAt, user: c.user, message: `Certificate ${c.verificationId} ${c.status === 'VALID' ? 'issued to' : 'revoked for'} ${c.user.name}` })),
    ];
    return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  },
};