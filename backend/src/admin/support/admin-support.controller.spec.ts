import { ADMIN_REAUTH_KEY } from '../admin.decorators';
import { AdminSupportController } from './admin-support.controller';
import type { AdminSupportService } from './admin-support.service';

const ADMIN = { id: '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f' };
const THREAD_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

describe('AdminSupportController', () => {
  it('needs a re-authentication to close a thread (DEC-088)', () => {
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminSupportController.prototype.close)).toBe(true);
  });

  it('does not need a re-authentication to answer a thread, nor to read the threads', () => {
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminSupportController.prototype.reply)).toBe(false);
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminSupportController.prototype.list)).toBe(false);
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminSupportController.prototype.view)).toBe(false);
  });

  it('passes the filters and the page to the service', async () => {
    const service = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const controller = new AdminSupportController(service as unknown as AdminSupportService);

    await controller.list({ status: 'closed', limit: 5 } as never);

    expect(service.list).toHaveBeenCalledWith({ status: 'closed', cursor: undefined, limit: 5 });
  });

  it('passes the administrator, the thread and the trimmed text to the service', async () => {
    const service = { reply: jest.fn().mockResolvedValue({ id: THREAD_ID }) };
    const controller = new AdminSupportController(service as unknown as AdminSupportService);

    await controller.reply(THREAD_ID, { text: 'Votre suspension reste en place.' } as never, ADMIN as never);

    expect(service.reply).toHaveBeenCalledWith(
      ADMIN.id,
      THREAD_ID,
      'Votre suspension reste en place.',
      expect.any(Date),
    );
  });

  it('passes the administrator and the thread to the service when a thread is closed', async () => {
    const service = { close: jest.fn().mockResolvedValue({ id: THREAD_ID }) };
    const controller = new AdminSupportController(service as unknown as AdminSupportService);

    await controller.close(THREAD_ID, ADMIN as never);

    expect(service.close).toHaveBeenCalledWith(ADMIN.id, THREAD_ID, expect.any(Date));
  });
});
