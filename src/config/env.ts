import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool,
  STORAGE_ROOT: z.string().default('./storage'),
  OFFER_LETTER_TEMPLATE: z.string().default('offer-letter.txt'),
  CERTIFICATE_TEMPLATE: z.string().default('certificate.txt'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_BACKUP_FROM: z.string().optional(),
  OTP_TTL_MINUTES: z.coerce.number().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CERTIFICATE_BASE_FEE: z.coerce.number().positive().default(129),
  GST_PERCENT: z.coerce.number().min(0).default(18),
  CURRENCY: z.string().default('INR'),
  INTERN_ID_PREFIX: z.string().default('ISX'),
  ALLOWED_DURATIONS_WEEKS: z.string().default('4,6,8,12,16,20,24'),
  CERTIFICATE_MIN_PROGRESS: z.coerce.number().min(0).max(100).default(50),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  allowedDurations: parsed.data.ALLOWED_DURATIONS_WEEKS.split(',').map(Number).filter((n) => n > 0),
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  mailFrom:
    parsed.data.SMTP_FROM?.trim() ||
    parsed.data.SMTP_BACKUP_FROM?.trim() ||
    (parsed.data.SMTP_USER ? `InternSetu <${parsed.data.SMTP_USER}>` : 'InternSetu <no-reply@internsetu.local>'),
};
