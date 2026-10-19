import Link from 'next/link';
import styles from '@/components/feedback.module.css';

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Page introuvable</h1>
      <p className={styles.text}>Cette page n’existe pas, ou n’existe plus.</p>
      <Link href="/" className={styles.link}>
        Retour à l’accueil
      </Link>
    </main>
  );
}
