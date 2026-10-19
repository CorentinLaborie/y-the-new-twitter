import { getHealth } from '@/lib/api-client';
import styles from './feedback.module.css';

export async function HealthStatus() {
  const health = await getHealth();
  const label = health.reachable ? (health.healthy ? 'API disponible' : 'API dégradée') : 'API injoignable';

  return (
    <p className={styles.text} role="status">
      {label}
    </p>
  );
}
