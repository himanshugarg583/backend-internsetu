import { domainService } from '../services/domain.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const domainController = {
  list: asyncHandler(async (_req, res) =>
    ok(res, await domainService.listPublic(v(res).query), 'Domains retrieved successfully'),
  ),
  getBySlug: asyncHandler(async (_req, res) =>
    ok(res, await domainService.getPublicBySlug(v(res).params.slug), 'Domain details retrieved successfully'),
  ),
  adminList: asyncHandler(async (_req, res) =>
    ok(res, await domainService.listAdmin(v(res).query), 'Domains retrieved successfully'),
  ),
  adminGet: asyncHandler(async (_req, res) =>
    ok(res, await domainService.getById(v(res).params.id), 'Domain details retrieved successfully'),
  ),
  adminCreate: asyncHandler(async (_req, res) =>
    ok(res, await domainService.create(v(res).body), 'Domain created successfully', 201),
  ),
  adminUpdate: asyncHandler(async (_req, res) =>
    ok(res, await domainService.update(v(res).params.id, v(res).body), 'Domain updated successfully'),
  ),
  adminSetStatus: asyncHandler(async (_req, res) =>
    ok(res, await domainService.update(v(res).params.id, { isActive: v(res).body.isActive }), 'Domain status updated successfully'),
  ),
};
