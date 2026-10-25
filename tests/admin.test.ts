import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/database';
import { razorpayGateway } from '../src/integrations/razorpay/razorpay.client';
import * as mailer from '../src/integrations/email/mailer';
import { addDays, todayUtc } from '../src/utils/helpers';
import { api, createAdmin, createStudent, resetDb, seedDomain } from './helpers';

vi.spyOn(mailer, 'sendMail').mockResolvedValue({} as never);
let orderSeq = 0;
vi.spyOn(razorpayGateway, 'createOrder').mockImplementation(async (amount, currency) => ({
  id: `order_adm_${++orderSeq}`,
  amount,
  currency,
}));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const clientSig = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', 'dummy_secret').update(`${orderId}|${paymentId}`).digest('hex');

/** Creates an enrollment that ended yesterday with all tasks approved (eligible for certificate). */
async function eligibleEnrollment(userId: string, ctx: Awaited<ReturnType<typeof seedDomain>>) {
  const start = addDays(todayUtc(), -30);
  const e = await prisma.internshipEnrollment.create({
    data: { userId, domainId: ctx.domain.id, internId: `ISX-T-${Date.now()}`, durationWeeks: 4, startDate: start, endDate: addDays(todayUtc(), -1) },
  });
  for (const t of [ctx.joining, ...ctx.tasks]) {
    await prisma.taskSubmission.create({
      data: { enrollmentId: e.id, taskId: t.id, githubUrl: 'https://github.com/x/y', status: 'APPROVED', reviewedAt: new Date() },
    });
  }
  return e;
}

describe('admin extensions', () => {
  let adminToken: string;
  let student: { token: string; user: { id: string } };
  let ctx: Awaited<ReturnType<typeof seedDomain>>;

  beforeEach(async () => {
    await resetDb();
    await prisma.platformSetting.deleteMany();
    ctx = await seedDomain();
    adminToken = await createAdmin();
    student = await createStudent();
  });

  it('lists tasks across domains with filters and requires admin', async () => {
    await api().get('/api/v1/admin/tasks').set(auth(student.token)).expect(403);
    const all = await api().get('/api/v1/admin/tasks').set(auth(adminToken)).expect(200);
    expect(all.body.data.meta.total).toBe(5);
    const joining = await api().get('/api/v1/admin/tasks?type=joining').set(auth(adminToken)).expect(200);
    expect(joining.body.data.items).toHaveLength(1);
    expect(joining.body.data.items[0].isJoiningTask).toBe(true);
    await prisma.task.update({ where: { id: ctx.tasks[0].id }, data: { isActive: false } });
    const inactive = await api().get(`/api/v1/admin/tasks?isActive=false&domainId=${ctx.domain.id}`).set(auth(adminToken));
    expect(inactive.body.data.items.map((t: { id: string }) => t.id)).toEqual([ctx.tasks[0].id]);
    const sorted = await api().get('/api/v1/admin/tasks?sortBy=title&sortOrder=asc&search=task').set(auth(adminToken));
    expect(sorted.body.data.items[0].title).toBe('Task 1');
    await api().get('/api/v1/admin/tasks?sortBy=passwordHash').set(auth(adminToken)).expect(400);
  });

  it('admin certificate issuance requires PAID payment and eligibility; idempotent', async () => {
    const e = await eligibleEnrollment(student.user.id, ctx);
    await api().post(`/api/v1/admin/internships/${e.id}/certificate`).set(auth(adminToken)).expect(402);
    await prisma.payment.create({
      data: {
        userId: student.user.id, enrollmentId: e.id, purpose: 'INTERNSHIP_CERTIFICATE', gatewayOrderId: 'order_x',
        baseAmount: '499.00', gstAmount: '89.82', totalAmount: '588.82', status: 'PAID', paidAt: new Date(),
      },
    });
    const r1 = await api().post(`/api/v1/admin/internships/${e.id}/certificate`).set(auth(adminToken)).expect(201);
    const r2 = await api().post(`/api/v1/admin/internships/${e.id}/certificate`).set(auth(adminToken)).expect(200);
    expect(r2.body.data.certificate.id).toBe(r1.body.data.certificate.id);
    expect(await prisma.certificate.count()).toBe(1);
  });

  it('admin certificate issuance rejects ineligible enrollment even if paid', async () => {
    const e = await prisma.internshipEnrollment.create({
      data: { userId: student.user.id, domainId: ctx.domain.id, internId: 'ISX-T-NE', durationWeeks: 4, startDate: todayUtc(), endDate: addDays(todayUtc(), 27) },
    });
    await prisma.payment.create({
      data: {
        userId: student.user.id, enrollmentId: e.id, purpose: 'INTERNSHIP_CERTIFICATE', gatewayOrderId: 'order_y',
        baseAmount: '499.00', gstAmount: '89.82', totalAmount: '588.82', status: 'PAID', paidAt: new Date(),
      },
    });
    const r = await api().post(`/api/v1/admin/internships/${e.id}/certificate`).set(auth(adminToken)).expect(403);
    expect(r.body.error?.code ?? r.body.code).toBeDefined();
  });

  it('client-side payment verify marks paid, issues certificate, and serves receipt', async () => {
    const e = await eligibleEnrollment(student.user.id, ctx);
    const order = await api().post(`/api/v1/internships/${e.id}/certificate/payment-order`).set(auth(student.token)).expect(201);
    const orderId = order.body.data.orderId;
    await api()
      .post('/api/v1/payments/verify')
      .set(auth(student.token))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'a'.repeat(64) })
      .expect(400);
    const ok = await api()
      .post('/api/v1/payments/verify')
      .set(auth(student.token))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: clientSig(orderId, 'pay_1') })
      .expect(200);
    expect(ok.body.data.payment.status).toBe('PAID');
    expect(ok.body.data.payment.certificate).toBeTruthy();
    const rcpt = await api().get(`/api/v1/payments/${order.body.data.paymentId}/receipt`).set(auth(student.token)).buffer(true);
    expect(rcpt.status).toBe(200);
    expect(rcpt.headers['content-type']).toContain('application/pdf');
  });

  it('changes password, revokes sessions', async () => {
    await api()
      .post('/api/v1/auth/password/change')
      .set(auth(student.token))
      .send({ currentPassword: 'Wrong1234', newPassword: 'NewPass1234' })
      .expect(400);
    await api()
      .post('/api/v1/auth/password/change')
      .set(auth(student.token))
      .send({ currentPassword: 'Password123', newPassword: 'NewPass1234' })
      .expect(200);
    await api().get('/api/v1/auth/me').set(auth(student.token)).expect(401);
    await api().post('/api/v1/auth/login').send({ email: 'student@test.com', password: 'NewPass1234' }).expect(200);
  });

  it('gets and updates settings with read-only fees', async () => {
    const g = await api().get('/api/v1/admin/settings').set(auth(adminToken)).expect(200);
    expect(g.body.data.platformName).toBe('InternSetu');
    expect(g.body.data.readOnly.gstPercent).toBeTypeOf('number');
    const p = await api()
      .patch('/api/v1/admin/settings')
      .set(auth(adminToken))
      .send({ platformName: 'InternSetu Pro', supportEmail: 'Help@Example.com', notifications: { adminDigest: true } })
      .expect(200);
    expect(p.body.data.supportEmail).toBe('help@example.com');
    expect(p.body.data.notifications.adminDigest).toBe(true);
    expect(p.body.data.notifications.emailOnPayment).toBe(true);
    await api().patch('/api/v1/admin/settings').set(auth(adminToken)).send({ gstPercent: 5 }).expect(400);
  });

  it('serves reports overview, activity feed, and creates students', async () => {
    const created = await api()
      .post('/api/v1/admin/users')
      .set(auth(adminToken))
      .send({ name: 'New Kid', email: 'kid@test.com', password: 'Password123' })
      .expect(201);
    expect(created.body.data.role).toBe('STUDENT');
    await eligibleEnrollment(student.user.id, ctx);
    const rep = await api().get('/api/v1/admin/reports/overview').set(auth(adminToken)).expect(200);
    expect(rep.body.data.domainEnrollments.rows[0].total).toBe(1);
    expect(rep.body.data.taskCompletion.approvalRate).toBe(100);
    expect(rep.body.data.internshipStatus.rows.find((r: { status: string }) => r.status === 'ACTIVE').count).toBe(1);
    await api().get('/api/v1/admin/reports/payment-status').set(auth(adminToken)).expect(200);
    await api().get('/api/v1/admin/reports/certificates?groupBy=month').set(auth(adminToken)).expect(200);
    const act = await api().get('/api/v1/admin/activity?limit=50').set(auth(adminToken)).expect(200);
    expect(act.body.data.length).toBeLessThanOrEqual(50);
    expect(act.body.data.some((a: { type: string }) => a.type === 'ENROLLMENT')).toBe(true);

    const enrolled = await api().get(`/api/v1/admin/users?domainId=${ctx.domain.id}`).set(auth(adminToken));
    expect(enrolled.body.data.items.map((u: { email: string }) => u.email)).toEqual(['student@test.com']);
    const none = await api().get('/api/v1/admin/users?enrollmentStatus=NONE&sortBy=email&sortOrder=asc').set(auth(adminToken));
    expect(none.body.data.items.map((u: { email: string }) => u.email)).toEqual(['kid@test.com']);
    const future = await api().get('/api/v1/admin/internships?from=2999-01-01').set(auth(adminToken));
    expect(future.body.data.meta.total).toBe(0);
  });
});
