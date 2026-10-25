import { paymentService } from '../services/payment.service';
import { asyncHandler } from '../utils/helpers';
import { ok, sendPdf, v } from '../utils/http';

export const paymentController = {
  createOrder: asyncHandler(async (req, res) =>
    ok(res, await paymentService.createCertificateOrder(req.user!.id, v(res).params.id), 201),
  ),
  webhook: asyncHandler(async (req, res) => {
    const sig = req.headers['x-razorpay-signature'];
    ok(res, await paymentService.handleWebhook(req.body as Buffer, typeof sig === 'string' ? sig : undefined));
  }),
  verify: asyncHandler(async (req, res) => ok(res, await paymentService.verifyClientPayment(req.user!.id, v(res).body))),
  receipt: asyncHandler(async (req, res) => {
    const { fullPath, filename } = await paymentService.receipt(v(res).params.id, req.user!);
    sendPdf(res, fullPath, filename);
  }),
  listMine: asyncHandler(async (req, res) => ok(res, await paymentService.listMine(req.user!.id))),
  get: asyncHandler(async (req, res) => ok(res, await paymentService.getOwned(v(res).params.id, req.user!))),
  adminList: asyncHandler(async (_req, res) => ok(res, await paymentService.adminList(v(res).query))),
  adminRefund: asyncHandler(async (_req, res) =>
    ok(res, await paymentService.adminRefund(v(res).params.id, v(res).body.reason)),
  ),
};
