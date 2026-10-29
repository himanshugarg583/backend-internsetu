import { adminService } from '../services/admin.service';
import { settingsService } from '../services/settings.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const adminController = {
  stats: asyncHandler(async (_req, res) =>
    ok(res, await adminService.stats(), 'Dashboard statistics retrieved successfully'),
  ),
  paymentReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.paymentReport(v(res).query), 'Payment report retrieved successfully'),
  ),
  registrationReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.registrationReport(v(res).query), 'Registration report retrieved successfully'),
  ),
  reportsOverview: asyncHandler(async (_req, res) =>
    ok(res, await adminService.reportsOverview(v(res).query), 'Reports overview retrieved successfully'),
  ),
  domainEnrollmentsReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.domainEnrollmentsReport(v(res).query), 'Domain enrollments report retrieved successfully'),
  ),
  internshipStatusReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.internshipStatusReport(v(res).query), 'Internship status report retrieved successfully'),
  ),
  taskCompletionReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.taskCompletionReport(v(res).query), 'Task completion report retrieved successfully'),
  ),
  certificatesReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.certificatesReport(v(res).query), 'Certificates report retrieved successfully'),
  ),
  paymentStatusReport: asyncHandler(async (_req, res) =>
    ok(res, await adminService.paymentStatusReport(v(res).query), 'Payment status report retrieved successfully'),
  ),
  activity: asyncHandler(async (_req, res) =>
    ok(res, await adminService.activity(v(res).query.limit), 'Activity logs retrieved successfully'),
  ),
  publicConfig: asyncHandler(async (_req, res) =>
    ok(res, settingsService.publicConfig(), 'Public configuration retrieved successfully'),
  ),
  getSettings: asyncHandler(async (_req, res) =>
    ok(res, await settingsService.get(), 'Platform settings retrieved successfully'),
  ),
  updateSettings: asyncHandler(async (req, res) =>
    ok(res, await settingsService.update(req.user!.id, v(res).body), 'Platform settings updated successfully'),
  ),
};
