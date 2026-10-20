import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client/client';

/*
 * Fictional data for local development and staging (M0 step 5.1). No real person is in it:
 * the e-mail addresses use the reserved domain example.test, and the password hashes are placeholders
 * that no password matches. Ids are fixed, so running the seed again changes nothing.
 */

const SEED_PASSWORD_HASH = 'seed-placeholder-not-a-password-hash';
const SEED_TERMS_VERSION = '1.0';

const USERS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    handle: 'demo_alice',
    displayName: 'Alice Démo',
    bio: 'Compte fictif.',
  },
  { id: '00000000-0000-4000-8000-000000000002', handle: 'demo_bruno', displayName: 'Bruno Démo', bio: null },
  { id: '00000000-0000-4000-8000-000000000003', handle: 'demo_chloe', displayName: 'Chloé Démo', bio: null },
] as const;

const HASHTAGS = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'demo' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'test_data' },
] as const;

const QUESTIONS = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    authorId: USERS[0].id,
    body: 'Quelle est votre série préférée ? #demo',
    hashtags: [HASHTAGS[0].id],
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    authorId: USERS[1].id,
    body: 'Un café ou un thé pour travailler ? #test_data',
    hashtags: [HASHTAGS[1].id],
  },
] as const;

const REPLIES = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    questionId: QUESTIONS[0].id,
    authorId: USERS[2].id,
    body: 'Une série fictive, bien sûr.',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    questionId: QUESTIONS[1].id,
    authorId: USERS[0].id,
    body: 'Un thé, pour le test.',
  },
] as const;

const FOLLOWS = [
  { followerId: USERS[1].id, followeeId: USERS[0].id },
  { followerId: USERS[2].id, followeeId: USERS[0].id },
] as const;

/** Writes the fictional dataset in one transaction. Safe to run more than once. */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const user of USERS) {
      await tx.user.upsert({
        where: { id: user.id },
        update: {},
        create: {
          id: user.id,
          handle: user.handle,
          displayName: user.displayName,
          email: `${user.handle}@example.test`,
          passwordHash: SEED_PASSWORD_HASH,
          bio: user.bio,
          birthDate: new Date('1990-01-01'),
          status: 'active',
          termsAcceptedAt: new Date(),
          termsVersion: SEED_TERMS_VERSION,
          emailVerifiedAt: new Date(),
        },
      });
    }

    for (const hashtag of HASHTAGS) {
      await tx.hashtag.upsert({
        where: { id: hashtag.id },
        update: {},
        create: { id: hashtag.id, name: hashtag.name },
      });
    }

    for (const question of QUESTIONS) {
      await tx.question.upsert({
        where: { id: question.id },
        update: {},
        create: { id: question.id, authorId: question.authorId, body: question.body },
      });
      for (const hashtagId of question.hashtags) {
        await tx.questionHashtag.upsert({
          where: { questionId_hashtagId: { questionId: question.id, hashtagId } },
          update: {},
          create: { questionId: question.id, hashtagId },
        });
      }
    }

    for (const reply of REPLIES) {
      await tx.reply.upsert({
        where: { id: reply.id },
        update: {},
        create: { id: reply.id, questionId: reply.questionId, authorId: reply.authorId, body: reply.body },
      });
    }

    for (const follow of FOLLOWS) {
      await tx.follow.upsert({
        where: { followerId_followeeId: follow },
        update: {},
        create: follow,
      });
    }

    // Counters follow the rows they count (section 8.3). Set them to the seeded values.
    for (const question of QUESTIONS) {
      const replyCount = REPLIES.filter((reply) => reply.questionId === question.id).length;
      await tx.question.update({ where: { id: question.id }, data: { replyCount } });
    }
    await tx.user.update({ where: { id: USERS[0].id }, data: { followerCount: 2 } });
    await tx.user.update({ where: { id: USERS[1].id }, data: { followingCount: 1 } });
    await tx.user.update({ where: { id: USERS[2].id }, data: { followingCount: 1 } });
  });
}

/** Command-line entry point (`prisma db seed`). Refuses to run in production. */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The seed never runs in production.');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await seedDatabase(prisma);
    console.log('Seed applied: fictional users, hashtags, questions, replies and follows.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
