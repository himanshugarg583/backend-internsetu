import { submissionService } from '../services/submission.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const submissionController = {
  submit: asyncHandler(async (req, res) => {
    const { id, taskId } = v(res).params;
    ok(res, await submissionService.submit(req.user!, id, taskId, v(res).body), 'Task submission submitted successfully', 201);
  }),
  adminList: asyncHandler(async (_req, res) =>
    ok(res, await submissionService.list(v(res).query), 'Submissions retrieved successfully'),
  ),
  adminGet: asyncHandler(async (_req, res) =>
    ok(res, await submissionService.get(v(res).params.id), 'Submission details retrieved successfully'),
  ),
  approve: asyncHandler(async (req, res) =>
    ok(res, await submissionService.review(req.user!.id, v(res).params.id, 'APPROVED', v(res).body.remarks), 'Submission approved successfully'),
  ),
  reject: asyncHandler(async (req, res) =>
    ok(res, await submissionService.review(req.user!.id, v(res).params.id, 'REJECTED', v(res).body.remarks), 'Submission rejected'),
  ),
};
