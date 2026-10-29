import { certificateService } from '../services/certificate.service';
import { asyncHandler } from '../utils/helpers';
import { ok, sendPdf, v } from '../utils/http';

export const certificateController = {
  adminIssue: asyncHandler(async (_req, res) => {
    const r = await certificateService.adminIssueForEnrollment(v(res).params.id);
    ok(res, r, r.alreadyIssued ? 'Certificate already issued' : 'Certificate issued successfully', r.alreadyIssued ? 200 : 201);
  }),
  listMine: asyncHandler(async (req, res) =>
    ok(res, await certificateService.listMine(req.user!.id), 'Certificates retrieved successfully'),
  ),
  download: asyncHandler(async (req, res) => {
    const { fullPath, filename } = await certificateService.download(v(res).params.id, req.user!);
    sendPdf(res, fullPath, filename);
  }),
  viewHtml: asyncHandler(async (req, res) => {
    const fullPath = await certificateService.getHtml(v(res).params.id, req.user!);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(fullPath);
  }),
  publicHtml: asyncHandler(async (_req, res) => {
    const html = await certificateService.getHtmlByVerificationId(v(res).params.uniqueId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }),
  verify: asyncHandler(async (_req, res) =>
    ok(res, await certificateService.verify(v(res).params.uniqueId), 'Certificate verification details retrieved successfully'),
  ),
  adminList: asyncHandler(async (_req, res) =>
    ok(res, await certificateService.adminList(v(res).query), 'Certificates retrieved successfully'),
  ),
  adminGet: asyncHandler(async (_req, res) =>
    ok(res, await certificateService.adminGet(v(res).params.id), 'Certificate details retrieved successfully'),
  ),
  revoke: asyncHandler(async (_req, res) =>
    ok(res, await certificateService.revoke(v(res).params.id, v(res).body.reason), 'Certificate revoked successfully'),
  ),
};
