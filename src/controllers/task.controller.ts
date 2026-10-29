import { internshipService } from '../services/internship.service';
import { taskService } from '../services/task.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const taskController = {
  listForEnrollment: asyncHandler(async (req, res) => {
    const e = await internshipService.getOwned(v(res).params.id, req.user!);
    ok(res, await internshipService.tasks(e.id), 'Tasks retrieved successfully');
  }),
  adminListAll: asyncHandler(async (_req, res) =>
    ok(res, await taskService.adminListAll(v(res).query), 'Tasks retrieved successfully'),
  ),
  adminList: asyncHandler(async (_req, res) =>
    ok(res, await taskService.listForDomain(v(res).params.id), 'Domain tasks retrieved successfully'),
  ),
  adminCreate: asyncHandler(async (_req, res) =>
    ok(res, await taskService.create(v(res).params.id, v(res).body), 'Task created successfully', 201),
  ),
  adminUpdate: asyncHandler(async (_req, res) =>
    ok(res, await taskService.update(v(res).params.id, v(res).body), 'Task updated successfully'),
  ),
  adminSetStatus: asyncHandler(async (_req, res) =>
    ok(res, await taskService.update(v(res).params.id, { isActive: v(res).body.isActive }), 'Task status updated successfully'),
  ),
};
