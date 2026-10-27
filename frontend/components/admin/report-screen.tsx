'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { ReportDecisionDialog, type ReportDialogAction } from '@/components/admin/report-decision-dialog';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { getReport, type ReportDetail } from '@/lib/admin-api';
import {
  REPORT_DECISION_LABELS,
  REPORT_MODERATION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  reportStatusTone,
} from '@/lib/admin-labels';
import { formatAdminDateTime } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

type ReportState =
  | { status: 'loading' }
  | { status: 'error'; problem: ApiProblem }
  | { status: 'ready'; report: ReportDetail };

/**
 * One report: the reported content, the reports made on it, and the two decisions. A decided report offers no decision.
 * The decision dialog asks for the note and the re-authentication (DEC-088); the report is read again after a decision.
 */
export function ReportScreen({ id }: { id: string }) {
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const [decision, setDecision] = useState<ReportDialogAction | null>(null);

  const load = useCallback(() => {
    return getReport(id).then((result) => {
      setState(
        result.ok ? { status: 'ready', report: result.body } : { status: 'error', problem: result.problem },
      );
    });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <AdminPage title="Examen du signalement">
        <AdminLoading />
      </AdminPage>
    );
  }
  if (state.status === 'error') {
    return (
      <AdminPage title="Examen du signalement">
        <AdminLoadError problem={state.problem} />
      </AdminPage>
    );
  }

  const { report } = state;
  const decided = report.status !== 'open';
  // A content hidden by a decision can be restored (L7), by an administrator, with the note and the re-authentication.
  const restorable = report.decision === 'content_hidden' && report.target.moderationStatus === 'hidden';

  return (
    <AdminPage title="Examen du signalement">
      <Link className={styles.back} href="/admin/reports">
        Retour à la file des signalements
      </Link>
      <div className={styles.split}>
        <div className={styles.splitMain}>
          <section className={styles.panel} aria-labelledby="reported-title">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="reported-title">
                Contenu signalé
              </h2>
              <p className={styles.muted}>
                {REPORT_TARGET_LABELS[report.target.type]} de @{report.target.authorHandle} ·{' '}
                {report.target.authorDisplayName}
                {' · '}
                {formatAdminDateTime(report.target.createdAt)}
              </p>
              <p className={styles.messageBody}>{report.target.body}</p>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="history-title">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="history-title">
                Historique du signalement
              </h2>
              <ol className={styles.list}>
                {report.reports.map((item) => (
                  <li key={item.id}>
                    <time dateTime={item.createdAt}>{formatAdminDateTime(item.createdAt)}</time>
                    <strong>Signalement {item.id === report.id ? 'examiné' : 'reçu'}</strong>
                    <span>
                      Motif : {REPORT_REASON_LABELS[item.reason]} · signalé par un utilisateur (identité non
                      affichée)
                      {item.details ? ` · « ${item.details} »` : ''}
                    </span>
                  </li>
                ))}
                {report.decidedAt !== null && report.decision !== null ? (
                  <li>
                    <time dateTime={report.decidedAt}>{formatAdminDateTime(report.decidedAt)}</time>
                    <strong>{REPORT_DECISION_LABELS[report.decision]}</strong>
                    <span>Décision enregistrée dans le journal d’audit</span>
                  </li>
                ) : null}
              </ol>
            </div>
          </section>
        </div>

        <div className={styles.splitSide}>
          <section className={styles.panel} aria-labelledby="decision-title-main">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle} id="decision-title-main">
                Décision
              </h2>
              <dl className={styles.definitions}>
                <dt>Motif</dt>
                <dd>{REPORT_REASON_LABELS[report.reason]}</dd>
                <dt>Signalement</dt>
                <dd>
                  <StatusLabel tone={reportStatusTone(report.status)}>
                    {REPORT_STATUS_LABELS[report.status]}
                  </StatusLabel>
                </dd>
                <dt>Contenu</dt>
                <dd>{REPORT_MODERATION_LABELS[report.target.moderationStatus]}</dd>
              </dl>
              {report.decisionNote ? (
                <p className={styles.muted}>Motif de la décision : {report.decisionNote}</p>
              ) : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={decided}
                  onClick={() => setDecision('hide')}
                >
                  Masquer le contenu
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={decided}
                  onClick={() => setDecision('dismiss')}
                >
                  Rejeter le signalement
                </button>
              </div>
              {decided ? <p className={styles.muted}>Ce signalement a déjà été traité.</p> : null}
              {restorable ? (
                <button type="button" className={styles.secondaryButton} onClick={() => setDecision('restore')}>
                  Restaurer le contenu
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {decision !== null ? (
        <ReportDecisionDialog
          reportId={report.id}
          decision={decision}
          onCancel={() => setDecision(null)}
          onDecided={() => {
            setDecision(null);
            void load();
          }}
        />
      ) : null}
    </AdminPage>
  );
}
