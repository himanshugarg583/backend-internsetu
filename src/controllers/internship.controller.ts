import { internshipService } from '../services/internship.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const internshipController = {
  enroll: asyncHandler(async (req, res) => ok(res, await internshipService.enroll(req.user!.id, v(res).body), 201)),
  listMine: asyncHandler(async (req, res) => ok(res, await internshipService.listMine(req.user!.id))),
  get: asyncHandler(async (req, res) => ok(res, await internshipService.getDetail(v(res).params.id, req.user!))),
  progress: asyncHandler(async (req, res) => {
    const e = await internshipService.getOwned(v(res).params.id, req.user!);
    ok(res, await internshipService.progress(e.id));
  }),
  eligibility: asyncHandler(async (req, res) => {
    const e = await internshipService.getOwned(v(res).params.id, req.user!);
    ok(res, await internshipService.eligibility(e.id));
  }),
  adminList: asyncHandler(async (_req, res) => ok(res, await internshipService.adminList(v(res).query))),
  adminGet: asyncHandler(async (_req, res) => ok(res, await internshipService.adminGet(v(res).params.id))),
};
