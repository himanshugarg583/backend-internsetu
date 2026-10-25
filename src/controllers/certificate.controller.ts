import { certificateService } from '../services/certificate.service';
import { asyncHandler } from '../utils/helpers';
import { ok, sendPdf, v } from '../utils/http';

export const certificateController = {
  adminIssue: asyncHandler(async (_req, res) => {
    const r = await certificateService.adminIssueForEnrollment(v(res).params.id);
    ok(res, r, r.alreadyIssued ? 200 : 201);
  }),
  listMine: asyncHandler(async (req, res) => ok(res, await certificateService.listMine(req.user!.id))),
  download: asyncHandler(async (req, res) => {
    const { fullPath, filename } = await certificateService.download(v(res).params.id, req.user!);
    sendPdf(res, fullPath, filename);
  }),
  verify: asyncHandler(async (_req, res) => ok(res, await certificateService.verify(v(res).params.uniqueId))),
  adminList: asyncHandler(async (_req, res) => ok(res, await certificateService.adminList(v(res).query))),
  adminGet: asyncHandler(async (_req, res) => ok(res, await certificateService.adminGet(v(res).params.id))),
  revoke: asyncHandler(async (_req, res) =>
    ok(res, await certificateService.revoke(v(res).params.id, v(res).body.reason)),
  ),
};
