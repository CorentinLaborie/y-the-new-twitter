import { describe, expect, it } from 'vitest';
import {
  accountStatusTone,
  ACCOUNT_STATUS_LABELS,
  AUDIT_ACTION_FILTER_OPTIONS,
  DELETION_REASON_OPTIONS,
  auditActionLabel,
  auditResultTone,
  auditTargetLabel,
  REPORT_REASON_FILTER_OPTIONS,
  reportStatusTone,
  supportStatusTone,
} from '@/lib/admin-labels';

describe('auditActionLabel', () => {
  it('gives the French name of a known action', () => {
    expect(auditActionLabel('auth.admin_login')).toBe('Connexion administrateur');
  });

  it('keeps the code of an action that has no name yet', () => {
    expect(auditActionLabel('user.unknown')).toBe('user.unknown');
  });

  it.each([
    ['user.suspend', 'Suspension de compte'],
    ['user.reactivate', 'Levée de suspension'],
    ['user.delete', 'Suppression de compte'],
    ['contact.close', 'Fermeture de contact'],
    ['contact.reply', 'Réponse envoyée au compte'],
    ['report.decide', 'Décision sur un signalement'],
  ])('names the %s action in French', (action, label) => {
    expect(auditActionLabel(action)).toBe(label);
  });
});

describe('DELETION_REASON_OPTIONS', () => {
  it('lists the five deletion reasons in the order of the list, with French labels', () => {
    expect(DELETION_REASON_OPTIONS).toEqual([
      { value: 'abuse', label: 'Abus' },
      { value: 'spam', label: 'Spam' },
      { value: 'harassment', label: 'Harcèlement' },
      { value: 'identity_theft', label: 'Usurpation d’identité' },
      { value: 'other', label: 'Autre' },
    ]);
  });
});

describe('AUDIT_ACTION_FILTER_OPTIONS', () => {
  it('starts with the option that shows every action', () => {
    expect(AUDIT_ACTION_FILTER_OPTIONS[0]).toEqual({ value: '', label: 'Toutes les actions' });
  });

  it('lists the actions the listing can filter on', () => {
    expect(AUDIT_ACTION_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      '',
      'auth.admin_login',
      'auth.mfa_enrol',
      'user.suspend',
      'user.reactivate',
      'user.delete',
      'contact.close',
      'contact.reply',
      'report.decide',
    ]);
  });
});

describe('auditTargetLabel', () => {
  it('names a user target as an account', () => {
    expect(auditTargetLabel('user')).toBe('Compte');
  });

  it('names a contact target as a contact', () => {
    expect(auditTargetLabel('contact')).toBe('Contact');
  });

  it('keeps an unknown target type as it is', () => {
    expect(auditTargetLabel('question')).toBe('question');
  });
});

describe('ACCOUNT_STATUS_LABELS', () => {
  it('has a French label for every account status', () => {
    expect(Object.values(ACCOUNT_STATUS_LABELS)).toHaveLength(5);
    expect(ACCOUNT_STATUS_LABELS.pending_deletion).toBe('En attente de suppression');
  });
});

describe('accountStatusTone', () => {
  it('uses green for an active account and amber for a pending one', () => {
    expect(accountStatusTone('active')).toBe('ok');
    expect(accountStatusTone('pending_deletion')).toBe('open');
  });

  it('uses red for a suspended account and grey for a deleted one', () => {
    expect(accountStatusTone('suspended')).toBe('danger');
    expect(accountStatusTone('deleted')).toBe('neutral');
  });
});

describe('auditResultTone', () => {
  it('gives each result its tone', () => {
    expect(auditResultTone('ok')).toBe('ok');
    expect(auditResultTone('refused')).toBe('open');
    expect(auditResultTone('failed')).toBe('danger');
  });
});

describe('report and contact labels', () => {
  it('gives each report status its tone', () => {
    expect(reportStatusTone('open')).toBe('open');
    expect(reportStatusTone('resolved')).toBe('ok');
    expect(reportStatusTone('dismissed')).toBe('neutral');
  });

  it('gives each contact status its tone', () => {
    expect(supportStatusTone('new')).toBe('open');
    expect(supportStatusTone('replied')).toBe('neutral');
    expect(supportStatusTone('closed')).toBe('ok');
  });

  it('names the report target type in French', () => {
    expect(auditTargetLabel('report')).toBe('Signalement');
  });

  it('gives the reason filter the empty value first, then every reason', () => {
    expect(REPORT_REASON_FILTER_OPTIONS[0]).toEqual({ value: '', label: 'Tous les motifs' });
    expect(REPORT_REASON_FILTER_OPTIONS).toHaveLength(7);
  });
});
