import crypto from 'crypto';
import { CertificateStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { safeFilename, storage } from '../config/storage';
import { fillPlaceholders, renderPdf } from '../integrations/pdf/pdf';
import { generateQrPng } from '../integrations/qr/qr';
import { certificateModel } from '../models/certificate.model';
import { AppError } from '../utils/AppError';
import { formatDate, orderBy, paged, pagination, todayUtc } from '../utils/helpers';
import { logger } from '../utils/logger';
import { internshipService } from './internship.service';

const newVerificationId = () => `ISC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
export const verificationUrl = (id: string) => `${env.FRONTEND_URL.replace(/\/$/, '')}/verify/${id}`;

export const certificateService = {
  /**
   * Issues the certificate for a confirmed payment. Idempotent: returns the existing certificate if present.
   * The DB row is only created after the PDF has been generated and stored successfully.
   */
  async issueForPayment(paymentId: string) {
    const existing = await prisma.certificate.findUnique({ where: { paymentId } });
    if (existing) return existing;

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { enrollment: { include: { user: true, domain: true } } },
    });
    if (payment.status !== 'PAID') throw AppError.badRequest('Payment is not confirmed');
    const e = payment.enrollment;
    const template = await storage.readTemplate(env.CERTIFICATE_TEMPLATE);

    const verificationId = newVerificationId();
    const issueDate = todayUtc();
    const body = fillPlaceholders(template, {
      name: e.user.name,
      domain: e.domain.name,
      duration: `${e.durationWeeks} weeks`,
      start_date: formatDate(e.startDate),
      end_date: formatDate(e.endDate),
      unique_id: verificationId,
      intern_id: e.internId,
      issue_date: formatDate(issueDate),
    });
    const qr = await generateQrPng(verificationUrl(verificationId));
    const pdf = await renderPdf({
      title: 'Certificate of Internship',
      body,
      qrPng: qr,
      landscape: true,
      footer: `Certificate ID: ${verificationId} | Verify at ${verificationUrl(verificationId)}`,
    });
    const filePath = await storage.save('certificates', safeFilename(`cert-${verificationId}`, 'pdf'), pdf);

    try {
      return await prisma.certificate.create({
        data: {
          userId: payment.userId,
          enrollmentId: payment.enrollmentId,
          paymentId: payment.id,
          verificationId,
          issueDate,
          filePath,
        },
      });
    } catch (err) {
      await storage.remove(filePath);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return prisma.certificate.findUniqueOrThrow({ where: { paymentId } });
      }
      throw err;
    }
  },

  /** Admin-triggered issuance: requires a PAID payment and satisfied eligibility rules. Idempotent. */
  async adminIssueForEnrollment(enrollmentId: string) {
    const e = await prisma.internshipEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!e) throw AppError.notFound('Internship not found');
    const payment = await prisma.payment.findFirst({
      where: { enrollmentId: e.id, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
    });
    if (!payment) throw new AppError(402, 'PAYMENT_REQUIRED', 'Certificate fee has not been paid');
    const existing = await prisma.certificate.findUnique({ where: { paymentId: payment.id } });
    if (existing) return { certificate: existing, alreadyIssued: true };
    const elig = await internshipService.eligibility(e.id);
    if (!elig.eligible) throw new AppError(403, 'NOT_ELIGIBLE', 'Not eligible for certificate', elig.reasons);
    const certificate = await this.issueForPayment(payment.id);
    logger.info({ enrollmentId, certificateId: certificate.id }, 'Certificate issued by admin');
    return { certificate, alreadyIssued: false };
  },

  listMine: (userId: string) =>
    prisma.certificate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        verificationId: true,
        type: true,
        issueDate: true,
        status: true,
        revokedAt: true,
        revocationReason: true,
        enrollment: { select: { id: true, internId: true, domain: { select: { name: true } } } },
      },
    }),

  async download(id: string, user: { id: string; role: string }) {
    const c = await certificateModel.findById(id);
    if (!c || (user.role !== 'ADMIN' && c.userId !== user.id)) throw AppError.notFound('Certificate not found');
    if (c.status === 'REVOKED' && user.role !== 'ADMIN') throw AppError.forbidden('Certificate has been revoked');
    return { fullPath: await storage.getFile(c.filePath), filename: `Certificate-${c.verificationId}.pdf` };
  },

  async verify(uniqueId: string) {
    const c = await certificateModel.findByVerificationId(uniqueId.toUpperCase());
    if (!c) throw AppError.notFound('No certificate found for this ID');
    return {
      verificationId: c.verificationId,
      status: c.status === 'VALID' ? 'Valid' : 'Revoked',
      type: c.type,
      studentName: c.user.name,
      domain: c.enrollment.domain.name,
      internId: c.enrollment.internId,
      startDate: c.enrollment.startDate,
      endDate: c.enrollment.endDate,
      durationWeeks: c.enrollment.durationWeeks,
      issueDate: c.issueDate,
      revokedAt: c.revokedAt,
    };
  },

  async adminList(q: {
    page?: number;
    limit?: number;
    search?: string;
    status?: CertificateStatus;
    domainId?: string;
    sortBy?: 'createdAt' | 'issueDate' | 'verificationId';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.CertificateWhereInput = {
      status: q.status,
      ...(q.domainId && { enrollment: { domainId: q.domainId } }),
      ...(q.search && {
        OR: [
          { verificationId: { contains: q.search, mode: 'insensitive' } },
          { user: { email: { contains: q.search, mode: 'insensitive' } } },
          { user: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.certificate.findMany({
        where,
        skip,
        take,
        orderBy: orderBy(q.sortBy, q.sortOrder, 'createdAt'),
        include: {
          user: { select: { id: true, name: true, email: true } },
          enrollment: { select: { internId: true, domain: { select: { name: true } } } },
        },
      }),
      prisma.certificate.count({ where }),
    ]);
    return paged(items, total, page, limit);
  },

  async adminGet(id: string) {
    const c = await prisma.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        enrollment: { include: { domain: true } },
        payment: true,
      },
    });
    if (!c) throw AppError.notFound('Certificate not found');
    return c;
  },

  async revoke(id: string, reason: string) {
    const res = await prisma.certificate.updateMany({
      where: { id, status: 'VALID' },
      data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
    });
    if (res.count !== 1) {
      const c = await certificateModel.findById(id);
      if (!c) throw AppError.notFound('Certificate not found');
      throw AppError.conflict('Certificate already revoked');
    }
    logger.info({ certificateId: id }, 'Certificate revoked');
    return certificateModel.findById(id);
  },
};
