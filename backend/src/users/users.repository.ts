import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface NewUser {
  handle: string;
  displayName: string;
  email: string;
  passwordHash: string;
  birthDate: Date;
  phone: string | null;
  termsAcceptedAt: Date;
  termsVersion: string;
}

/** The only place that reads and writes the `users` table for the account flows (section 8.2). */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** E-mail addresses are stored in lower case (section 9.1). */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /** Handles are unique regardless of case (DEC-061). */
  findByHandle(handle: string) {
    return this.prisma.user.findFirst({
      where: { handle: { equals: handle, mode: "insensitive" } },
    });
  }

  create(user: NewUser) {
    return this.prisma.user.create({
      data: {
        handle: user.handle,
        displayName: user.displayName,
        email: user.email.toLowerCase(),
        passwordHash: user.passwordHash,
        birthDate: user.birthDate,
        phone: user.phone,
        status: "pending_verification",
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
      },
    });
  }
}
