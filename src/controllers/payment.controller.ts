import { paymentService } from '../services/payment.service';
import { asyncHandler } from '../utils/helpers';
import { ok, sendPdf, v } from '../utils/http';

export const paymentController = {
  createOrder: asyncHandler(async (req, res) =>
    ok(res, await paymentService.createCertificateOrder(req.user!.id, v(res).params.id), 'Payment order created successfully', 201),
  ),
  webhook: asyncHandler(async (req, res) => {
    const sig = req.headers['x-razorpay-signature'];
    ok(res, await paymentService.handleWebhook(req.body as Buffer, typeof sig === 'string' ? sig : undefined), 'Webhook processed successfully');
  }),
  verify: asyncHandler(async (req, res) =>
    ok(res, await paymentService.verifyClientPayment(req.user!.id, v(res).body), 'Payment verified and certificate generated successfully'),
  ),
  receipt: asyncHandler(async (req, res) => {
    const { fullPath, filename } = await paymentService.receipt(v(res).params.id, req.user!);
    sendPdf(res, fullPath, filename);
  }),
  listMine: asyncHandler(async (req, res) =>
    ok(res, await paymentService.listMine(req.user!.id), 'Payments retrieved successfully'),
  ),
  get: asyncHandler(async (req, res) =>
    ok(res, await paymentService.getOwned(v(res).params.id, req.user!), 'Payment details retrieved successfully'),
  ),
  adminList: asyncHandler(async (_req, res) =>
    ok(res, await paymentService.adminList(v(res).query), 'Payments retrieved successfully'),
  ),
  adminRefund: asyncHandler(async (_req, res) =>
    ok(res, await paymentService.adminRefund(v(res).params.id, v(res).body.reason), 'Payment refunded successfully'),
  ),
};
