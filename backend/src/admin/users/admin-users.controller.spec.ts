import { ADMIN_REAUTH_KEY } from '../admin.decorators';
import { AdminUsersController } from './admin-users.controller';
import type { AdminUsersService } from './admin-users.service';

const ADMIN = { id: '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f' };
const TARGET_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

describe('AdminUsersController.startDeletion', () => {
  it('needs a re-authentication of the administrator (DEC-088)', () => {
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminUsersController.prototype.startDeletion)).toBe(true);
  });

  it('passes the administrator, the account, the reason and the time to the service', async () => {
    const service = { startDeletion: jest.fn().mockResolvedValue({ id: TARGET_ID }) };
    const controller = new AdminUsersController(service as unknown as AdminUsersService);

    await controller.startDeletion(
      TARGET_ID,
      { reasonCode: 'other', otherReason: 'Compte piraté' } as never,
      ADMIN as never,
    );

    expect(service.startDeletion).toHaveBeenCalledWith(
      ADMIN.id,
      TARGET_ID,
      { reasonCode: 'other', otherReason: 'Compte piraté' },
      expect.any(Date),
    );
  });
});
