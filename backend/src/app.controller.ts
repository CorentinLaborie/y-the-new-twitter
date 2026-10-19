import { Controller, Get } from '@nestjs/common';

@Controller('status')
export class AppController {
  @Get()
  status() {
    return { service: 'y-backend', apiVersion: 'v1' };
  }
}
