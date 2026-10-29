import { enquiryService } from '../services/enquiry.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const enquiryController = {
  create: asyncHandler(async (req, res) =>
    ok(res, await enquiryService.create(v(res).body, { ip: req.ip, userAgent: req.get('user-agent') }), 'Your message has been received', 201),
  ),
  adminList: asyncHandler(async (_req, res) => ok(res, await enquiryService.list(v(res).query), 'Enquiries retrieved successfully')),
  adminGet: asyncHandler(async (_req, res) => ok(res, await enquiryService.get(v(res).params.id), 'Enquiry retrieved successfully')),
  adminUpdate: asyncHandler(async (_req, res) =>
    ok(res, await enquiryService.update(v(res).params.id, v(res).body), 'Enquiry updated successfully'),
  ),
};
