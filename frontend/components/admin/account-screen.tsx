'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { getAccount, type AccountView } from '@/lib/admin-api';
import {
  ACCOUNT_STATUS_LABELS,
  accountStatusTone,
  auditActionLabel,
  auditResultTone,
  AUDIT_RESULT_LABELS,
  ROLE_LABELS,
} from '@/lib/admin-labels';
import { formatAdminDate, formatAdminDateTime } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

type AccountState =
  | { status: 'loading' }
  | { status: 'error'; problem: ApiProblem }
  | { status: 'ready'; account: AccountView };

/**
 * The view of one account: its details, its reports and moderated content, and its recent audit entries. Read only.
 * The actions on the account (suspension, deletion, e-mail reveal) are not on this screen yet.
 */
export function AccountScreen({ id }: { id: string }) {
  const [state, setState] = useState<AccountState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    getAccount(id).then((result) => {
      if (!current) {
        return;
      }
      setState(
        result.ok ? { status: 'ready', account: result.body } : { status: 'error', problem: result.problem },
      );
    });
    return () => {
      current = false;
    };
  }, [id]);

  return (
    <AdminPage title="Fiche du compte">
      <Link className={styles.back} href="/admin/users">
        ← Retour aux comptes
      </Link>
      {state.status === 'loading' ? <AdminLoading /> : null}
      {state.status === 'error' ? <AdminLoadError problem={state.problem} /> : null}
      {state.status === 'ready' ? <AccountDetails account={state.account} /> : null}
    </AdminPage>
  );
}

function AccountDetails({ account }: { account: AccountView }) {
  return (
    <div className={styles.split}>
      <div className={styles.splitMain}>
        <section className={styles.panel} aria-labelledby="account-summary-title">
          <div className={styles.panelBody}>
            <h2 className={styles.panelTitle} id="account-summary-title">
              Résumé du compte
            </h2>
            <p>
              <strong>{account.displayName}</strong> <span className={styles.muted}>@{account.handle}</span>
            </p>
            <dl className={styles.definitions}>
              <dt>Statut</dt>
              <dd>
                <StatusLabel tone={accountStatusTone(account.status)}>
                  {ACCOUNT_STATUS_LABELS[account.status]}
                </StatusLabel>
              </dd>
              {account.status === 'suspended' && account.suspensionReason ? (
                <>
                  <dt>Motif de suspension</dt>
                  <dd>{account.suspensionReason}</dd>
                </>
              ) : null}
              <dt>Rôle</dt>
              <dd>{ROLE_LABELS[account.role]}</dd>
              <dt>Inscription</dt>
              <dd>{formatAdminDate(account.createdAt)}</dd>
              <dt>E-mail</dt>
              <dd className={styles.mono}>{account.maskedEmail}</dd>
              <dt>Dernière connexion</dt>
              <dd>{account.lastLoginAt ? formatAdminDateTime(account.lastLoginAt) : '—'}</dd>
              <dt>Sessions actives</dt>
              <dd>{account.activeSessionCount}</dd>
            </dl>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="account-content-title">
          <div className={styles.panelBody}>
            <h2 className={styles.panelTitle} id="account-content-title">
              Contenus de ce compte
            </h2>
            <dl className={styles.counts}>
              <div className={styles.count}>
                <dt>Signalements reçus</dt>
                <dd>{account.reports.total}</dd>
              </div>
              <div className={styles.count}>
                <dt>Signalements ouverts</dt>
                <dd>{account.reports.open}</dd>
              </div>
              <div className={styles.count}>
                <dt>Contenus masqués ou retirés</dt>
                <dd>{account.moderatedContentCount}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <aside className={styles.splitSide}>
        <section className={styles.panel} aria-labelledby="account-history-title">
          <div className={styles.panelBody}>
            <h2 className={styles.panelTitle} id="account-history-title">
              Historique des actions
            </h2>
            {account.history.length === 0 ? (
              <p className={styles.stateText}>Aucune action enregistrée pour ce compte.</p>
            ) : (
              <ol className={styles.list}>
                {account.history.map((entry) => (
                  <li key={entry.id}>
                    <time dateTime={entry.createdAt}>{formatAdminDateTime(entry.createdAt)}</time>
                    <strong>{auditActionLabel(entry.action)}</strong>
                    <StatusLabel tone={auditResultTone(entry.result)}>
                      {AUDIT_RESULT_LABELS[entry.result]}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </StatusLabel>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
