import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { certificateFee } from '../config/payment';
import { AppError } from '../utils/AppError';

const SINGLETON_ID = 1;

export const DEFAULT_NOTIFICATIONS = {
  emailOnRegistration: true,
  emailOnSubmissionReview: true,
  emailOnPayment: true,
  emailOnCertificate: true,
  adminDigest: false,
};
type Notifications = typeof DEFAULT_NOTIFICATIONS;

export interface SettingsUpdate {
  platformName?: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  notifications?: Partial<Notifications>;
}

async function load() {
  return prisma.platformSetting.upsert({ where: { id: SINGLETON_ID }, update: {}, create: { id: SINGLETON_ID } });
}

function present(s: Awaited<ReturnType<typeof load>>) {
  const fee = certificateFee();
  return {
    platformName: s.platformName,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    notifications: { ...DEFAULT_NOTIFICATIONS, ...((s.notifications as Partial<Notifications>) ?? {}) },
    updatedAt: s.updatedAt,
    updatedById: s.updatedById,
    // Read-only: fees/GST and business rules are configured via environment variables.
    readOnly: {
      certificateBaseFee: fee.baseAmount,
      gstPercent: fee.gstPercent,
      gstAmount: fee.gstAmount,
      totalFee: fee.totalAmount,
      currency: fee.currency,
      allowedDurationsWeeks: env.allowedDurations,
      certificateMinProgress: env.CERTIFICATE_MIN_PROGRESS,
    },
  };
}

export const settingsService = {
  get: async () => present(await load()),

  async update(adminId: string, input: SettingsUpdate) {
    if (Object.keys(input).length === 0) throw AppError.badRequest('Provide at least one setting to update');
    const current = await load();
    const notifications = input.notifications
      ? { ...DEFAULT_NOTIFICATIONS, ...((current.notifications as Partial<Notifications>) ?? {}), ...input.notifications }
      : undefined;
    const updated = await prisma.platformSetting.update({
      where: { id: SINGLETON_ID },
      data: {
        platformName: input.platformName,
        supportEmail: input.supportEmail,
        supportPhone: input.supportPhone,
        ...(notifications && { notifications: notifications as Prisma.InputJsonObject }),
        updatedById: adminId,
      },
    });
    return present(updated);
  },
};
