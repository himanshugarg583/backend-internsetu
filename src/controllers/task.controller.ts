import { internshipService } from '../services/internship.service';
import { taskService } from '../services/task.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const taskController = {
  listForEnrollment: asyncHandler(async (req, res) => {
    const e = await internshipService.getOwned(v(res).params.id, req.user!);
    ok(res, await internshipService.tasks(e.id));
  }),
  adminListAll: asyncHandler(async (_req, res) => ok(res, await taskService.adminListAll(v(res).query))),
  adminList: asyncHandler(async (_req, res) => ok(res, await taskService.listForDomain(v(res).params.id))),
  adminCreate: asyncHandler(async (_req, res) => ok(res, await taskService.create(v(res).params.id, v(res).body), 201)),
  adminUpdate: asyncHandler(async (_req, res) => ok(res, await taskService.update(v(res).params.id, v(res).body))),
  adminSetStatus: asyncHandler(async (_req, res) =>
    ok(res, await taskService.update(v(res).params.id, { isActive: v(res).body.isActive })),
  ),
};
