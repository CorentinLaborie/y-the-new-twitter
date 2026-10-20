import { Injectable } from '@nestjs/common';
import { SessionData, Store } from 'express-session';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../database/generated/client/client';

declare module 'express-session' {
  interface SessionData {
    /** The logged-in user, kept in the sessions.user_id column too (DEC-071). */
    userId?: string;
  }
}

/** Sliding lifetime of a session: 30 days after the last request (DEC-027). */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * express-session store on the `sessions` table (DEC-071). One row per session. An expired row
 * is never returned; the daily job deletes it (DEC-068).
 */
@Injectable()
export class SessionStore extends Store {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  get(sid: string, callback: (error: unknown, session?: SessionData | null) => void): void {
    this.prisma.session.findFirst({ where: { id: sid, expiresAt: { gt: new Date() } } }).then(
      (row) => callback(null, row ? (row.data as unknown as SessionData) : null),
      (error: unknown) => callback(error),
    );
  }

  set(sid: string, session: SessionData, callback?: (error?: unknown) => void): void {
    const expiresAt = expiryOf(session);
    const userId = typeof session.userId === 'string' ? session.userId : null;
    const data = session as unknown as Prisma.InputJsonObject;

    this.prisma.session
      .upsert({
        where: { id: sid },
        create: { id: sid, userId, data, expiresAt },
        update: { userId, data, expiresAt, lastAccessAt: new Date() },
      })
      .then(
        () => callback?.(null),
        (error: unknown) => callback?.(error),
      );
  }

  touch(sid: string, session: SessionData, callback?: (error?: unknown) => void): void {
    this.prisma.session
      .updateMany({ where: { id: sid }, data: { expiresAt: expiryOf(session), lastAccessAt: new Date() } })
      .then(
        () => callback?.(null),
        (error: unknown) => callback?.(error),
      );
  }

  destroy(sid: string, callback?: (error?: unknown) => void): void {
    this.prisma.session.deleteMany({ where: { id: sid } }).then(
      () => callback?.(null),
      (error: unknown) => callback?.(error),
    );
  }
}

function expiryOf(session: SessionData): Date {
  return session.cookie?.expires
    ? new Date(session.cookie.expires)
    : new Date(Date.now() + SESSION_LIFETIME_MS);
}
