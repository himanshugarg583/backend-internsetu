import { env } from '../../config/env';
import { getTransporter, isEmailConfigured } from '../../config/email';
import { logger } from '../../utils/logger';

export interface MailAttachment {
  filename: string;
  path: string;
}

export async function sendMail(to: string, subject: string, text: string, attachments?: MailAttachment[]) {
  const info = await getTransporter().sendMail({ from: env.mailFrom, to, subject, text, attachments });
  if (!isEmailConfigured()) logger.warn({ to, subject }, 'SMTP not configured; email not delivered (json transport)');
  return info;
}

export const sendOtpEmail = (to: string, otp: string, purpose: string) =>
  sendMail(
    to,
    purpose === 'PASSWORD_RESET' ? 'InternSetu password reset code' : 'Verify your InternSetu email',
    `Your InternSetu verification code is ${otp}. It expires in ${env.OTP_TTL_MINUTES} minutes. Do not share it with anyone.`,
  );
