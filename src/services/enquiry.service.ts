import { EnquiryStatus, EnquiryType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { sendMail } from '../integrations/email/mailer';
import { AppError } from '../utils/AppError';
import { orderBy, paged, pagination } from '../utils/helpers';
import { logger } from '../utils/logger';

/** Inbox that receives new-enquiry notifications. */
const SUPPORT_INBOX = process.env.SUPPORT_EMAIL || 'support@infovence.in';

const typeLabel: Record<EnquiryType, string> = {
  GENERAL: 'General Inquiry',
  ENROLLMENT: 'Internship Enrollment',
  TASK_SUBMISSION: 'Task Submission',
  PAYMENT: 'Payment Question',
  CERTIFICATE: 'Certificate Question',
  TECHNICAL: 'Technical Support',
  OTHER: 'Other',
};

interface CreateInput {
  name: string;
  email: string;
  subject: string;
  type: EnquiryType;
  message: string;
  website?: string;
}

interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: EnquiryStatus;
  type?: EnquiryType;
  sortBy?: 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export const enquiryService = {
  async create(input: CreateInput, meta: { ip?: string; userAgent?: string }) {
    const enquiry = await prisma.contactEnquiry.create({
      data: {
        name: input.name,
        email: input.email,
        subject: input.subject,
        type: input.type,
        message: input.message,
        ipAddress: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 300),
      },
      select: { id: true, createdAt: true },
    });

    // Notifications are best-effort; the enquiry is already saved.
    void Promise.allSettled([
      sendMail(
        SUPPORT_INBOX,
        `[Enquiry] ${typeLabel[input.type]}: ${input.subject}`,
        `New contact enquiry\n\nName: ${input.name}\nEmail: ${input.email}\nType: ${typeLabel[input.type]}\nSubject: ${input.subject}\n\n${input.message}\n\nReference: ${enquiry.id}`,
      ),
      sendMail(
        input.email,
        'We received your message — Infovance Technology',
        `Hi ${input.name},\n\nThank you for contacting Infovance Technology. We have received your enquiry "${input.subject}" and our team will get back to you.\n\nReference: ${enquiry.id}\n\nInfovance Technology\nsupport@infovence.in | +91 86965 63594`,
      ),
    ]).then((r) => r.forEach((x) => x.status === 'rejected' && logger.error({ err: x.reason, enquiryId: enquiry.id }, 'Enquiry email failed')));

    return { id: enquiry.id, createdAt: enquiry.createdAt };
  },

  async list(q: ListQuery) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.ContactEnquiryWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.type && { type: q.type }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { subject: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.contactEnquiry.findMany({ where, skip, take, orderBy: orderBy(q.sortBy, q.sortOrder, 'createdAt') }),
      prisma.contactEnquiry.count({ where }),
    ]);
    return paged(items, total, page, limit);
  },

  async get(id: string) {
    const e = await prisma.contactEnquiry.findUnique({ where: { id } });
    if (!e) throw AppError.notFound('Enquiry not found');
    return e;
  },

  async update(id: string, body: { status?: EnquiryStatus; adminNote?: string | null }) {
    if (body.status === undefined && body.adminNote === undefined) throw AppError.badRequest('Nothing to update');
    await enquiryService.get(id);
    const done = body.status === 'RESOLVED' || body.status === 'CLOSED';
    return prisma.contactEnquiry.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status, resolvedAt: done ? new Date() : null }),
        ...(body.adminNote !== undefined && { adminNote: body.adminNote }),
      },
    });
  },
};
