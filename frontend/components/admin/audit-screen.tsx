'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import { Button } from '@/components/auth/button';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { listAuditLog, type AuditEntry } from '@/lib/admin-api';
import {
  auditActionLabel,
  auditResultTone,
  auditTargetLabel,
  AUDIT_ACTION_FILTER_OPTIONS,
  AUDIT_RESULT_LABELS,
} from '@/lib/admin-labels';
import { formatAdminDateTime } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

/** Entries per page of the listing. */
const AUDIT_PAGE_SIZE = 20;

/** The list on screen, with the action filter it was read with (the next page keeps that filter). */
type ListState = {
  loading: boolean;
  action: string;
  items: AuditEntry[];
  nextCursor: string | null;
  problem: ApiProblem | null;
};

/** The audit log, newest first. Read only. The filter is by action (the only filter the API has). */
export function AuditScreen() {
  const [action, setAction] = useState('');
  const [list, setList] = useState<ListState>({
    loading: true,
    action: '',
    items: [],
    nextCursor: null,
    problem: null,
  });

  /** Fetches one page and replaces the list (first page) or appends to it (next page). */
  const fetchPage = useCallback(
    (filterAction: string, cursor: string | undefined, previous: AuditEntry[]) => {
      return listAuditLog({ action: filterAction || undefined, cursor, limit: AUDIT_PAGE_SIZE }).then(
        (result) => {
          setList(
            result.ok
              ? {
                  loading: false,
                  action: filterAction,
                  items: [...previous, ...result.body.items],
                  nextCursor: result.body.nextCursor,
                  problem: null,
                }
              : {
                  loading: false,
                  action: filterAction,
                  items: previous,
                  nextCursor: null,
                  problem: result.problem,
                },
          );
        },
      );
    },
    [],
  );

  useReloadOnBack(() => void fetchPage(action, undefined, []));

  useEffect(() => {
    void fetchPage('', undefined, []);
  }, [fetchPage]);

  function changeAction(event: ChangeEvent<HTMLSelectElement>) {
    const nextAction = event.target.value;
    setAction(nextAction);
    setList((current) => ({ ...current, loading: true, problem: null }));
    void fetchPage(nextAction, undefined, []);
  }

  function loadMore() {
    if (list.nextCursor === null) {
      return;
    }
    setList((current) => ({ ...current, loading: true, problem: null }));
    void fetchPage(list.action, list.nextCursor, list.items);
  }

  return (
    <AdminPage title="Journal d’audit">
      <p className={styles.intro}>Lecture seule. Les dates et heures sont exprimées en UTC.</p>
      <section className={styles.panel} aria-label="Filtre du journal">
        <div className={styles.panelBody}>
          <label className={styles.selectField} htmlFor="audit-action">
            Type d’action
            <select id="audit-action" name="action" value={action} onChange={changeAction}>
              {AUDIT_ACTION_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={styles.panel} aria-label="Entrées du journal">
        {list.problem ? (
          <div className={styles.panelBody}>
            <AdminLoadError problem={list.problem} />
          </div>
        ) : null}
        {list.loading && list.items.length === 0 ? (
          <div className={styles.panelBody}>
            <AdminLoading />
          </div>
        ) : null}
        {!list.loading && list.items.length === 0 && list.problem === null ? (
          <div className={styles.panelBody}>
            <p className={styles.stateText}>Aucune entrée pour ce filtre.</p>
          </div>
        ) : null}
        {list.items.length > 0 ? (
          <table className={styles.table} aria-label="Journal d’audit">
            <thead>
              <tr>
                <th scope="col">Date et heure (UTC)</th>
                <th scope="col">Action</th>
                <th scope="col">Cible</th>
                <th scope="col">Résultat</th>
                <th scope="col">Motif</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((entry) => (
                <tr key={entry.id}>
                  <td className={styles.mono}>
                    <time dateTime={entry.createdAt}>{formatAdminDateTime(entry.createdAt)}</time>
                  </td>
                  <td>
                    {auditActionLabel(entry.action)} <span className={styles.mono}>{entry.action}</span>
                  </td>
                  <td>
                    {auditTargetLabel(entry.targetType)}{' '}
                    <span className={styles.mono}>{entry.targetId.slice(0, 8)}</span>
                  </td>
                  <td>
                    <StatusLabel tone={auditResultTone(entry.result)}>
                      {AUDIT_RESULT_LABELS[entry.result]}
                    </StatusLabel>
                  </td>
                  <td className={entry.reason ? undefined : styles.muted}>{entry.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {list.nextCursor !== null ? (
          <div className={styles.panelBody}>
            <Button type="button" className={styles.loadMore} disabled={list.loading} onClick={loadMore}>
              {list.loading ? 'Chargement…' : 'Charger plus d’entrées'}
            </Button>
          </div>
        ) : null}
      </section>
    </AdminPage>
  );
}
