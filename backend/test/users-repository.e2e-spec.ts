import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "../src/database/prisma.service";
import { UsersRepository } from "../src/users/users.repository";
import { startMigratedPostgres } from "./support/postgres";

describe("UsersRepository (e2e)", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repository: UsersRepository;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    const config = new ConfigService({
      DATABASE_URL: container.getConnectionUri(),
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        UsersRepository,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(UsersRepository);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  const newUser = {
    handle: "Corentin",
    displayName: "Corentin Démo",
    email: "Corentin@Example.Test",
    passwordHash: "hash",
    birthDate: new Date("1990-01-01"),
    phone: null,
    termsAcceptedAt: new Date(),
    termsVersion: "1.0",
  };

  it("creates a pending account with the e-mail in lower case", async () => {
    const user = await repository.create(newUser);

    expect(user.status).toBe("pending_verification");
    expect(user.email).toBe("corentin@example.test");
  });

  it("finds an account by e-mail, whatever the case of the address", async () => {
    const found = await repository.findByEmail("CORENTIN@example.test");

    expect(found?.handle).toBe("Corentin");
  });

  it("finds an account by handle regardless of letter case", async () => {
    const found = await repository.findByHandle("corentin");

    expect(found?.email).toBe("corentin@example.test");
  });

  it("refuses a second handle that differs only by case (DEC-061)", async () => {
    await expect(
      repository.create({
        ...newUser,
        handle: "CORENTIN",
        email: "other@example.test",
      }),
    ).rejects.toThrow();
  });

  it("refuses a second account with the same e-mail", async () => {
    await expect(
      repository.create({
        ...newUser,
        handle: "other",
        email: "corentin@example.test",
      }),
    ).rejects.toThrow();
  });

  it("drops an inactive account's reactions and replies from the counters, and restores them when it is active again (R13)", async () => {
    const now = new Date();
    const author = await repository.create({ ...newUser, handle: "recount_author", email: "recount_author@example.test" });
    const reactor = await repository.create({ ...newUser, handle: "recount_reactor", email: "recount_reactor@example.test" });
    const liker = await repository.create({ ...newUser, handle: "recount_liker", email: "recount_liker@example.test" });
    await prisma.$transaction((tx) => repository.activate(tx, author.id, now));
    await prisma.$transaction((tx) => repository.activate(tx, reactor.id, now));
    await prisma.$transaction((tx) => repository.activate(tx, liker.id, now));
    const question = await prisma.question.create({
      data: { authorId: author.id, body: "Recount", yCount: 1, likeCount: 1, replyCount: 1 },
    });
    // One reaction per account and question (primary key userId + questionId): the liker holds the like.
    await prisma.questionReaction.create({ data: { userId: reactor.id, questionId: question.id, kind: "y" } });
    await prisma.questionReaction.create({ data: { userId: liker.id, questionId: question.id, kind: "like" } });
    await prisma.reply.create({ data: { questionId: question.id, authorId: reactor.id, body: "Reply" } });
    const reply = await prisma.reply.findFirstOrThrow({ where: { questionId: question.id, authorId: reactor.id } });
    await prisma.replyReaction.create({ data: { userId: reactor.id, replyId: reply.id, kind: "dislike" } });

    const counters = () =>
      prisma.question.findUniqueOrThrow({
        where: { id: question.id },
        select: { yCount: true, likeCount: true, replyCount: true },
      });
    const suspend = (status: "suspended" | "active") =>
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: reactor.id }, data: { status } });
        await repository.recalculateCounters(tx, reactor.id);
      });

    await suspend("suspended");
    expect(await counters()).toEqual({ yCount: 0, likeCount: 1, replyCount: 0 });
    expect(await prisma.replyReaction.count({ where: { replyId: reply.id } })).toBe(1);

    await suspend("active");
    expect(await counters()).toEqual({ yCount: 1, likeCount: 1, replyCount: 1 });
    const restored = await prisma.reply.findUniqueOrThrow({ where: { id: reply.id }, select: { dislikeCount: true } });
    expect(restored.dislikeCount).toBe(1);
  });
});
