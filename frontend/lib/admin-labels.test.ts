import { describe, expect, it } from 'vitest';
import {
  accountStatusTone,
  ACCOUNT_STATUS_LABELS,
  AUDIT_ACTION_FILTER_OPTIONS,
  auditActionLabel,
  auditResultTone,
  auditTargetLabel,
} from '@/lib/admin-labels';

describe('auditActionLabel', () => {
  it('gives the French name of a known action', () => {
    expect(auditActionLabel('auth.admin_login')).toBe('Connexion administrateur');
  });

  it('keeps the code of an action that has no name yet', () => {
    expect(auditActionLabel('report.decide')).toBe('report.decide');
  });

  it.each([
    ['user.suspend', 'Suspension de compte'],
    ['user.reactivate', 'Levée de suspension'],
    ['contact.close', 'Fermeture de contact'],
  ])('names the %s action in French', (action, label) => {
    expect(auditActionLabel(action)).toBe(label);
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
      'contact.close',
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
