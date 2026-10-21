import { ADMIN_REAUTH_KEY } from '../admin.decorators';
import { AdminDashboardController } from './admin-dashboard.controller';
import type { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardController', () => {
  it('reads the dashboard without a re-authentication', () => {
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminDashboardController.prototype.view)).toBe(false);
  });

  it('gives the service the current time', async () => {
    const service = { view: jest.fn().mockResolvedValue({}) };
    const controller = new AdminDashboardController(service as unknown as AdminDashboardService);

    await controller.view();

    expect(service.view).toHaveBeenCalledWith(expect.any(Date));
  });
});
