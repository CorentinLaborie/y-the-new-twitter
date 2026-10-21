'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { listAuditLog, type AuditEntry } from '@/lib/admin-api';
import { auditActionLabel, auditResultTone, AUDIT_RESULT_LABELS } from '@/lib/admin-labels';
import { formatAdminDateTime } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

/** How many of the latest actions the dashboard shows. */
export const RECENT_ACTIONS_LIMIT = 4;

type DashboardState =
  { status: 'loading' } | { status: 'error'; problem: ApiProblem } | { status: 'ready'; items: AuditEntry[] };

/** Dashboard of the back-office: the latest actions of the audit log. */
export function DashboardScreen() {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    listAuditLog({ limit: RECENT_ACTIONS_LIMIT }).then((result) => {
      if (!current) {
        return;
      }
      setState(
        result.ok
          ? { status: 'ready', items: result.body.items }
          : { status: 'error', problem: result.problem },
      );
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <AdminPage title="Tableau de bord">
      <p className={styles.intro}>Les adresses e-mail restent masquées dans toutes les vues.</p>
      <section className={styles.panel} aria-labelledby="recent-actions-title">
        <div className={styles.panelBody}>
          <h2 className={styles.panelTitle} id="recent-actions-title">
            Dernières actions
          </h2>
          {state.status === 'loading' ? <AdminLoading /> : null}
          {state.status === 'error' ? <AdminLoadError problem={state.problem} /> : null}
          {state.status === 'ready' && state.items.length === 0 ? (
            <p className={styles.stateText}>Aucune action enregistrée pour le moment.</p>
          ) : null}
          {state.status === 'ready' && state.items.length > 0 ? (
            <ol className={styles.list}>
              {state.items.map((entry) => (
                <li key={entry.id}>
                  <time dateTime={entry.createdAt}>{formatAdminDateTime(entry.createdAt)}</time>
                  <strong>{auditActionLabel(entry.action)}</strong>
                  <StatusLabel tone={auditResultTone(entry.result)}>
                    {AUDIT_RESULT_LABELS[entry.result]}
                  </StatusLabel>
                </li>
              ))}
            </ol>
          ) : null}
          <p className={styles.stateText}>
            <Link href="/admin/users">Rechercher un compte</Link>
            {' · '}
            <Link href="/admin/audit">Voir le journal complet</Link>
          </p>
        </div>
      </section>
    </AdminPage>
  );
}
