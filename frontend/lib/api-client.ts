/** Health of the backend, as reported by /health (outside the /api/v1 prefix). */
export type HealthReport = {
  reachable: boolean;
  healthy: boolean;
  components: Record<string, string>;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/**
 * Reads /health. A 503 is a report (some check is down), not an error: the page shows it.
 * An unreachable backend is reported too, so the page never fails because of the API.
 */
export async function getHealth(): Promise<HealthReport> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    const body = (await response.json()) as {
      status?: string;
      details?: Record<string, { status: string }>;
    };
    const components = Object.fromEntries(
      Object.entries(body.details ?? {}).map(([name, check]) => [name, check.status]),
    );

    return { reachable: true, healthy: response.ok && body.status === 'ok', components };
  } catch {
    return { reachable: false, healthy: false, components: {} };
  }
}
