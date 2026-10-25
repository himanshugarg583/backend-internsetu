import { adminService } from '../services/admin.service';
import { settingsService } from '../services/settings.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const adminController = {
  stats: asyncHandler(async (_req, res) => ok(res, await adminService.stats())),
  paymentReport: asyncHandler(async (_req, res) => ok(res, await adminService.paymentReport(v(res).query))),
  registrationReport: asyncHandler(async (_req, res) => ok(res, await adminService.registrationReport(v(res).query))),
  reportsOverview: asyncHandler(async (_req, res) => ok(res, await adminService.reportsOverview(v(res).query))),
  domainEnrollmentsReport: asyncHandler(async (_req, res) => ok(res, await adminService.domainEnrollmentsReport(v(res).query))),
  internshipStatusReport: asyncHandler(async (_req, res) => ok(res, await adminService.internshipStatusReport(v(res).query))),
  taskCompletionReport: asyncHandler(async (_req, res) => ok(res, await adminService.taskCompletionReport(v(res).query))),
  certificatesReport: asyncHandler(async (_req, res) => ok(res, await adminService.certificatesReport(v(res).query))),
  paymentStatusReport: asyncHandler(async (_req, res) => ok(res, await adminService.paymentStatusReport(v(res).query))),
  activity: asyncHandler(async (_req, res) => ok(res, await adminService.activity(v(res).query.limit))),
  getSettings: asyncHandler(async (_req, res) => ok(res, await settingsService.get())),
  updateSettings: asyncHandler(async (req, res) => ok(res, await settingsService.update(req.user!.id, v(res).body))),
};
