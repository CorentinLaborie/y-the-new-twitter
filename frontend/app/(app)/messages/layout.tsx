import { requireSession } from '../session-guard';
import { MessagesShell } from '@/components/messages/messages-shell';

/** The Messages area: the list beside the open conversation on desktop (07 · Messages boards). */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  return <MessagesShell>{children}</MessagesShell>;
}
