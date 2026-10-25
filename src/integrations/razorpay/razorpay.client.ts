import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env';
import { isRazorpayConfigured } from '../../config/payment';
import { AppError } from '../../utils/AppError';

let client: Razorpay | null = null;

function getClient() {
  if (!isRazorpayConfigured()) throw AppError.config('Razorpay credentials are not configured');
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
  return client;
}

export const razorpayGateway = {
  async createOrder(amountPaise: number, currency: string, receipt: string, notes: Record<string, string>) {
    const order = await getClient().orders.create({ amount: amountPaise, currency, receipt, notes });
    return { id: order.id, amount: Number(order.amount), currency: order.currency };
  },

  async refund(paymentId: string, amountPaise: number) {
    const r = await getClient().payments.refund(paymentId, { amount: amountPaise });
    return { id: r.id, status: r.status };
  },

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  /** Checkout signature: HMAC_SHA256(order_id|payment_id, KEY_SECRET). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!env.RAZORPAY_KEY_SECRET) return false;
    const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  keyId: () => env.RAZORPAY_KEY_ID,
};
