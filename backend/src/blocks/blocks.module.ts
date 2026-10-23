import { Module } from '@nestjs/common';
import { BlocksController } from './blocks.controller';
import { BlocksRepository } from './blocks.repository';
import { BlocksService } from './blocks.service';

@Module({
  controllers: [BlocksController],
  providers: [BlocksService, BlocksRepository],
})
export class BlocksModule {}
