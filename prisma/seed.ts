import { PrismaClient } from '@prisma/client';

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
}

main().finally(() => prisma.$disconnect());
