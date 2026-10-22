import { ConfigService } from '@nestjs/config';
import { MaintenancePrismaService } from '../auth/purge/maintenance-prisma.service';
import { PrismaService } from './prisma.service';

const URL = 'postgresql://app:secret@127.0.0.1:5432/y';

describe('Prisma services shut down with the application', () => {
  it('closes the application connection when the module is destroyed', async () => {
    const service = new PrismaService(new ConfigService({ DATABASE_URL: URL }));
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('closes the maintenance connection when the module is destroyed', async () => {
    const service = new MaintenancePrismaService(
      new ConfigService({ DATABASE_MAINTENANCE_URL: URL }),
    );
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
