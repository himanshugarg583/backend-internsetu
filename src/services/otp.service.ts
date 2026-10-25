import crypto from 'crypto';
import { OtpPurpose } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { otpModel } from '../models/otp.model';
import { sendOtpEmail } from '../integrations/email/mailer';
import { AppError } from '../utils/AppError';

const hashOtp = (email: string, purpose: OtpPurpose, otp: string) =>
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${email}:${purpose}:${otp}`).digest('hex');

export const otpService = {
  /** Issues a new OTP, invalidating older ones. Returns the plaintext only for delivery. */
  async issue(email: string, purpose: OtpPurpose, userId?: string): Promise<string> {
    const last = await otpModel.latest(email, purpose);
    if (last) {
      const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
        throw AppError.tooMany(`Please wait ${Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s before requesting a new code`);
      }
    }
    const recent = await prisma.otp.count({
      where: { email, purpose, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recent >= 5) throw AppError.tooMany('Too many codes requested. Try again later');

    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await prisma.$transaction([
      prisma.otp.updateMany({ where: { email, purpose, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.otp.create({
        data: {
          email,
          purpose,
          userId,
          otpHash: hashOtp(email, purpose, otp),
          expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
        },
      }),
    ]);
    await sendOtpEmail(email, otp, purpose);
    return otp;
  },

  /** Verifies and consumes an OTP atomically (single use, attempt-limited). */
  async consume(email: string, purpose: OtpPurpose, otp: string) {
    const record = await otpModel.latestActive(email, purpose);
    if (!record) throw AppError.badRequest('Invalid or expired code');
    if (record.attempts >= env.OTP_MAX_ATTEMPTS) throw AppError.tooMany('Too many attempts. Request a new code');

    const expected = Buffer.from(record.otpHash);
    const actual = Buffer.from(hashOtp(email, purpose, otp));
    const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!ok) {
      await prisma.otp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw AppError.badRequest('Invalid or expired code');
    }
    const now = new Date();
    const res = await prisma.otp.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now, verifiedAt: now, attempts: { increment: 1 } },
    });
    if (res.count !== 1) throw AppError.badRequest('Invalid or expired code');
    return record;
  },
};
