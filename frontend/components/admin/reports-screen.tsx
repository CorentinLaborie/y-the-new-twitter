'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/auth/button';
import { AdminPage } from '@/components/admin/admin-page';
import { AdminLoadError, AdminLoading } from '@/components/admin/admin-states';
import { StatusLabel } from '@/components/admin/status-label';
import styles from '@/components/admin/admin.module.css';
import { listReports, type ReportListItem, type ReportReason } from '@/lib/admin-api';
import {
  REPORT_REASON_FILTER_OPTIONS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_FILTER_OPTIONS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  reportStatusTone,
} from '@/lib/admin-labels';
import { formatAdminDateTime } from '@/lib/admin-format';
import type { ApiProblem } from '@/lib/api-client';

/** Reports per page of the list. */
const REPORTS_PAGE_SIZE = 20;

/** Longest excerpt of the reported content shown in the list. */
const EXCERPT_LENGTH = 90;

type ReportFilter = { status: 'open' | 'decided' | ''; reason: ReportReason | '' };

/** The list on screen, with the filter it was searched with (the next page keeps that filter). */
type ListState = {
  loading: boolean;
  applied: ReportFilter;
  items: ReportListItem[];
  nextCursor: string | null;
  problem: ApiProblem | null;
};

const ALL_REPORTS: ReportFilter = { status: '', reason: '' };

/** The first characters of the reported content, with an ellipsis when it is cut. */
function excerptOf(body: string): string {
  return body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
}

/**
 * The report list of the back-office (section 3.5): the reports, filtered by status and by reason. Each report opens its
 * examination (/admin/reports/[id]). The author is named by handle; the reporter is never shown.
 */
export function ReportsScreen() {
  const [filter, setFilter] = useState<ReportFilter>(ALL_REPORTS);
  const [list, setList] = useState<ListState>({
    loading: true,
    applied: ALL_REPORTS,
    items: [],
    nextCursor: null,
    problem: null,
  });

  /** Fetches one page and replaces the list (first page) or appends to it (next page). */
  const fetchPage = useCallback(
    (applied: ReportFilter, cursor: string | undefined, previous: ReportListItem[]) => {
      return listReports({
        status: applied.status || undefined,
        reason: applied.reason || undefined,
        cursor,
        limit: REPORTS_PAGE_SIZE,
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

  useEffect(() => {
    void fetchPage(ALL_REPORTS, undefined, []);
  }, [fetchPage]);

  /** A new filter starts again from the first page. */
  function changeFilter(next: ReportFilter) {
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
    <AdminPage title="Signalements">
      <p className={styles.intro}>
        Signalements ouverts sur les questions et les réponses. Chaque décision est enregistrée dans le
        journal d’audit.
      </p>
      <section className={styles.panel} aria-label="Filtres des signalements">
        <div className={styles.panelBody}>
          <div className={styles.toolbar}>
            <label className={styles.selectField} htmlFor="report-status">
              Statut
              <select
                id="report-status"
                name="status"
                value={filter.status}
                onChange={(event) =>
                  changeFilter({ ...filter, status: event.target.value as ReportFilter['status'] })
                }
              >
                {REPORT_STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.selectField} htmlFor="report-reason">
              Motif
              <select
                id="report-reason"
                name="reason"
                value={filter.reason}
                onChange={(event) =>
                  changeFilter({ ...filter, reason: event.target.value as ReportFilter['reason'] })
                }
              >
                {REPORT_REASON_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-label="Résultats des signalements">
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
            <p className={styles.stateText}>Aucun signalement ne correspond à ce filtre.</p>
          </div>
        ) : null}
        {list.items.length > 0 ? (
          <table className={styles.table} aria-label="Signalements">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Motif</th>
                <th scope="col">Cible</th>
                <th scope="col">Signalements</th>
                <th scope="col">Statut</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((report) => (
                <tr key={report.id}>
                  <td className={styles.mono}>{formatAdminDateTime(report.createdAt)}</td>
                  <td>{REPORT_REASON_LABELS[report.reason]}</td>
                  <td>
                    {REPORT_TARGET_LABELS[report.target.type]}
                    <span className={`${styles.messageMeta} ${styles.clip}`}>
                      Auteur : @{report.target.authorHandle} · {excerptOf(report.target.body)}
                    </span>
                  </td>
                  <td className={styles.mono}>{report.reportCount}</td>
                  <td>
                    <StatusLabel tone={reportStatusTone(report.status)}>
                      {REPORT_STATUS_LABELS[report.status]}
                    </StatusLabel>
                  </td>
                  <td>
                    <Link
                      href={`/admin/reports/${report.id}`}
                      aria-label={`Examiner le signalement du ${formatAdminDateTime(report.createdAt)}`}
                    >
                      Examiner
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {list.nextCursor !== null ? (
          <div className={styles.panelBody}>
            <Button type="button" className={styles.loadMore} disabled={list.loading} onClick={loadMore}>
              {list.loading ? 'Chargement…' : 'Charger plus de signalements'}
            </Button>
          </div>
        ) : null}
      </section>
    </AdminPage>
  );
}
