import { prisma, Tx } from '../config/database';

export const enrollmentModel = {
  findById: (id: string) =>
    prisma.internshipEnrollment.findUnique({ where: { id }, include: { domain: true, offerLetter: true } }),

  findWithUser: (id: string) =>
    prisma.internshipEnrollment.findUnique({ where: { id }, include: { domain: true, user: true } }),

  /** Next value from a PostgreSQL sequence: atomic and collision-free under concurrency. */
  async nextSerial(tx: Tx): Promise<number> {
    const rows = await tx.$queryRaw<{ v: bigint }[]>`SELECT nextval('intern_id_seq') AS v`;
    return Number(rows[0].v);
  },
};
