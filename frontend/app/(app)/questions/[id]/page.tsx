import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '../../session-guard';
import { ShareView } from './share-view';

/** Share view of one question (F11): reached from a copied link, not from the navigation. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The title names no question and no person (the page can be shared). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Question — Y' };
}

export default async function QuestionSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  // The layout already checks the session; requireSession is cached for the render, so this call costs nothing more.
  const user = await requireSession();

  return <ShareView questionId={id} viewerHandle={user.handle} />;
}
