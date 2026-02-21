import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test user
  const user = await prisma.user.upsert({
    where: { email: 'test@ledgly.dev' },
    update: {},
    create: {
      email: 'test@ledgly.dev',
      name: 'Test User',
    },
  });
  console.log('Created user:', user.email);

  // Create test organization
  const org = await prisma.organization.upsert({
    where: { id: 'test-org-id' },
    update: {},
    create: {
      id: 'test-org-id',
      name: 'Test Fraternity',
      timezone: 'America/New_York',
    },
  });
  console.log('Created org:', org.name);

  // Create membership (user as admin)
  const membership = await prisma.membership.upsert({
    where: {
      orgId_userId: {
        orgId: org.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      orgId: org.id,
      userId: user.id,
      role: 'ADMIN',
      status: 'ACTIVE',
      name: user.name,
    },
  });
  console.log('Created membership:', membership.role);

  // Create some test members
  const memberNames = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Williams', 'Chris Brown'];
  for (const name of memberNames) {
    await prisma.membership.upsert({
      where: {
        id: `member-${name.toLowerCase().replace(' ', '-')}`,
      },
      update: {},
      create: {
        id: `member-${name.toLowerCase().replace(' ', '-')}`,
        orgId: org.id,
        role: 'MEMBER',
        status: 'ACTIVE',
        name: name,
      },
    });
  }
  console.log('Created test members');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
