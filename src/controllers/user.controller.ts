import { userService } from '../services/user.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const userController = {
  updateMe: asyncHandler(async (req, res) => ok(res, await userService.updateMe(req.user!.id, v(res).body))),
  adminList: asyncHandler(async (_req, res) => ok(res, await userService.list(v(res).query))),
  adminCreate: asyncHandler(async (_req, res) => ok(res, await userService.adminCreate(v(res).body), 201)),
  adminGet: asyncHandler(async (_req, res) => ok(res, await userService.getWithDetails(v(res).params.id))),
  adminSetStatus: asyncHandler(async (req, res) =>
    ok(res, await userService.setStatus(req.user!.id, v(res).params.id, v(res).body.status)),
  ),
};
