import { z } from 'zod';
import { email, otpCode, password } from './common';

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email,
    phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
    password,
    college: z.string().trim().min(2).max(200),
    course: z.string().trim().min(2).max(100),
    academicYear: z.string().trim().min(1).max(20),
  }),
};

export const loginSchema = { body: z.object({ email, password: z.string().min(1).max(128) }) };

export const refreshSchema = { body: z.object({ refreshToken: z.string().min(10).optional() }) };

export const otpSendSchema = {
  body: z.object({ email, purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('EMAIL_VERIFICATION') }),
};

export const otpVerifySchema = { body: z.object({ email, otp: otpCode }) };

export const forgotSchema = { body: z.object({ email }) };

export const resetSchema = { body: z.object({ email, otp: otpCode, newPassword: password }) };

export const changePasswordSchema = {
  body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }),
};