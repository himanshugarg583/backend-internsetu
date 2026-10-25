import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { userModel } from '../models/user.model';
import { otpService } from './otp.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { normalizeEmail } from '../utils/helpers';

interface RefreshPayload {
  sub: string;
  tv: number;
  typ: 'refresh';
}

// Precomputed hash used to equalize timing when the user does not exist.
const DUMMY_HASH = argon2.hash('dummy-password-for-timing');

function issueTokens(user: Pick<User, 'id' | 'role' | 'tokenVersion'>) {
  const accessToken = jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
  const refreshToken = jwt.sign({ sub: user.id, tv: user.tokenVersion, typ: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  });
  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    college: string;
    course: string;
    academicYear: string;
  }) {
    const email = normalizeEmail(input.email);
    if (await userModel.findByEmail(email)) throw AppError.conflict('An account with this email already exists');
    const { password, ...profile } = input;
    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: { ...profile, email, passwordHash, role: 'STUDENT' },
    });
    try {
      await otpService.issue(email, 'EMAIL_VERIFICATION', user.id);
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'Failed to send verification OTP on registration');
    }
    return { id: user.id, email: user.email, emailVerified: false };
  },

  async login(emailRaw: string, password: string) {
    const email = normalizeEmail(emailRaw);
    const user = await userModel.findByEmail(email);
    if (!user || !user.passwordHash) {
      await argon2.verify(await DUMMY_HASH, password).catch(() => false);
      throw AppError.unauthorized('Invalid email or password');
    }
    if (!(await argon2.verify(user.passwordHash, password))) throw AppError.unauthorized('Invalid email or password');
    if (user.status === 'BLOCKED') throw AppError.forbidden('Account is blocked');
    if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email first');
    return { user: await userModel.findPublicById(user.id), ...issueTokens(user) };
  },

  async refresh(token: string | undefined) {
    if (!token) throw AppError.unauthorized('Refresh token missing');
    let payload: RefreshPayload;
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') throw AppError.unauthorized('Invalid refresh token');
    const user = await userModel.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) throw AppError.unauthorized('Session revoked');
    if (user.status === 'BLOCKED') throw AppError.forbidden('Account is blocked');
    return issueTokens(user);
  },

  /** Revokes every session of the user by bumping tokenVersion. */
  async logout(userId: string) {
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  },

  async sendOtp(emailRaw: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const email = normalizeEmail(emailRaw);
    const user = await userModel.findByEmail(email);
    // Respond identically whether or not the account exists to prevent enumeration.
    if (!user) return;
    if (purpose === 'EMAIL_VERIFICATION' && user.emailVerifiedAt) return;
    await otpService.issue(email, purpose, user.id);
  },

  async verifyEmail(emailRaw: string, otp: string) {
    const email = normalizeEmail(emailRaw);
    const user = await userModel.findByEmail(email);
    if (!user) throw AppError.badRequest('Invalid or expired code');
    if (user.emailVerifiedAt) return { verified: true };
    await otpService.consume(email, 'EMAIL_VERIFICATION', otp);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { verified: true };
  },

  async forgotPassword(emailRaw: string) {
    try {
      await this.sendOtp(emailRaw, 'PASSWORD_RESET');
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 429) throw e;
      logger.warn({ err: (e as Error).message }, 'Forgot password OTP failed');
    }
  },

  /** Changes the password of an authenticated user and revokes all existing sessions. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) throw AppError.badRequest('New password must differ from current password');
    const user = await userModel.findById(userId);
    if (!user) throw AppError.unauthorized();
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(newPassword), tokenVersion: { increment: 1 } },
    });
  },

  async resetPassword(emailRaw: string, otp: string, newPassword: string) {
    const email = normalizeEmail(emailRaw);
    const user = await userModel.findByEmail(email);
    if (!user) throw AppError.badRequest('Invalid or expired code');
    await otpService.consume(email, 'PASSWORD_RESET', otp);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(newPassword),
        tokenVersion: { increment: 1 },
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
  },
};
