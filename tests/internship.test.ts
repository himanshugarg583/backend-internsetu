import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/database';
import { razorpayGateway } from '../src/integrations/razorpay/razorpay.client';
import * as mailer from '../src/integrations/email/mailer';
import { api, createAdmin, createStudent, isoDate, resetDb, seedDomain } from './helpers';

vi.spyOn(mailer, 'sendMail').mockResolvedValue({} as never);
let orderSeq = 0;
vi.spyOn(razorpayGateway, 'createOrder').mockImplementation(async (amount, currency) => ({
  id: `order_test_${++orderSeq}`,
  amount,
  currency,
}));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const sign = (body: string) => crypto.createHmac('sha256', 'whsec_test_secret').update(body).digest('hex');

async function approve(adminToken: string, subId: string) {
  return api().post(`/api/v1/admin/task-submissions/${subId}/approve`).set(auth(adminToken)).send({});
}

describe('internship flow', () => {
  let adminToken: string;
  let student: { token: string };
  let ctx: Awaited<ReturnType<typeof seedDomain>>;

  beforeEach(async () => {
    await resetDb();
    ctx = await seedDomain();
    adminToken = await createAdmin();
    student = await createStudent();
  });

  async function enroll() {
    const r = await api()
      .post('/api/v1/internships/enroll')
      .set(auth(student.token))
      .send({ domainId: ctx.domain.id, durationWeeks: 4, startDate: isoDate(new Date()) });
    expect(r.status).toBe(201);
    return r.body.data;
  }

  it('generates unique intern IDs under concurrency', async () => {
    const domains = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prisma.domain.create({ data: { name: `D${i}`, slug: `d-${i}`, category: 'Data' } }),
      ),
    );
    const results = await Promise.all(
      domains.map((d) =>
        api()
          .post('/api/v1/internships/enroll')
          .set(auth(student.token))
          .send({ domainId: d.id, durationWeeks: 2, startDate: isoDate(new Date()) }),
      ),
    );
    const ids = results.map((r) => r.body.data.internId);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(ids).size).toBe(10);
    expect(ids[0]).toMatch(/^ISX-\d{4}-DAT-\d{6}$/);
  });

  it('rejects invalid durations and duplicate enrollment', async () => {
    await api()
      .post('/api/v1/internships/enroll')
      .set(auth(student.token))
      .send({ domainId: ctx.domain.id, durationWeeks: 3, startDate: isoDate(new Date()) })
      .expect(400);
    await enroll();
    await api()
      .post('/api/v1/internships/enroll')
      .set(auth(student.token))
      .send({ domainId: ctx.domain.id, durationWeeks: 4, startDate: isoDate(new Date()) })
      .expect(409);
  });

  it('enforces ownership', async () => {
    const e = await enroll();
    const other = await createStudent('other@test.com');
    await api().get(`/api/v1/internships/${e.id}`).set(auth(other.token)).expect(404);
    await api().get(`/api/v1/internships/${e.id}/offer-letter`).set(auth(other.token)).expect(404);
    await api().get('/api/v1/admin/dashboard/stats').set(auth(student.token)).expect(403);
  });

  it('full flow: offer letter, joining task, tasks, progress, eligibility, payment webhook, certificate', async () => {
    const e = await enroll();

    // Joining task locked until offer letter downloaded
    let tasks = (await api().get(`/api/v1/internships/${e.id}/tasks`).set(auth(student.token))).body.data;
    expect(tasks[0].isJoiningTask).toBe(true);
    expect(tasks[0].locked).toBe(true);

    const pdf = await api().get(`/api/v1/internships/${e.id}/offer-letter`).set(auth(student.token)).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    const letter = await prisma.offerLetter.findUniqueOrThrow({ where: { enrollmentId: e.id } });
    expect(letter.downloadCount).toBe(1);
    expect(letter.filePath.startsWith('offer-letters/')).toBe(true);

    tasks = (await api().get(`/api/v1/internships/${e.id}/tasks`).set(auth(student.token))).body.data;
    expect(tasks[0].locked).toBe(false);
    expect(tasks[1].locked).toBe(true);

    // Normal task blocked before joining approval
    await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.tasks[0].id}/submissions`)
      .set(auth(student.token))
      .send({ githubUrl: 'https://github.com/a/b' })
      .expect(403);

    // Hostname validation
    await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.joining.id}/submissions`)
      .set(auth(student.token))
      .send({ linkedinUrl: 'https://linkedin.com.evil.io/post/1' })
      .expect(400);

    const join = await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.joining.id}/submissions`)
      .set(auth(student.token))
      .send({ linkedinUrl: 'https://www.linkedin.com/posts/asha-123' });
    expect(join.status).toBe(201);
    await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.joining.id}/submissions`)
      .set(auth(student.token))
      .send({ linkedinUrl: 'https://www.linkedin.com/posts/asha-123' })
      .expect(409);
    expect((await approve(adminToken, join.body.data.id)).status).toBe(200);
    expect((await approve(adminToken, join.body.data.id)).status).toBe(409);

    // Submit task 1 -> reject -> resubmit -> approve
    const s1 = await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.tasks[0].id}/submissions`)
      .set(auth(student.token))
      .send({ githubUrl: 'https://github.com/asha/task1' });
    expect(s1.status).toBe(201);
    await api()
      .post(`/api/v1/admin/task-submissions/${s1.body.data.id}/reject`)
      .set(auth(adminToken))
      .send({ remarks: 'Missing README' })
      .expect(200);
    const s1b = await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.tasks[0].id}/submissions`)
      .set(auth(student.token))
      .send({ githubUrl: 'https://github.com/asha/task1-v2' });
    expect(s1b.status).toBe(201);
    expect(s1b.body.data.attempt).toBe(2);
    expect(s1b.body.data.history).toHaveLength(1);
    await approve(adminToken, s1b.body.data.id);

    // 1/4 = 25% (joining task excluded)
    let progress = (await api().get(`/api/v1/internships/${e.id}/progress`).set(auth(student.token))).body.data;
    expect(progress).toMatchObject({ totalTasks: 4, approvedTasks: 1, percent: 25 });

    const s2 = await api()
      .post(`/api/v1/internships/${e.id}/tasks/${ctx.tasks[1].id}/submissions`)
      .set(auth(student.token))
      .send({ githubUrl: 'https://github.com/asha/task2' });
    await approve(adminToken, s2.body.data.id);
    progress = (await api().get(`/api/v1/internships/${e.id}/progress`).set(auth(student.token))).body.data;
    expect(progress.percent).toBe(50);

    // 50% reached but end date not reached
    let elig = (await api().get(`/api/v1/internships/${e.id}/certificate/eligibility`).set(auth(student.token))).body.data;
    expect(elig.progressMet).toBe(true);
    expect(elig.endDateReached).toBe(false);
    expect(elig.eligible).toBe(false);
    await api().post(`/api/v1/internships/${e.id}/certificate/payment-order`).set(auth(student.token)).expect(403);

    // Simulate end date reached
    await prisma.internshipEnrollment.update({ where: { id: e.id }, data: { endDate: new Date('2020-01-01') } });
    elig = (await api().get(`/api/v1/internships/${e.id}/certificate/eligibility`).set(auth(student.token))).body.data;
    expect(elig.eligible).toBe(true);
    expect(elig.fee).toMatchObject({ baseAmount: '499.00', gstAmount: '89.82', totalAmount: '588.82' });

    const order = await api().post(`/api/v1/internships/${e.id}/certificate/payment-order`).set(auth(student.token));
    expect(order.status).toBe(201);
    expect(order.body.data.amountPaise).toBe(58882);
    // Repeated click reuses the same order
    const order2 = await api().post(`/api/v1/internships/${e.id}/certificate/payment-order`).set(auth(student.token));
    expect(order2.body.data.orderId).toBe(order.body.data.orderId);

    // Webhook: bad signature rejected
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test_1', order_id: order.body.data.orderId, amount: 58882, currency: 'INR', status: 'captured' } } },
    });
    await api()
      .post('/api/v1/payments/webhook/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'bad')
      .send(payload)
      .expect(400);

    // Valid webhook sent twice concurrently -> exactly one certificate
    const send = () =>
      api()
        .post('/api/v1/payments/webhook/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', sign(payload))
        .send(payload);
    const [w1, w2] = await Promise.all([send(), send()]);
    expect(w1.status).toBe(200);
    expect(w2.status).toBe(200);
    const w3 = await send();
    expect(w3.body.data.duplicate).toBe(true);
    expect(await prisma.certificate.count()).toBe(1);
    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment.status).toBe('PAID');

    // Certificate listing, download, verify
    const certs = (await api().get('/api/v1/certificates/my').set(auth(student.token))).body.data;
    expect(certs).toHaveLength(1);
    const dl = await api().get(`/api/v1/certificates/${certs[0].id}/download`).set(auth(student.token)).buffer(true);
    expect(dl.status).toBe(200);
    expect(dl.body.subarray(0, 4).toString()).toBe('%PDF');

    const ver = await api().get(`/api/v1/certificates/verify/${certs[0].verificationId}`);
    expect(ver.body.data).toMatchObject({ status: 'Valid', studentName: 'Asha Student', domain: 'Web Development' });

    // Cannot pay again
    await api().post(`/api/v1/internships/${e.id}/certificate/payment-order`).set(auth(student.token)).expect(403);

    // Admin revoke
    await api().post(`/api/v1/admin/certificates/${certs[0].id}/revoke`).set(auth(adminToken)).send({ reason: 'Fraud' }).expect(200);
    const ver2 = await api().get(`/api/v1/certificates/verify/${certs[0].verificationId}`);
    expect(ver2.body.data.status).toBe('Revoked');
    await api().get(`/api/v1/certificates/${certs[0].id}/download`).set(auth(student.token)).expect(403);

    // Admin reports & stats
    const stats = (await api().get('/api/v1/admin/dashboard/stats').set(auth(adminToken))).body.data;
    expect(stats).toMatchObject({ students: 1, enrollments: 1, paidPayments: 1, revenue: '588.82' });
    await api().get('/api/v1/admin/reports/payments').set(auth(adminToken)).expect(200);
    await api().get('/api/v1/admin/reports/registrations?groupBy=month').set(auth(adminToken)).expect(200);
  });

  it('webhook rejects amount mismatch and handles failure', async () => {
    const e = await enroll();
    const p = await prisma.payment.create({
      data: {
        userId: e.userId,
        enrollmentId: e.id,
        purpose: 'INTERNSHIP_CERTIFICATE',
        gatewayOrderId: 'order_x',
        baseAmount: '499.00',
        gstAmount: '89.82',
        totalAmount: '588.82',
      },
    });
    const bad = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x', amount: 100, currency: 'INR', status: 'captured' } } },
    });
    await api().post('/api/v1/payments/webhook/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sign(bad)).send(bad).expect(400);
    const failed = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x', amount: 58882, currency: 'INR', status: 'failed' } } },
    });
    await api().post('/api/v1/payments/webhook/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sign(failed)).send(failed).expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('FAILED');
    expect(await prisma.certificate.count()).toBe(0);
  });

  it('verify returns 404 for unknown IDs', async () => {
    await api().get('/api/v1/certificates/verify/ISC-UNKNOWN123').expect(404);
  });
});
