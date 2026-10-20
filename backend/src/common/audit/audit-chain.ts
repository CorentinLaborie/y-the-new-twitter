import { createHmac } from 'node:crypto';

type AuditDetailValue = string | number | boolean | null | AuditDetails;

interface AuditDetails {
  [key: string]: AuditDetailValue;
}

/** One row of admin_audit_log, as the application holds it (DEC-063, DEC-064, DEC-128). */
export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  result: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  details: AuditDetails | null;
  createdAt: Date;
  prevHash: string;
}

interface AuditChainCheck {
  valid: boolean;
  /** Index of the first entry whose prevHash does not match the HMAC of the entry before it. */
  brokenAt: number | null;
}

/**
 * The text that is hashed for an entry (DEC-128): the fields in a fixed order, as a JSON array.
 * A NULL value is `null`, and details are their canonical JSON text (DEC-064). The text comes from
 * the values the application holds, never from what the database returns.
 */
export function auditMessage(entry: AuditEntry): string {
  return JSON.stringify([
    entry.prevHash,
    entry.id,
    entry.actorId,
    entry.action,
    entry.result,
    entry.targetType,
    entry.targetId,
    entry.reason,
    entry.details === null ? null : canonicalJson(entry.details),
    entry.createdAt.toISOString(),
  ]);
}

/** HMAC-SHA-256 of the entry, in lowercase hex. The next entry stores it as its prevHash. */
export function auditHmac(key: string, entry: AuditEntry): string {
  return createHmac('sha256', key).update(auditMessage(entry), 'utf8').digest('hex');
}

/**
 * Checks the chain from the oldest kept entry (DEC-063). Entries are sorted by createdAt, then id (DEC-127).
 * The first entry is not compared with a genesis value, because rows removed by the purge are expected.
 */
export function verifyAuditChain(entries: readonly AuditEntry[], key: string): AuditChainCheck {
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].prevHash !== auditHmac(key, entries[index - 1])) {
      return { valid: false, brokenAt: index };
    }
  }

  return { valid: true, brokenAt: null };
}

/** JSON with keys sorted at every level, no spaces, integers only (DEC-064). */
function canonicalJson(details: AuditDetails): string {
  return JSON.stringify(sortKeys(details));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('Audit details accept only strings, booleans, null, safe integers and objects.');
    }
    return value;
  }

  if (typeof value !== 'object' || Array.isArray(value) || !isPlainObject(value)) {
    throw new Error('Audit details accept only strings, booleans, null, safe integers and objects.');
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortKeys(record[key])]),
  );
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
