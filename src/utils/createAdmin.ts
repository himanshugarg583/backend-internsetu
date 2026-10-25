/**
 * Secure admin bootstrap: npm run admin:create -- --email admin@x.com --name "Admin"
 * Password is read from the ADMIN_PASSWORD env var (never from CLI args, to keep it out of shell history).
 */
import argon2 from 'argon2';
import { prisma } from '../config/database';
import { normalizeEmail } from './helpers';

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get('--email');
  const name = get('--name') ?? 'Administrator';
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Usage: ADMIN_PASSWORD=... npm run admin:create -- --email <email> [--name <name>]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD must be at least 12 characters');
    process.exit(1);
  }
  const normalized = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    console.error(`User ${normalized} already exists (role ${existing.role}). Not modified.`);
    process.exit(1);
  }
  await prisma.user.create({
    data: {
      name,
      email: normalized,
      passwordHash: await argon2.hash(password),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin ${normalized} created.`);
}

main().finally(() => prisma.$disconnect());
