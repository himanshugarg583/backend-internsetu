import { PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { certificateFee, isRazorpayConfigured, isRazorpayWebhookConfigured } from '../config/payment';
import { storage } from '../config/storage';
import { razorpayGateway } from '../integrations/razorpay/razorpay.client';
import { renderPdf } from '../integrations/pdf/pdf';
import { sendMail } from '../integrations/email/mailer';
import { AppError } from '../utils/AppError';
import { dateFilter, formatDate, orderBy, paged, pagination } from '../utils/helpers';
import { logger } from '../utils/logger';
import { certificateService } from './certificate.service';
import { internshipService } from './internship.service';

interface RazorpayWebhook {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; amount: number; currency: string; status: string } };
    order?: { entity: { id: string } };
    refund?: { entity: { id: string; payment_id: string } };
  };
}

const receiptWrites = new Map<string, Promise<string>>();

async function buildReceipt(paymentId: string) {
  const p = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { user: true, enrollment: { include: { domain: true } } },
  });
  const body = [
    `Receipt for: ${p.user.name} (${p.user.email})`,
    `Internship: ${p.enrollment.domain.name} - ${p.enrollment.internId}`,
    `Order ID: ${p.gatewayOrderId}`,
    `Payment ID: ${p.gatewayPaymentId}`,
    `Date: ${formatDate(p.paidAt ?? new Date())}`,
    '',
    `Base fee: ${p.currency} ${p.baseAmount.toFixed(2)}`,
    `GST: ${p.currency} ${p.gstAmount.toFixed(2)}`,
    `Total paid: ${p.currency} ${p.totalAmount.toFixed(2)}`,
  ].join('\n');
  const pdf = await renderPdf({ title: 'Payment Receipt', body });
  const filename = `receipt-${p.id}.pdf`;
  if (!(await storage.exists(`receipts/${filename}`))) {
    // Deduplicate concurrent generation (e.g. background email + download) of the same receipt file.
    let pending = receiptWrites.get(filename);
    if (!pending) {
      pending = storage.save('receipts', filename, pdf).finally(() => receiptWrites.delete(filename));
      receiptWrites.set(filename, pending);
    }
    await pending;
  }
  return { payment: p, body, fullPath: await storage.getFile(`receipts/${filename}`), filename };
}

async function sendReceipt(paymentId: string) {
  const r = await buildReceipt(paymentId);
  await sendMail(r.payment.user.email, 'Your Infovance Technology payment receipt', r.body, [
    { filename: 'receipt.pdf', path: r.fullPath },
  ]);
}

export const paymentService = {
  async createCertificateOrder(userId: string, enrollmentId: string) {
    const e = await internshipService.getOwned(enrollmentId, { id: userId, role: 'STUDENT' });
    const elig = await internshipService.eligibility(e.id);
    if (!elig.eligible) throw new AppError(403, 'NOT_ELIGIBLE', 'Not eligible for certificate', elig.reasons);
    if (!isRazorpayConfigured()) throw AppError.config('Payment gateway is not configured');

    const paid = await prisma.payment.findFirst({ where: { enrollmentId: e.id, status: 'PAID' } });
    if (paid) throw AppError.conflict('Certificate fee already paid');

    const fee = certificateFee(e.durationWeeks);
    // Reuse a recent unpaid order to avoid creating duplicates on repeated clicks.
    const pending = await prisma.payment.findFirst({
      where: {
        enrollmentId: e.id,
        status: 'CREATED',
        totalAmount: new Prisma.Decimal(fee.totalAmount),
        createdAt: { gt: new Date(Date.now() - 30 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const payment =
      pending ??
      (await (async () => {
        const order = await razorpayGateway.createOrder(fee.totalPaise, fee.currency, `cert-${e.internId}`.slice(0, 40), {
          enrollmentId: e.id,
          userId,
        });
        return prisma.payment.create({
          data: {
            userId,
            enrollmentId: e.id,
            purpose: 'INTERNSHIP_CERTIFICATE',
            gateway: 'RAZORPAY',
            gatewayOrderId: order.id,
            baseAmount: fee.baseAmount,
            gstAmount: fee.gstAmount,
            totalAmount: fee.totalAmount,
            currency: fee.currency,
          },
        });
      })());

    return {
      paymentId: payment.id,
      orderId: payment.gatewayOrderId,
      keyId: razorpayGateway.keyId(),
      amountPaise: fee.totalPaise,
      currency: payment.currency,
      breakdown: { baseAmount: payment.baseAmount, gstAmount: payment.gstAmount, totalAmount: payment.totalAmount, gstPercent: fee.gstPercent },
    };
  },

  /** Processes a verified Razorpay webhook. Idempotent by design. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!isRazorpayWebhookConfigured()) throw AppError.config('Payment webhook is not configured');
    if (!razorpayGateway.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature');
    }
    let evt: RazorpayWebhook;
    try {
      evt = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw AppError.badRequest('Invalid webhook payload');
    }

    if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
      const entity = evt.payload.payment?.entity;
      if (!entity) return { ignored: true };
      return this.markPaid(entity.order_id, entity.id, entity.amount, entity.currency);
    }
    if (evt.event === 'payment.failed') {
      const entity = evt.payload.payment?.entity;
      if (!entity) return { ignored: true };
      await prisma.payment.updateMany({
        where: { gatewayOrderId: entity.order_id, status: 'CREATED' },
        data: { status: 'FAILED', gatewayPaymentId: entity.id },
      });
      return { processed: true };
    }
    if (evt.event === 'refund.processed') {
      const paymentGatewayId = evt.payload.refund?.entity.payment_id;
      if (!paymentGatewayId) return { ignored: true };
      await this.applyRefund({ gatewayPaymentId: paymentGatewayId }, 'Refunded via gateway');
      return { processed: true };
    }
    return { ignored: true };
  },

  /** Client-side checkout verification (HMAC of order_id|payment_id with KEY_SECRET). Idempotent. */
  async verifyClientPayment(userId: string, input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    if (!isRazorpayConfigured()) throw AppError.config('Payment gateway is not configured');
    const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: input.razorpay_order_id } });
    if (!payment || payment.userId !== userId) throw AppError.notFound('Payment not found');
    if (!razorpayGateway.verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid payment signature');
    }
    if (payment.status === 'REFUNDED') throw AppError.conflict('Payment has been refunded');
    // Signature binds order+payment to our secret; the order amount was fixed server-side at creation.
    const res = await this.markPaid(
      payment.gatewayOrderId,
      input.razorpay_payment_id,
      Math.round(Number(payment.totalAmount) * 100),
      payment.currency,
    );
    const current = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { certificate: { select: { id: true, verificationId: true, status: true } } },
    });
    return { ...res, payment: current };
  },

  async receipt(id: string, user: { id: string; role: string }) {
    const p = await this.getOwned(id, user);
    if (p.status !== 'PAID' && p.status !== 'REFUNDED') throw AppError.badRequest('Receipt is only available for paid payments');
    const r = await buildReceipt(p.id);
    return { fullPath: r.fullPath, filename: `Receipt-${p.gatewayOrderId}.pdf` };
  },

  async markPaid(orderId: string, gatewayPaymentId: string, amountPaise: number, currency: string) {
    const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: orderId } });
    if (!payment) {
      logger.warn({ orderId }, 'Webhook for unknown order');
      return { ignored: true };
    }
    const expected = Math.round(Number(payment.totalAmount) * 100);
    if (amountPaise !== expected || currency !== payment.currency) {
      logger.error({ orderId, amountPaise, expected }, 'Webhook amount mismatch');
      throw AppError.badRequest('Amount mismatch');
    }
    const updated = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'FAILED'] } },
      data: { status: 'PAID', gatewayPaymentId, paidAt: new Date() },
    });
    const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status !== 'PAID') return { ignored: true, status: current.status };

    // Throws on failure so the gateway retries; issuance is idempotent.
    const cert = await certificateService.issueForPayment(payment.id);
    if (updated.count === 1) {
      sendReceipt(payment.id).catch((err) => logger.warn({ err: err.message }, 'Receipt delivery failed'));
    }
    return { processed: true, duplicate: updated.count === 0, certificateId: cert.id };
  },

  async applyRefund(where: { id?: string; gatewayPaymentId?: string }, reason: string) {
    return prisma.$transaction(async (tx) => {
      const p = await tx.payment.findFirst({ where });
      if (!p) return null;
      if (p.status === 'REFUNDED') return p;
      await tx.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED' } });
      await tx.certificate.updateMany({
        where: { paymentId: p.id, status: 'VALID' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: `Payment refunded: ${reason}` },
      });
      return tx.payment.findUniqueOrThrow({ where: { id: p.id } });
    });
  },

  async adminRefund(id: string, reason: string) {
    const p = await prisma.payment.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Payment not found');
    if (p.status !== 'PAID' || !p.gatewayPaymentId) throw AppError.badRequest('Only paid payments can be refunded');
    await razorpayGateway.refund(p.gatewayPaymentId, Math.round(Number(p.totalAmount) * 100));
    return this.applyRefund({ id: p.id }, reason);
  },

  listMine: (userId: string) => prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),

  async getOwned(id: string, user: { id: string; role: string }) {
    const p = await prisma.payment.findUnique({
      where: { id },
      include: {
        certificate: { select: { id: true, verificationId: true, status: true } },
        user: { select: { id: true, name: true, email: true } },
        enrollment: { select: { internId: true } },
      },
    });
    if (!p || (user.role !== 'ADMIN' && p.userId !== user.id)) throw AppError.notFound('Payment not found');
    return p;
  },

  async adminList(q: {
    page?: number;
    limit?: number;
    search?: string;
    status?: PaymentStatus;
    from?: string;
    to?: string;
    sortBy?: 'createdAt' | 'paidAt' | 'totalAmount' | 'status';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, page, limit } = pagination(q);
    const where: Prisma.PaymentWhereInput = {
      status: q.status,
      createdAt: dateFilter(q.from, q.to),
      ...(q.search && {
        OR: [
          { gatewayOrderId: { contains: q.search } },
          { gatewayPaymentId: { contains: q.search } },
          { user: { email: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: orderBy(q.sortBy, q.sortOrder, 'createdAt'),
        include: { user: { select: { id: true, name: true, email: true } }, enrollment: { select: { internId: true, domainId: true } } },
      }),
      prisma.payment.count({ where }),
    ]);
    return paged(items, total, page, limit);
  },
};
