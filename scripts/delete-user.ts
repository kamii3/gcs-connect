import { PrismaClient } from '@prisma/client';
import { purgeUserFromDatabase } from '../src/server/routes/admin';

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === '--help' || arg === '-h') {
    console.log(`
Usage:
  npx tsx scripts/delete-user.ts --list
  npx tsx scripts/delete-user.ts <email-or-id>
  npx tsx scripts/delete-user.ts --all-non-admin
    `);
    process.exit(0);
  }

  if (arg === '--list') {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        roles: { select: { role: true } },
      },
    });
    console.log('\n=== CURRENT REGISTERED USERS ===');
    for (const u of users) {
      console.log(`- [${u.status}] ${u.fullName} <${u.email}> (${u.id}) [Roles: ${u.roles.map(r => r.role).join(', ')}]`);
    }
    console.log(`Total: ${users.length} users.\n`);
    return;
  }

  if (arg === '--all-non-admin') {
    const nonAdminUsers = await prisma.user.findMany({
      where: {
        email: { not: 'admin@globalcrestsolutions.com' },
        roles: {
          none: {
            role: 'SUPER_ADMIN',
          },
        },
      },
      select: { id: true, email: true, fullName: true },
    });

    if (nonAdminUsers.length === 0) {
      console.log('No non-admin users found to delete.');
      return;
    }

    console.log(`Found ${nonAdminUsers.length} non-admin user(s) to permanently purge:`);
    for (const u of nonAdminUsers) {
      console.log(`- ${u.fullName} <${u.email}> (${u.id})`);
    }

    let purged = 0;
    for (const u of nonAdminUsers) {
      await prisma.$transaction(async (tx) => {
        await purgeUserFromDatabase(tx, u.id);
        purged++;
      });
      console.log(`Purged: ${u.email}`);
    }

    console.log(`\nSuccessfully purged ${purged} non-admin user(s) from database.`);
    return;
  }

  // Single user by email or ID
  const target = await prisma.user.findFirst({
    where: {
      OR: [{ email: arg }, { id: arg }],
    },
    include: { roles: true },
  });

  if (!target) {
    console.error(`User not found with email or ID: ${arg}`);
    process.exit(1);
  }

  if (target.email === 'admin@globalcrestsolutions.com' || target.roles.some((r) => r.role === 'SUPER_ADMIN')) {
    console.error('Cannot delete root super administrator account.');
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    await purgeUserFromDatabase(tx, target.id);
  });

  console.log(`Successfully purged user ${target.fullName} <${target.email}> (${target.id}) and all associated cryptographic keys, devices, and sessions.`);
}

main()
  .catch((e) => {
    console.error('Error deleting user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
