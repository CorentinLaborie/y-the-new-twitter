/*
 * French labels of the back-office (interface texts are in French, identifiers in English). An action code that has no
 * label yet is shown as it is, so a new audit action is never hidden.
 */

import type { AccountStatus } from '@/lib/auth-api';
import type {
  AdminRole,
  AuditResult,
  DeletionReasonCode,
  ModerationStatus,
  ReportDecision,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  SupportStatus,
} from '@/lib/admin-api';

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending_verification: 'En attente de vérification',
  active: 'Actif',
  suspended: 'Suspendu',
  pending_deletion: 'En attente de suppression',
  deleted: 'Supprimé',
};

/** The colour tone of a status: ok (green), open (amber, waiting for a decision), danger (red) or neutral (grey). */
export type StatusTone = 'ok' | 'open' | 'danger' | 'neutral';

export function accountStatusTone(status: AccountStatus): StatusTone {
  switch (status) {
    case 'active':
      return 'ok';
    case 'pending_verification':
    case 'pending_deletion':
      return 'open';
    case 'suspended':
      return 'danger';
    case 'deleted':
      return 'neutral';
  }
}

export function auditResultTone(result: AuditResult): StatusTone {
  switch (result) {
    case 'ok':
      return 'ok';
    case 'refused':
      return 'open';
    case 'failed':
      return 'danger';
  }
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  user: 'Utilisateur',
  moderator: 'Modérateur',
  admin: 'Administrateur',
};

export const AUDIT_RESULT_LABELS: Record<AuditResult, string> = {
  ok: 'Réussi',
  failed: 'Échec',
  refused: 'Refusé',
};

/** The audit actions written so far (audit-log.types.ts). The listing filters on these codes. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.admin_login': 'Connexion administrateur',
  'auth.mfa_enrol': 'Double authentification configurée',
  'user.suspend': 'Suspension de compte',
  'user.reactivate': 'Levée de suspension',
  'user.delete': 'Suppression de compte',
  'contact.close': 'Fermeture de contact',
  'contact.reply': 'Réponse envoyée au compte',
  'report.decide': 'Décision sur un signalement',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Ouvert',
  resolved: 'Résolu',
  dismissed: 'Rejeté',
};

export function reportStatusTone(status: ReportStatus): StatusTone {
  switch (status) {
    case 'open':
      return 'open';
    case 'resolved':
      return 'ok';
    case 'dismissed':
      return 'neutral';
  }
}

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harcèlement',
  hate: 'Haine',
  illegal_content: 'Contenu illicite',
  misinformation: 'Désinformation',
  other: 'Autre',
};

/** The reasons of the report list filter, in the order of the design. The empty value means every reason. */
export const REPORT_REASON_FILTER_OPTIONS: readonly { value: ReportReason | ''; label: string }[] = [
  { value: '', label: 'Tous les motifs' },
  ...(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((value) => ({
    value,
    label: REPORT_REASON_LABELS[value],
  })),
];

/** The statuses of the report list filter. The empty value means every status. */
export const REPORT_STATUS_FILTER_OPTIONS: readonly { value: 'open' | 'decided' | ''; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverts' },
  { value: 'decided', label: 'Décidés' },
];

/** The French text of a decision recorded on a report. */
export const REPORT_DECISION_LABELS: Record<ReportDecision, string> = {
  content_hidden: 'Contenu masqué',
  no_action: 'Signalement rejeté',
};

/** The kind of content of a report, as the list names it. */
export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  question: 'Question',
  reply: 'Réponse',
};

export const REPORT_MODERATION_LABELS: Record<ModerationStatus, string> = {
  visible: 'Visible',
  hidden: 'Contenu masqué',
  removed: 'Contenu supprimé',
};

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: 'Nouveau',
  replied: 'Répondu',
  closed: 'Traité',
};

export function supportStatusTone(status: SupportStatus): StatusTone {
  switch (status) {
    case 'new':
      return 'open';
    case 'replied':
      return 'neutral';
    case 'closed':
      return 'ok';
  }
}

/** The statuses of the thread list filter. The empty value means every status. */
export const SUPPORT_STATUS_FILTER_OPTIONS: readonly { value: 'open' | 'closed' | ''; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverts' },
  { value: 'closed', label: 'Traités' },
];

/** The reasons an administrator can pick to delete an account, in the order of the list (account-deletion-reasons.ts). */
export const DELETION_REASON_OPTIONS: readonly { value: DeletionReasonCode; label: string }[] = [
  { value: 'abuse', label: 'Abus' },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'identity_theft', label: 'Usurpation d’identité' },
  { value: 'other', label: 'Autre' },
];

/** The options of the action filter of the audit log. The empty value means every action. */
export const AUDIT_ACTION_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Toutes les actions' },
  ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

/** The French name of an audit action, or its code when no name is known yet. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** The French name of an audit target type (audit-log.types.ts), or the type itself when no name is known yet. */
export function auditTargetLabel(targetType: string): string {
  switch (targetType) {
    case 'user':
      return 'Compte';
    case 'contact':
      return 'Contact';
    case 'report':
      return 'Signalement';
    default:
      return targetType;
  }
}
