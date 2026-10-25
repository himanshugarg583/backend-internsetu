import path from 'path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/internsetu_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789-0123456789';
process.env.STORAGE_ROOT = path.resolve(__dirname, '.tmp-storage');
process.env.SMTP_HOST = '';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret';
