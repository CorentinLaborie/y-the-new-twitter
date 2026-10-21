'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { getDashboard, listAuditLog, type AuditEntry, type DashboardView } from '@/lib/admin-api';
import { auditActionLabel, auditResultTone, AUDIT_RESULT_LABELS } from '@/lib/admin-labels';
import { formatAdminDate, formatAdminDateTime, formatAdminDuration } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

/** How many of the latest actions the dashboard shows. */
export const RECENT_ACTIONS_LIMIT = 4;

type ActionsState =
  { status: 'loading' } | { status: 'error'; problem: ApiProblem } | { status: 'ready'; items: AuditEntry[] };

/** The indicators, with the age of the oldest open report in seconds, computed when the figures arrive. */
type IndicatorsState =
  | { status: 'loading' }
  | { status: 'error'; problem: ApiProblem }
  | { status: 'ready'; figures: DashboardView; oldestOpenReportAgeSeconds: number | null };

/** The seconds between a past instant and now (0 for an invalid date, so no age is shown). */
function secondsSince(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : Math.max(0, (Date.now() - time) / 1000);
}

/**
 * Dashboard of the back-office: the indicators of the reports and of the account deletions (section 3.1), and the latest
 * actions of the audit log. The dates are shown in UTC, as the rest of the back-office.
 */
export function DashboardScreen() {
  const [indicators, setIndicators] = useState<IndicatorsState>({ status: 'loading' });
  const [actions, setActions] = useState<ActionsState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    getDashboard().then((result) => {
      if (!current) {
        return;
      }
      setIndicators(
        result.ok
          ? {
              status: 'ready',
              figures: result.body,
              oldestOpenReportAgeSeconds:
                result.body.oldestOpenReportAt === null ? null : secondsSince(result.body.oldestOpenReportAt),
            }
          : { status: 'error', problem: result.problem },
      );
    });
    listAuditLog({ limit: RECENT_ACTIONS_LIMIT }).then((result) => {
      if (!current) {
        return;
      }
      setActions(
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

      {indicators.status === 'loading' ? <AdminLoading /> : null}
      {indicators.status === 'error' ? <AdminLoadError problem={indicators.problem} /> : null}
      {indicators.status === 'ready' ? (
        <dl className={styles.kpis} aria-label="Indicateurs">
          <div className={styles.count}>
            <dt>Signalements ouverts</dt>
            <dd>{indicators.figures.openReportCount}</dd>
            <dd className={styles.kpiNote}>Sans décision à ce jour</dd>
          </div>
          <div className={styles.count}>
            <dt>Plus ancien signalement ouvert</dt>
            <dd>
              {indicators.oldestOpenReportAgeSeconds === null
                ? '—'
                : formatAdminDuration(indicators.oldestOpenReportAgeSeconds)}
            </dd>
            <dd className={styles.kpiNote}>
              {indicators.figures.oldestOpenReportAt === null
                ? 'Aucun signalement ouvert'
                : `Ouvert le ${formatAdminDateTime(indicators.figures.oldestOpenReportAt)}`}
            </dd>
          </div>
          <div className={styles.count}>
            <dt>Délai moyen de traitement</dt>
            <dd>
              {indicators.figures.averageHandlingSeconds === null
                ? '—'
                : formatAdminDuration(indicators.figures.averageHandlingSeconds)}
            </dd>
            <dd className={styles.kpiNote}>Moyenne sur les 30 derniers jours</dd>
          </div>
          <div className={styles.count}>
            <dt>Comptes en attente de suppression</dt>
            <dd>{indicators.figures.pendingDeletionCount}</dd>
            <dd className={styles.kpiNote}>
              {indicators.figures.nextPurgeAt === null
                ? 'Aucune purge programmée'
                : `Prochaine purge le ${formatAdminDate(indicators.figures.nextPurgeAt)}`}
            </dd>
          </div>
        </dl>
      ) : null}

      <section className={styles.panel} aria-labelledby="recent-actions-title">
        <div className={styles.panelBody}>
          <h2 className={styles.panelTitle} id="recent-actions-title">
            Dernières actions
          </h2>
          {actions.status === 'loading' ? <AdminLoading /> : null}
          {actions.status === 'error' ? <AdminLoadError problem={actions.problem} /> : null}
          {actions.status === 'ready' && actions.items.length === 0 ? (
            <p className={styles.stateText}>Aucune action enregistrée pour le moment.</p>
          ) : null}
          {actions.status === 'ready' && actions.items.length > 0 ? (
            <ol className={styles.list}>
              {actions.items.map((entry) => (
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
            <Link href="/admin/reports">Ouvrir les signalements</Link>
            {' · '}
            <Link href="/admin/users">Rechercher un compte</Link>
            {' · '}
            <Link href="/admin/audit">Voir le journal complet</Link>
          </p>
        </div>
      </section>
    </AdminPage>
  );
}
