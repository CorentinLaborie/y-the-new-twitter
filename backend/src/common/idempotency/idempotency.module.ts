import { Module } from '@nestjs/common';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';

/** Idempotency-Key handling for every POST that creates a resource (section 9.1). */
@Module({
  providers: [IdempotencyService, IdempotencyRepository],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
