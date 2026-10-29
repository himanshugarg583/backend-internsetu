import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const domains = [
  { name: 'Web Development', slug: 'web-development', category: 'Engineering' },
  { name: 'Android Development', slug: 'android-development', category: 'Engineering' },
  { name: 'Data Science', slug: 'data-science', category: 'Data' },
  { name: 'Machine Learning', slug: 'machine-learning', category: 'Data' },
  { name: 'Cyber Security', slug: 'cyber-security', category: 'Security' },
  { name: 'Cloud Computing', slug: 'cloud-computing', category: 'Engineering' },
  { name: 'UI/UX Design', slug: 'ui-ux-design', category: 'Design' },
  { name: 'Digital Marketing', slug: 'digital-marketing', category: 'Marketing' },
  { name: 'Python Programming', slug: 'python-programming', category: 'Engineering' },
  { name: 'Java Programming', slug: 'java-programming', category: 'Engineering' },
  { name: 'Business Analytics', slug: 'business-analytics', category: 'Business' },
  { name: 'Human Resources', slug: 'human-resources', category: 'Management' },
];

async function main() {
  console.log('==> Seeding domains and tasks...');
  for (const d of domains) {
    const domain = await prisma.domain.upsert({
      where: { slug: d.slug },
      update: {},
      create: { ...d, description: `Hands-on ${d.name} internship with practical tasks.` },
    });
    const tasks = [
      {
        sequence: 0,
        title: 'Joining Task: Share your offer letter',
        description: 'Post your InternSetu offer letter on LinkedIn, tag InternSetu, and submit the post link.',
        isJoiningTask: true,
        requiresLinkedin: true,
        requiresGithub: false,
      },
      ...[1, 2, 3, 4].map((n) => ({
        sequence: n,
        title: `${d.name} Task ${n}`,
        description: `Complete ${d.name} task ${n}. Push your work to GitHub and share a LinkedIn post about it.`,
        isJoiningTask: false,
        requiresGithub: true,
        requiresLinkedin: false,
      })),
    ];
    for (const t of tasks) {
      await prisma.task.upsert({
        where: { domainId_sequence: { domainId: domain.id, sequence: t.sequence } },
        update: {},
        create: { ...t, domainId: domain.id },
      });
    }
  }
  console.log(`Seeded ${domains.length} domains with tasks.`);

  // 1. Seed Platform Settings (singleton id = 1)
  console.log('==> Seeding Platform Settings...');
  await prisma.platformSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      platformName: 'InternSetu',
      supportEmail: 'support@internsetu.in',
      supportPhone: '+91 9876543210',
      notifications: {
        emailOnRegistration: true,
        emailOnSubmissionReview: true,
        emailOnPayment: true,
        emailOnCertificate: true,
        adminDigest: false,
      },
    },
  });

  // 2. Seed Admin User
  console.log('==> Seeding Admin User...');
  const adminEmail = 'admin@internsetu.in';
  const adminPassword = 'AdminPassword@123';
  const adminPasswordHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    create: {
      name: 'Admin User',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin seeded: ${admin.email}`);

  // 3. Seed Student User
  console.log('==> Seeding Student User...');
  const studentEmail = 'student@internsetu.in';
  const studentPassword = 'StudentPassword@123';
  const studentPasswordHash = await argon2.hash(studentPassword);

  const student = await prisma.user.upsert({
    where: { email: studentEmail },
    update: {
      passwordHash: studentPasswordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    create: {
      name: 'Demo Student',
      email: studentEmail,
      phone: '9876543210',
      college: 'Delhi Technological University',
      course: 'B.Tech Computer Science',
      academicYear: '3rd Year',
      passwordHash: studentPasswordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Student seeded: ${student.email}`);

  console.log('\n=============================================');
  console.log('Seed completed successfully!');
  console.log('---------------------------------------------');
  console.log(`Admin Email:    ${adminEmail}`);
  console.log(`Admin Password: ${adminPassword}`);
  console.log('---------------------------------------------');
  console.log(`Student Email:    ${studentEmail}`);
  console.log(`Student Password: ${studentPassword}`);
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
