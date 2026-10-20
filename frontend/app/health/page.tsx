import { Suspense } from 'react';
import { HealthStatus } from '@/components/health-status';
import styles from './page.module.css';
import feedback from '@/components/feedback.module.css';

export default function HealthPage() {
  return (
    <main className={feedback.main}>
      <h1 className={styles.title}>Y</h1>
      <Suspense fallback={<p className={feedback.text}>Vérification de l’API…</p>}>
        <HealthStatus />
      </Suspense>
    </main>
  );
}
