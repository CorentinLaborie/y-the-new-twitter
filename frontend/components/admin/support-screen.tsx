'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import { Button } from '@/components/auth/button';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { listSupportThreads, type SupportThreadListItem } from '@/lib/admin-api';
import {
  ACCOUNT_STATUS_LABELS,
  accountStatusTone,
  SUPPORT_STATUS_FILTER_OPTIONS,
  SUPPORT_STATUS_LABELS,
  supportStatusTone,
} from '@/lib/admin-labels';
import { formatAdminDateTime } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

/** Threads per page of the list. */
const THREADS_PAGE_SIZE = 20;

type ThreadFilter = { status: 'open' | 'closed' | '' };

/** The list on screen, with the filter it was searched with (the next page keeps that filter). */
type ListState = {
  loading: boolean;
  applied: ThreadFilter;
  items: SupportThreadListItem[];
  nextCursor: string | null;
  problem: ApiProblem | null;
};

const ALL_THREADS: ThreadFilter = { status: '' };

/**
 * The contact threads of the back-office (section 3.4, DEC-116): the messages that suspended accounts sent to the
 * administrator, filtered by status. Each thread opens its page (/admin/support/[id]).
 */
export function SupportScreen() {
  const [filter, setFilter] = useState<ThreadFilter>(ALL_THREADS);
  const [list, setList] = useState<ListState>({
    loading: true,
    applied: ALL_THREADS,
    items: [],
    nextCursor: null,
    problem: null,
  });

  /** Fetches one page and replaces the list (first page) or appends to it (next page). */
  const fetchPage = useCallback(
    (applied: ThreadFilter, cursor: string | undefined, previous: SupportThreadListItem[]) => {
      return listSupportThreads({
        status: applied.status || undefined,
        cursor,
        limit: THREADS_PAGE_SIZE,
      }).then((result) => {
        setList(
          result.ok
            ? {
                loading: false,
                applied,
                items: [...previous, ...result.body.items],
                nextCursor: result.body.nextCursor,
                problem: null,
              }
            : { loading: false, applied, items: previous, nextCursor: null, problem: result.problem },
        );
      });
    },
    [],
  );

  useReloadOnBack(() => void fetchPage(filter, undefined, []));

  useEffect(() => {
    void fetchPage(ALL_THREADS, undefined, []);
  }, [fetchPage]);

  /** A new filter starts again from the first page. */
  function changeFilter(next: ThreadFilter) {
    setFilter(next);
    setList((current) => ({ ...current, loading: true, problem: null }));
    void fetchPage(next, undefined, []);
  }

  function loadMore() {
    if (list.nextCursor === null) {
      return;
    }
    setList((current) => ({ ...current, loading: true, problem: null }));
    void fetchPage(list.applied, list.nextCursor, list.items);
  }

  return (
    <AdminPage title="Tribunal des bannis">
      <p className={styles.intro}>
        Messages envoyés par les comptes suspendus depuis « Contacter l’administrateur ». Chaque réponse part
        par e-mail et est enregistrée dans le journal d’audit.
      </p>
      <section className={styles.panel} aria-label="Filtre des messages">
        <div className={styles.panelBody}>
          <div className={styles.toolbar}>
            <label className={styles.selectField} htmlFor="support-status">
              Statut
              <select
                id="support-status"
                name="status"
                value={filter.status}
                onChange={(event) => changeFilter({ status: event.target.value as ThreadFilter['status'] })}
              >
                {SUPPORT_STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-label="Messages reçus">
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
            <p className={styles.stateText}>Aucun message ne correspond à ce filtre.</p>
          </div>
        ) : null}
        {list.items.length > 0 ? (
          <table className={styles.table} aria-label="Messages reçus">
            <thead>
              <tr>
                <th scope="col">Reçu le</th>
                <th scope="col">Compte</th>
                <th scope="col">Statut du compte</th>
                <th scope="col">Message</th>
                <th scope="col">Statut</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((thread) => (
                <tr key={thread.id}>
                  <td className={styles.mono}>
                    {thread.receivedAt ? formatAdminDateTime(thread.receivedAt) : '—'}
                  </td>
                  <td>
                    <Link href={`/admin/support/${thread.id}`}>@{thread.account.handle}</Link>
                    <div className={styles.messageMeta}>{thread.reference}</div>
                  </td>
                  <td>
                    <StatusLabel tone={accountStatusTone(thread.account.status)}>
                      {ACCOUNT_STATUS_LABELS[thread.account.status]}
                    </StatusLabel>
                  </td>
                  <td>
                    <span className={styles.clip}>{thread.latestMessage ?? '—'}</span>
                  </td>
                  <td>
                    <StatusLabel tone={supportStatusTone(thread.status)}>
                      {SUPPORT_STATUS_LABELS[thread.status]}
                    </StatusLabel>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {list.nextCursor !== null ? (
          <div className={styles.panelBody}>
            <Button type="button" className={styles.loadMore} disabled={list.loading} onClick={loadMore}>
              {list.loading ? 'Chargement…' : 'Charger plus de messages'}
            </Button>
          </div>
        ) : null}
      </section>
    </AdminPage>
  );
}
