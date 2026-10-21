'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import { ReactivateDialog } from '@/components/admin/reactivate-dialog';
import { SuspendDialog } from '@/components/admin/suspend-dialog';
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
import type { ApiProblem, ApiResult } from '@/lib/api-client';

type AccountState =
  | { status: 'loading' }
  | { status: 'error'; problem: ApiProblem }
  | { status: 'ready'; account: AccountView };

/**
 * The view of one account: its details, its reports and moderated content, and its recent audit entries. The one
 * action on it is the suspension of an active account (SuspendDialog), or the lifting of a suspension (ReactivateDialog);
 * the deletion and the e-mail reveal are not on this screen yet.
 */
export function AccountScreen({ id }: { id: string }) {
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);

  const showResult = useCallback((result: ApiResult<AccountView>) => {
    setState(result.ok ? { status: 'ready', account: result.body } : { status: 'error', problem: result.problem });
  }, []);

  useEffect(() => {
    let current = true;
    getAccount(id).then((result) => {
      if (current) {
        showResult(result);
      }
    });
    return () => {
      current = false;
    };
  }, [id, showResult]);

  function handleStatusChanged() {
    setDialog(null);
    void getAccount(id).then(showResult);
  }

  return (
    <AdminPage title="Fiche du compte">
      <Link className={styles.back} href="/admin/users">
        ← Retour aux comptes
      </Link>
      {state.status === 'loading' ? <AdminLoading /> : null}
      {state.status === 'error' ? <AdminLoadError problem={state.problem} /> : null}
      {state.status === 'ready' ? <AccountDetails account={state.account} onDialog={setDialog} /> : null}
      {state.status === 'ready' && dialog === 'suspend' ? (
        <SuspendDialog
          accountId={state.account.id}
          handle={state.account.handle}
          onSuspended={handleStatusChanged}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {state.status === 'ready' && dialog === 'reactivate' ? (
        <ReactivateDialog
          accountId={state.account.id}
          handle={state.account.handle}
          onReactivated={handleStatusChanged}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </AdminPage>
  );
}

function AccountDetails({
  account,
  onDialog,
}: {
  account: AccountView;
  onDialog: (dialog: 'suspend' | 'reactivate') => void;
}) {
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

        {account.status === 'active' || account.status === 'suspended' ? (
          <section className={styles.panel} aria-labelledby="account-actions-title">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="account-actions-title">
                Actions
              </h2>
              <div className={styles.actions}>
                {account.status === 'active' ? (
                  <button type="button" className={styles.dangerButton} onClick={() => onDialog('suspend')}>
                    Suspendre le compte
                  </button>
                ) : (
                  <button type="button" className={styles.primaryButton} onClick={() => onDialog('reactivate')}>
                    Lever la suspension
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : null}

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
