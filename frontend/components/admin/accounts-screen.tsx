'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/avatar/user-avatar';
import avatarStyles from './admin-avatar.module.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import { Button } from '@/components/auth/button';
import { TextField } from '@/components/auth/text-field';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { listAccounts, type AccountListItem } from '@/lib/admin-api';
import { accountStatusTone, ACCOUNT_STATUS_LABELS } from '@/lib/admin-labels';
import { formatAdminDate } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';
import type { AccountStatus } from '@/lib/auth-api';

/** Accounts per page of the search. */
const ACCOUNTS_PAGE_SIZE = 20;

type AccountFilter = { q: string; status: AccountStatus | '' };

/** The list on screen, with the filter it was searched with (the next page keeps that filter). */
type ListState = {
  loading: boolean;
  applied: AccountFilter;
  items: AccountListItem[];
  nextCursor: string | null;
  problem: ApiProblem | null;
};

const ALL_ACCOUNTS: AccountFilter = { q: '', status: '' };
const STATUSES = Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[];

/**
 * Account search of the back-office: by handle or full e-mail address, optionally by status. The e-mail addresses are
 * masked. Each account opens its view (/admin/users/[id]).
 */
export function AccountsScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AccountFilter['status']>('');
  const [list, setList] = useState<ListState>({
    loading: true,
    applied: ALL_ACCOUNTS,
    items: [],
    nextCursor: null,
    problem: null,
  });

  /** Fetches one page and replaces the list (first page) or appends to it (next page). */
  const fetchPage = useCallback(
    (filter: AccountFilter, cursor: string | undefined, previous: AccountListItem[]) => {
      return listAccounts({
        q: filter.q || undefined,
        status: filter.status || undefined,
        cursor,
        limit: ACCOUNTS_PAGE_SIZE,
      }).then((result) => {
        setList(
          result.ok
            ? {
                loading: false,
                applied: filter,
                items: [...previous, ...result.body.items],
                nextCursor: result.body.nextCursor,
                problem: null,
              }
            : { loading: false, applied: filter, items: previous, nextCursor: null, problem: result.problem },
        );
      });
    },
    [],
  );

  useReloadOnBack(() => void fetchPage({ q: query.trim(), status }, undefined, []));

  useEffect(() => {
    void fetchPage(ALL_ACCOUNTS, undefined, []);
  }, [fetchPage]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filter: AccountFilter = { q: query.trim(), status };
    setList((current) => ({ ...current, loading: true, problem: null }));
    void fetchPage(filter, undefined, []);
  }

  function loadMore() {
    if (list.nextCursor === null) {
      return;
    }
    setList((current) => ({ ...current, loading: true, problem: null }));
    void fetchPage(list.applied, list.nextCursor, list.items);
  }

  return (
    <AdminPage title="Comptes">
      <p className={styles.intro}>
        Les adresses e-mail sont masquées. Recherchez par identifiant ou par adresse complète.
      </p>
      <section className={styles.panel} aria-label="Recherche de comptes">
        <div className={styles.panelBody}>
          <form className={styles.toolbar} role="search" onSubmit={search}>
            <TextField
              id="account-query"
              name="q"
              label="Rechercher un compte"
              hint="Identifiant ou adresse e-mail complète."
              placeholder="Identifiant ou adresse e-mail"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <label className={styles.selectField} htmlFor="account-status">
              Statut
              <select
                id="account-status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as AccountFilter['status'])}
              >
                <option value="">Tous les statuts</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ACCOUNT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" className={styles.submit}>
              Rechercher
            </Button>
          </form>
        </div>
      </section>

      <section className={styles.panel} aria-label="Résultats de la recherche">
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
            <p className={styles.stateText}>Aucun compte ne correspond à cette recherche.</p>
          </div>
        ) : null}
        {list.items.length > 0 ? (
          <table className={styles.table} aria-label="Comptes">
            <thead>
              <tr>
                <th scope="col">Identifiant</th>
                <th scope="col">Nom affiché</th>
                <th scope="col">E-mail</th>
                <th scope="col">Statut</th>
                <th scope="col">Inscription</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link href={`/admin/users/${account.id}`}>@{account.handle}</Link>
                  </td>
                  <td>
                    <span className={avatarStyles.name}>
                      <UserAvatar
                        className={avatarStyles.avatar}
                        displayName={account.displayName}
                        avatarUrl={account.avatarUrl}
                      />
                      {account.displayName}
                    </span>
                  </td>
                  <td className={styles.mono}>{account.maskedEmail}</td>
                  <td>
                    <StatusLabel tone={accountStatusTone(account.status)}>
                      {ACCOUNT_STATUS_LABELS[account.status]}
                    </StatusLabel>
                  </td>
                  <td className={styles.mono}>{formatAdminDate(account.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {list.nextCursor !== null ? (
          <div className={styles.panelBody}>
            <Button type="button" className={styles.loadMore} disabled={list.loading} onClick={loadMore}>
              {list.loading ? 'Chargement…' : 'Charger plus de comptes'}
            </Button>
          </div>
        ) : null}
      </section>
    </AdminPage>
  );
}
