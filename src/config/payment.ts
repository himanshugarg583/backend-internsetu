import { env } from './env';

/** Orders and client-side verification need only key id/secret; the webhook secret is optional. */
export const isRazorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const isRazorpayWebhookConfigured = () => Boolean(env.RAZORPAY_WEBHOOK_SECRET);

/** Fee in paise-precision computed exclusively from server configuration. */
export function certificateFee() {
  const basePaise = Math.round(env.CERTIFICATE_BASE_FEE * 100);
  const gstPaise = Math.round((basePaise * env.GST_PERCENT) / 100);
  const totalPaise = basePaise + gstPaise;
  return {
    baseAmount: (basePaise / 100).toFixed(2),
    gstAmount: (gstPaise / 100).toFixed(2),
    totalAmount: (totalPaise / 100).toFixed(2),
    gstPercent: env.GST_PERCENT,
    totalPaise,
    currency: env.CURRENCY,
  };
}
