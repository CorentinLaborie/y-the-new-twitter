import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/session/access.decorators';

@Controller('status')
export class AppController {
  @Public()
  @Get()
  status() {
    return { service: 'y-backend', apiVersion: 'v1' };
  }
}
