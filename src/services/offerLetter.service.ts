import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fsp from 'fs/promises';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { safeFilename, storage } from '../config/storage';
import { fillPlaceholders, renderPdf } from '../integrations/pdf/pdf';
import { offerLetterModel } from '../models/offerLetter.model';
import { formatDate } from '../utils/helpers';
import { logger } from '../utils/logger';
import { internshipService } from './internship.service';

const execFileAsync = promisify(execFile);

async function generateWithPython(params: {
  name: string;
  domain: string;
  startDate: Date;
  endDate: Date;
  internId: string;
}): Promise<Buffer | null> {
  const scriptPath = path.resolve(__dirname, '../../templates/infovance_offer_letter.py');
  const assetsPath = path.resolve(__dirname, '../../templates/assets');

  try {
    await fsp.access(scriptPath);
  } catch {
    return null;
  }

  const tmpOut = path.resolve(
    __dirname,
    `../../storage/offer-letters/tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );

  const pythonBin = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
  const args = [
    scriptPath,
    '--name', params.name,
    '--domain', params.domain,
    '--start', params.startDate.toISOString().slice(0, 10),
    '--end', params.endDate.toISOString().slice(0, 10),
    '--intern-id', params.internId,
    '--out', tmpOut,
    '--assets', assetsPath,
  ];

  try {
    await execFileAsync(pythonBin, args);
    const buffer = await fsp.readFile(tmpOut);
    await fsp.rm(tmpOut, { force: true });
    return buffer;
  } catch (err) {
    logger.warn({ err }, 'Python offer letter generator failed; falling back to default pdfkit generator');
    try {
      await fsp.rm(tmpOut, { force: true });
    } catch {
      // ignore
    }
    return null;
  }
}

async function generate(enrollmentId: string) {
  const e = await prisma.internshipEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { user: true, domain: true },
  });

  // Try generating with Python Infovance Offer Letter script first
  const pythonPdf = await generateWithPython({
    name: e.user.name,
    domain: e.domain.name,
    startDate: e.startDate,
    endDate: e.endDate,
    internId: e.internId,
  });

  if (pythonPdf) {
    return storage.save('offer-letters', safeFilename(`offer-${e.internId}`, 'pdf'), pythonPdf);
  }

  // Fallback to template-based PDFKit renderer
  const template = await storage.readTemplate(env.OFFER_LETTER_TEMPLATE);
  const body = fillPlaceholders(template, {
    name: e.user.name,
    domain: e.domain.name,
    duration: `${e.durationWeeks} weeks`,
    start_date: formatDate(e.startDate),
    end_date: formatDate(e.endDate),
    unique_id: e.internId,
    intern_id: e.internId,
    issue_date: formatDate(new Date()),
    college: e.user.college ?? '',
  });
  const pdf = await renderPdf({ title: 'Offer Letter', body, footer: `Intern ID: ${e.internId}` });
  return storage.save('offer-letters', safeFilename(`offer-${e.internId}`, 'pdf'), pdf);
}

export const offerLetterService = {
  /** Generates (once) and returns the offer letter file for an owned enrollment, recording the download. */
  async download(enrollmentId: string, user: { id: string; role: string }) {
    const e = await internshipService.getOwned(enrollmentId, user);
    let letter = await offerLetterModel.findByEnrollment(e.id);

    if (letter && !(await storage.exists(letter.filePath))) {
      const filePath = await generate(e.id);
      letter = await prisma.offerLetter.update({ where: { id: letter.id }, data: { filePath, generatedAt: new Date() } });
    }
    if (!letter) {
      const filePath = await generate(e.id);
      try {
        letter = await prisma.offerLetter.create({ data: { enrollmentId: e.id, filePath } });
      } catch (err) {
        // Concurrent request already created it; discard our copy.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          await storage.remove(filePath);
          letter = await prisma.offerLetter.findUniqueOrThrow({ where: { enrollmentId: e.id } });
        } else {
          await storage.remove(filePath);
          throw err;
        }
      }
    }
    const fullPath = await storage.getFile(letter.filePath);
    if (user.role !== 'ADMIN') await offerLetterModel.recordDownload(letter.id);
    return { fullPath, filename: `Offer-Letter-${e.internId}.pdf` };
  },
};
