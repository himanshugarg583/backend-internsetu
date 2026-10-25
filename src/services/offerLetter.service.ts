import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { safeFilename, storage } from '../config/storage';
import { fillPlaceholders, renderPdf } from '../integrations/pdf/pdf';
import { offerLetterModel } from '../models/offerLetter.model';
import { formatDate } from '../utils/helpers';
import { internshipService } from './internship.service';

async function generate(enrollmentId: string) {
  const e = await prisma.internshipEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { user: true, domain: true },
  });
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
