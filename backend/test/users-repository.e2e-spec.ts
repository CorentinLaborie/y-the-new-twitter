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
});
