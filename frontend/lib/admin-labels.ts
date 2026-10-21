/*
 * French labels of the back-office (interface texts are in French, identifiers in English). An action code that has no
 * label yet is shown as it is, so a new audit action is never hidden.
 */

import type { AccountStatus } from '@/lib/auth-api';
import type { AdminRole, AuditResult } from '@/lib/admin-api';

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
};

/** The options of the action filter of the audit log. The empty value means every action. */
export const AUDIT_ACTION_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Toutes les actions' },
  ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

/** The French name of an audit action, or its code when no name is known yet. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Target types of the audit log (audit-log.types.ts): 'user' is the only one written so far. */
export function auditTargetLabel(targetType: string): string {
  return targetType === 'user' ? 'Compte' : targetType;
}
