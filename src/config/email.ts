import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env';

let transporter: Transporter | null = null;

export const isEmailConfigured = () => Boolean(env.SMTP_HOST);

export function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = isEmailConfigured()
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}
