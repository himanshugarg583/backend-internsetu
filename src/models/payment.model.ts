import { prisma } from '../config/database';

export const paymentModel = {
  findById: (id: string) => prisma.payment.findUnique({ where: { id }, include: { certificate: true } }),
  findByOrderId: (gatewayOrderId: string) => prisma.payment.findUnique({ where: { gatewayOrderId } }),
};
