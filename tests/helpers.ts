import argon2 from 'argon2';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { ensureStorageDirs } from '../src/config/storage';

ensureStorageDirs();
export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Certificate","Payment","OfferLetter","TaskSubmission","Task","InternshipEnrollment","Domain","Otp","User" CASCADE',
  );
}

export async function seedDomain(slug = 'web-development', normalTasks = 4) {
  const domain = await prisma.domain.create({ data: { name: 'Web Development', slug, category: 'Engineering' } });
  const joining = await prisma.task.create({
    data: { domainId: domain.id, title: 'Joining', description: 'Share offer', sequence: 0, isJoiningTask: true, requiresLinkedin: true },
  });
  const tasks = [];
  for (let i = 1; i <= normalTasks; i++) {
    tasks.push(
      await prisma.task.create({
        data: { domainId: domain.id, title: `Task ${i}`, description: 'Do it', sequence: i, requiresGithub: true },
      }),
    );
  }
  return { domain, joining, tasks };
}

export async function createAdmin() {
  await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@test.com',
      passwordHash: await argon2.hash('AdminPass123'),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
  const r = await api().post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123' });
  return r.body.data.accessToken as string;
}

export async function createStudent(email = 'student@test.com') {
  await prisma.user.create({
    data: {
      name: 'Asha Student',
      email,
      passwordHash: await argon2.hash('Password123'),
      college: 'IIT',
      emailVerifiedAt: new Date(),
    },
  });
  const r = await api().post('/api/v1/auth/login').send({ email, password: 'Password123' });
  return { token: r.body.data.accessToken as string, user: r.body.data.user };
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
