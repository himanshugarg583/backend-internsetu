import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env';

let transporter: Transporter | null = null;

export const isEmailConfigured = () => Boolean(env.SMTP_HOST);

export function getTransporter(): Transporter {
  if (transporter) return transporter;
  const pass = env.SMTP_PASS ? env.SMTP_PASS.replace(/["']/g, '').trim() : undefined;
  transporter = isEmailConfigured()
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

export function resetTransporter(): void {
  transporter = null;
}
