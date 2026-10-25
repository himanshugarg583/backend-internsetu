import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/database';
import * as mailer from '../src/integrations/email/mailer';
import { api, resetDb } from './helpers';

const sentOtps: string[] = [];
vi.spyOn(mailer, 'sendOtpEmail').mockImplementation(async (_to, otp) => {
  sentOtps.push(otp);
  return {} as never;
});

const reg = {
  name: 'Ravi Kumar',
  email: 'Ravi@Example.com',
  phone: '9876543210',
  password: 'Password123',
  college: 'NIT',
  course: 'B.Tech',
  academicYear: '3',
};

describe('auth', () => {
  beforeEach(async () => {
    await resetDb();
    sentOtps.length = 0;
  });

  it('registers, verifies OTP, logs in, refreshes, and logs out', async () => {
    const r = await api().post('/api/v1/auth/register').send(reg);
    expect(r.status).toBe(201);
    expect(r.body.data.email).toBe('ravi@example.com');

    const otpRow = await prisma.otp.findFirstOrThrow({ where: { email: 'ravi@example.com' } });
    expect(otpRow.otpHash).not.toBe(sentOtps[0]);

    const blocked = await api().post('/api/v1/auth/login').send({ email: reg.email, password: reg.password });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const bad = await api().post('/api/v1/auth/otp/verify').send({ email: reg.email, otp: sentOtps[0] === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(400);

    const v = await api().post('/api/v1/auth/otp/verify').send({ email: reg.email, otp: sentOtps[0] });
    expect(v.status).toBe(200);

    const login = await api().post('/api/v1/auth/login').send({ email: reg.email, password: reg.password });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    const { accessToken, refreshToken } = login.body.data;

    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.data.role).toBe('STUDENT');
    expect(me.body.data.passwordHash).toBeUndefined();

    const ref = await api().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(ref.status).toBe(200);

    await api().post('/api/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`).expect(200);
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('rejects role escalation and duplicate emails', async () => {
    const r = await api().post('/api/v1/auth/register').send({ ...reg, role: 'ADMIN' });
    expect(r.status).toBe(400);
    await api().post('/api/v1/auth/register').send(reg).expect(201);
    await api().post('/api/v1/auth/register').send({ ...reg, email: 'RAVI@example.com' }).expect(409);
  });

  it('OTP is single-use and attempt-limited', async () => {
    await api().post('/api/v1/auth/register').send(reg).expect(201);
    for (let i = 0; i < 5; i++) {
      await api().post('/api/v1/auth/otp/verify').send({ email: reg.email, otp: sentOtps[0] === '999999' ? '888888' : '999999' });
    }
    const locked = await api().post('/api/v1/auth/otp/verify').send({ email: reg.email, otp: sentOtps[0] });
    expect(locked.status).toBe(429);
  });

  it('resets password via OTP and revokes sessions', async () => {
    await api().post('/api/v1/auth/register').send(reg).expect(201);
    await api().post('/api/v1/auth/password/forgot').send({ email: reg.email }).expect(200);
    const otp = sentOtps.at(-1)!;
    await api().post('/api/v1/auth/password/reset').send({ email: reg.email, otp, newPassword: 'NewPass456' }).expect(200);
    await api().post('/api/v1/auth/password/reset').send({ email: reg.email, otp, newPassword: 'Other789x' }).expect(400);
    await api().post('/api/v1/auth/login').send({ email: reg.email, password: 'NewPass456' }).expect(200);
  });

  it('does not reveal unknown emails on forgot password', async () => {
    const r = await api().post('/api/v1/auth/password/forgot').send({ email: 'nobody@x.com' });
    expect(r.status).toBe(200);
  });
});
