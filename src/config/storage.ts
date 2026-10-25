import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from './env';
import { AppError } from '../utils/AppError';

export type StorageArea = 'offer-letters' | 'certificates' | 'receipts' | 'templates' | 'uploads';
const AREAS: StorageArea[] = ['offer-letters', 'certificates', 'receipts', 'templates', 'uploads'];

export const storageRoot = path.resolve(env.STORAGE_ROOT);

export function ensureStorageDirs() {
  for (const a of AREAS) fs.mkdirSync(path.join(storageRoot, a), { recursive: true });
}

/** Resolves a relative storage path and refuses anything that escapes the storage root. */
export function resolveSafe(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw AppError.badRequest('Invalid file path');
  }
  const full = path.resolve(storageRoot, relativePath);
  if (full !== storageRoot && !full.startsWith(storageRoot + path.sep)) {
    throw AppError.badRequest('Invalid file path');
  }
  return full;
}

export const safeFilename = (prefix: string, ext: string) =>
  `${prefix.replace(/[^A-Za-z0-9-]/g, '')}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

export const storage = {
  async save(area: StorageArea, filename: string, data: Buffer): Promise<string> {
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) throw AppError.badRequest('Invalid filename');
    const rel = path.posix.join(area, filename);
    const full = resolveSafe(rel);
    const tmp = `${full}.tmp`;
    await fsp.writeFile(tmp, data, { flag: 'wx' });
    await fsp.rename(tmp, full);
    return rel;
  },

  async exists(rel: string) {
    try {
      await fsp.access(resolveSafe(rel));
      return true;
    } catch {
      return false;
    }
  },

  async remove(rel: string) {
    await fsp.rm(resolveSafe(rel), { force: true });
  },

  async readTemplate(name: string): Promise<string> {
    const full = resolveSafe(path.posix.join('templates', name));
    try {
      return await fsp.readFile(full, 'utf8');
    } catch {
      throw AppError.config(`Template "${name}" is not configured in storage/templates`);
    }
  },

  async getFile(rel: string): Promise<string> {
    const full = resolveSafe(rel);
    if (!(await this.exists(rel))) throw AppError.notFound('File not found on storage');
    return full;
  },
};
