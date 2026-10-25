import { domainService } from '../services/domain.service';
import { asyncHandler } from '../utils/helpers';
import { ok, v } from '../utils/http';

export const domainController = {
  list: asyncHandler(async (_req, res) => ok(res, await domainService.listPublic(v(res).query))),
  getBySlug: asyncHandler(async (_req, res) => ok(res, await domainService.getPublicBySlug(v(res).params.slug))),
  adminList: asyncHandler(async (_req, res) => ok(res, await domainService.listAdmin(v(res).query))),
  adminGet: asyncHandler(async (_req, res) => ok(res, await domainService.getById(v(res).params.id))),
  adminCreate: asyncHandler(async (_req, res) => ok(res, await domainService.create(v(res).body), 201)),
  adminUpdate: asyncHandler(async (_req, res) => ok(res, await domainService.update(v(res).params.id, v(res).body))),
  adminSetStatus: asyncHandler(async (_req, res) =>
    ok(res, await domainService.update(v(res).params.id, { isActive: v(res).body.isActive })),
  ),
};
