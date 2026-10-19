import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHealth } from '@/lib/api-client';
import { HealthStatus } from './health-status';

vi.mock('@/lib/api-client', () => ({ getHealth: vi.fn() }));

describe('HealthStatus', () => {
  beforeEach(() => {
    vi.mocked(getHealth).mockReset();
  });

  it('says the API is available when every check is up', async () => {
    vi.mocked(getHealth).mockResolvedValue({
      reachable: true,
      healthy: true,
      components: { database: 'up' },
    });

    render(await HealthStatus());

    expect(screen.getByRole('status')).toHaveTextContent('API disponible');
  });

  it('says the API is degraded when the backend answers but a check is down', async () => {
    vi.mocked(getHealth).mockResolvedValue({
      reachable: true,
      healthy: false,
      components: { database: 'down' },
    });

    render(await HealthStatus());

    expect(screen.getByRole('status')).toHaveTextContent('API dégradée');
  });

  it('says the API is unreachable when the backend does not answer', async () => {
    vi.mocked(getHealth).mockResolvedValue({ reachable: false, healthy: false, components: {} });

    render(await HealthStatus());

    expect(screen.getByRole('status')).toHaveTextContent('API injoignable');
  });
});
