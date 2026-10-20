import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';

/** Contact messages of suspended accounts (section 3.4, DEC-078, DEC-080). PrismaService comes from the global DatabaseModule. */
@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportRepository],
})
export class SupportModule {}
