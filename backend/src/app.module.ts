import { MiddlewareConsumer, Module, NestModule, RequestMethod, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { GlobalThrottlerGuard } from './auth/rate-limit/global-throttler.guard';
import { RATE_LIMIT_STORAGE, RateLimitModule } from './auth/rate-limit/rate-limit.module';
import { ProblemDetailsFilter } from './common/problem-details/problem-details.filter';
import { CsrfGuard } from './common/csrf/csrf.guard';
import { loggingOptions } from './common/logging/logging.options';
import { validateEnvironment } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { SessionMiddleware } from './common/sessions/session.middleware';
import { SessionsModule } from './common/sessions/sessions.module';
import { HelmetMiddleware } from './common/security/helmet.middleware';
import { HealthModule } from './health/health.module';
import { QuestionsModule } from './questions/questions.module';
import { ReactionsModule } from './reactions/reactions.module';
import { RepliesModule } from './replies/replies.module';
import { BlocksModule } from './blocks/blocks.module';
import { ReportsModule } from './reports/reports.module';
import { FeedModule } from './feed/feed.module';
import { FollowsModule } from './follows/follows.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { MessagesModule } from './messages/messages.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'local'}`, '.env'],
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot(loggingOptions),
    // The global limit counts in PostgreSQL, like the auth limits (DEC-212), so every instance shares one count.
    ThrottlerModule.forRootAsync({
      imports: [RateLimitModule],
      inject: [RATE_LIMIT_STORAGE],
      useFactory: (storage: ThrottlerStorage) => ({ throttlers: [{ ttl: 60_000, limit: 120 }], storage }),
    }),
    DatabaseModule,
    SessionsModule,
    AuthModule,
    AdminModule,
    QuestionsModule,
    ReactionsModule,
    RepliesModule,
    BlocksModule,
    ReportsModule,
    FeedModule,
    FollowsModule,
    BookmarksModule,
    MessagesModule,
    ProfilesModule,
    NotificationsModule,
    SupportModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    HelmetMiddleware,
    SessionMiddleware,
    { provide: APP_GUARD, useClass: GlobalThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule implements NestModule {
  /** Helmet and the session run as Nest middleware (DEC-213): their errors are answered as Problem Details. */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HelmetMiddleware, SessionMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
