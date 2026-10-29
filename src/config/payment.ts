import { env } from './env';

/** Orders and client-side verification need only key id/secret; the webhook secret is optional. */
export const isRazorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const isRazorpayWebhookConfigured = () => Boolean(env.RAZORPAY_WEBHOOK_SECRET);

export const DURATION_TOTAL_FEES: Record<number, number> = {
  4: 129,
  6: 169,
  8: 199,
  12: 299,
  16: 399,
  20: 499,
  24: 599,
};

/** Fee in paise-precision computed with GST included in the total. */
export function certificateFee(durationWeeks?: number) {
  let totalRupees = 129; // default to 4 weeks
  if (durationWeeks && DURATION_TOTAL_FEES[durationWeeks]) {
    totalRupees = DURATION_TOTAL_FEES[durationWeeks];
  } else if (durationWeeks) {
    if (durationWeeks <= 4) totalRupees = 129;
    else if (durationWeeks <= 6) totalRupees = 169;
    else if (durationWeeks <= 8) totalRupees = 199;
    else if (durationWeeks <= 12) totalRupees = 299;
    else if (durationWeeks <= 16) totalRupees = 399;
    else if (durationWeeks <= 20) totalRupees = 499;
    else totalRupees = 599;
  }

  const totalPaise = totalRupees * 100;
  // Prices are inclusive of GST
  const gstFactor = 1 + env.GST_PERCENT / 100;
  const basePaise = Math.round(totalPaise / gstFactor);
  const gstPaise = totalPaise - basePaise;

  return {
    baseAmount: (basePaise / 100).toFixed(2),
    gstAmount: (gstPaise / 100).toFixed(2),
    totalAmount: (totalPaise / 100).toFixed(2),
    gstPercent: env.GST_PERCENT,
    totalPaise,
    currency: env.CURRENCY,
    durationWeeks: durationWeeks ?? 4,
  };
}
