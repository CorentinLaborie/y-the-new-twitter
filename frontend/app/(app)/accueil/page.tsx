import { requireSession } from '../session-guard';

export default async function AccueilPage() {
  await requireSession();

  return (
    <main>
      <h1>Accueil</h1>
    </main>
  );
}
