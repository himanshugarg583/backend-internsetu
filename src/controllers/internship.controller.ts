import { internshipService } from '../services/internship.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const internshipController = {
  enroll: asyncHandler(async (req, res) =>
    ok(res, await internshipService.enroll(req.user!.id, v(res).body), 'Enrolled in internship successfully', 201),
  ),
  listMine: asyncHandler(async (req, res) =>
    ok(res, await internshipService.listMine(req.user!.id), 'Internships retrieved successfully'),
  ),
  get: asyncHandler(async (req, res) =>
    ok(res, await internshipService.getDetail(v(res).params.id, req.user!), 'Internship details retrieved successfully'),
  ),
  progress: asyncHandler(async (req, res) => {
    const e = await internshipService.getOwned(v(res).params.id, req.user!);
    ok(res, await internshipService.progress(e.id), 'Internship progress retrieved successfully');
  }),
  eligibility: asyncHandler(async (req, res) => {
    const e = await internshipService.getOwned(v(res).params.id, req.user!);
    ok(res, await internshipService.eligibility(e.id), 'Certificate eligibility retrieved successfully');
  }),
  adminList: asyncHandler(async (_req, res) =>
    ok(res, await internshipService.adminList(v(res).query), 'Internships retrieved successfully'),
  ),
  adminCancel: asyncHandler(async (_req, res) =>
    ok(res, await internshipService.adminCancel(v(res).params.id, v(res).body.reason), 'Internship cancelled successfully'),
  ),
  adminGet: asyncHandler(async (_req, res) =>
    ok(res, await internshipService.adminGet(v(res).params.id), 'Internship details retrieved successfully'),
  ),
};
