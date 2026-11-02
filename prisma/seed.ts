import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth-crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding GCS CONNECT database...');

  // 1. Seed System Administrator
  const adminPasswordHash = await hashPassword('ChangeMeOnFirstLogin2026!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@globalcrestsolutions.com' },
    update: {},
    create: {
      email: 'admin@globalcrestsolutions.com',
      passwordHash: adminPasswordHash,
      fullName: 'Global Crest Administrator',
      displayName: 'System Admin',
      status: 'ACTIVE',
      roles: {
        create: {
          role: 'SUPER_ADMIN',
          assignedBy: 'SYSTEM_BOOTSTRAP',
        },
      },
    },
  });
  console.log(`✓ Admin seeded: ${admin.email}`);

  // 2. Seed Alice Walker (Security Lead)
  const alicePasswordHash = await hashPassword('AliceSecurePass2026!');
  const alice = await prisma.user.upsert({
    where: { email: 'alice@globalcrestsolutions.com' },
    update: {},
    create: {
      email: 'alice@globalcrestsolutions.com',
      passwordHash: alicePasswordHash,
      fullName: 'Alice Walker',
      displayName: 'Alice (Security)',
      status: 'ACTIVE',
      roles: {
        create: {
          role: 'SECURITY_AUDITOR',
          assignedBy: admin.id,
        },
      },
    },
  });
  console.log(`✓ User seeded: ${alice.email}`);

  // 3. Seed Bob Vance (DevOps Lead)
  const bobPasswordHash = await hashPassword('BobDevOpsPass2026!');
  const bob = await prisma.user.upsert({
    where: { email: 'bob@globalcrestsolutions.com' },
    update: {},
    create: {
      email: 'bob@globalcrestsolutions.com',
      passwordHash: bobPasswordHash,
      fullName: 'Bob Vance',
      displayName: 'Bob (DevOps)',
      status: 'ACTIVE',
      roles: {
        create: {
          role: 'USER',
          assignedBy: admin.id,
        },
      },
    },
  });
  console.log(`✓ User seeded: ${bob.email}`);

  // 4. Seed Devices for Alice and Bob
  const aliceDevice = await prisma.device.upsert({
    where: {
      userId_deviceFingerprint: {
        userId: alice.id,
        deviceFingerprint: 'fp-alice-workstation-chrome-01',
      },
    },
    update: {},
    create: {
      userId: alice.id,
      deviceName: 'Alice ThinkPad (Chromium)',
      deviceFingerprint: 'fp-alice-workstation-chrome-01',
      clientPlatform: 'WEB_CHROME',
      isActive: true,
      identityKey: {
        create: {
          publicIdentityKey: 'b64_IK_Alice_p256_mock_public_key_curve25519_sample_data==',
          keyAlgorithm: 'Curve25519',
        },
      },
      keyMetadata: {
        create: {
          activeOneTimePrekeyCount: 100,
          signedPrekeyRotationDueAt: new Date(Date.now() + 30 * 86400000),
        },
      },
      signedPrekeys: {
        create: {
          keyId: 1,
          publicKey: 'b64_SPK_Alice_mock_public_key_data==',
          signature: 'b64_SPK_Signature_Alice_verified_by_IK==',
          isActive: true,
        },
      },
    },
  });

  const bobDevice = await prisma.device.upsert({
    where: {
      userId_deviceFingerprint: {
        userId: bob.id,
        deviceFingerprint: 'fp-bob-macbook-chrome-01',
      },
    },
    update: {},
    create: {
      userId: bob.id,
      deviceName: 'Bob MacBook Pro (Chromium)',
      deviceFingerprint: 'fp-bob-macbook-chrome-01',
      clientPlatform: 'WEB_CHROME',
      isActive: true,
      identityKey: {
        create: {
          publicIdentityKey: 'b64_IK_Bob_p256_mock_public_key_curve25519_sample_data==',
          keyAlgorithm: 'Curve25519',
        },
      },
      keyMetadata: {
        create: {
          activeOneTimePrekeyCount: 100,
          signedPrekeyRotationDueAt: new Date(Date.now() + 30 * 86400000),
        },
      },
      signedPrekeys: {
        create: {
          keyId: 1,
          publicKey: 'b64_SPK_Bob_mock_public_key_data==',
          signature: 'b64_SPK_Signature_Bob_verified_by_IK==',
          isActive: true,
        },
      },
    },
  });

  console.log('✓ Devices & E2EE public keys registered');

  // 5. Seed Conversation between Alice and Bob
  const existingConv = await prisma.conversationMember.findFirst({
    where: { userId: alice.id },
    include: { conversation: true },
  });

  let conversationId = existingConv?.conversationId;

  if (!conversationId) {
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        title: null,
        isEncrypted: true,
        members: {
          create: [
            { userId: alice.id, role: 'OWNER' },
            { userId: bob.id, role: 'MEMBER' },
          ],
        },
      },
    });
    conversationId = conv.id;

    // Seed Initial End-to-End Encrypted Messages (Base64 Ciphertext)
    await prisma.message.create({
      data: {
        conversationId,
        senderDeviceId: aliceDevice.id,
        recipientDeviceId: bobDevice.id,
        messageType: 'TEXT',
        encryptedPayload: 'b64_CIPHERTEXT_AES_256_GCM_918203810284019284019283019284==',
        initializationVector: 'b64_IV_12bytes_sample==',
        authTag: 'b64_AUTHTAG_16bytes==',
        ratchetSequenceNumber: 0,
        previousChainLength: 0,
      },
    });
  }

  // 6. Seed Sticker Pack
  await prisma.stickerPack.upsert({
    where: { id: 'pack-security-essentials-v1' },
    update: {},
    create: {
      id: 'pack-security-essentials-v1',
      name: 'GCS Security Essentials',
      author: 'Global Crest Solutions',
      thumbnailUrl: '/stickers/security/shield.png',
      stickers: {
        create: [
          { imageUrl: '/stickers/security/lock.png', emoji: '🔒', sortOrder: 0 },
          { imageUrl: '/stickers/security/shield.png', emoji: '🛡️', sortOrder: 1 },
          { imageUrl: '/stickers/security/key.png', emoji: '🔑', sortOrder: 2 },
        ],
      },
    },
  });
  console.log('✓ Sticker pack seeded');

  // 7. Seed Administrative Audit Log
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      actorEmail: admin.email,
      action: 'SYSTEM_BOOTSTRAP',
      entityType: 'SYSTEM',
      entityId: 'gcs_connect_init',
      details: JSON.stringify({
        databaseEngine: 'MySQL 8+ / MariaDB 11',
        e2eeBaseline: 'X3DH + Double Ratchet (AES-256-GCM)',
        seededUsers: [admin.email, alice.email, bob.email],
      }),
    },
  });
  console.log('✓ Audit log entry recorded');
  console.log('Database seeding completed successfully! 🚀');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
