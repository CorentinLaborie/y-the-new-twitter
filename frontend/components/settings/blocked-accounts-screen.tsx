'use client';

import { useEffect, useState } from 'react';
import {
  BLOCKED_EMPTY_MESSAGE,
  UNBLOCK_FAILED_MESSAGE,
  unblockedMessage,
} from '@/components/block/block-rules';
import { type BlockedAccount, listBlockedAccounts, unblockAccount } from '@/lib/blocks-api';

const LOAD_FAILED_MESSAGE = 'La liste des comptes bloqués n’a pas pu être chargée.';

/*
 * The blocked accounts, most recent block first (plan L6, sections 4 and 8). Lifting a block takes no confirmation
 * (decision 7): the row goes at once, and a notice says so. Voir plus loads the next page with its cursor.
 */
export function BlockedAccountsScreen() {
  const [accounts, setAccounts] = useState<BlockedAccount[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    listBlockedAccounts().then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        setAccounts(result.body.items);
        setNextCursor(result.body.nextCursor);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    const result = await listBlockedAccounts({ cursor: nextCursor });
    setLoadingMore(false);
    if (result.ok) {
      setAccounts((current) => [...(current ?? []), ...result.body.items]);
      setNextCursor(result.body.nextCursor);
    } else {
      setNotice(LOAD_FAILED_MESSAGE);
    }
  }

  async function unblock(handle: string) {
    const result = await unblockAccount(handle);
    if (result.ok) {
      setAccounts((current) => (current ?? []).filter((account) => account.handle !== handle));
      setNotice(unblockedMessage(handle));
    } else {
      setNotice(UNBLOCK_FAILED_MESSAGE);
    }
  }

  return (
    <section aria-labelledby="blocked-title">
      <h1 id="blocked-title">Comptes bloqués</h1>

      {loadFailed ? (
        <>
          <p role="alert">{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" onClick={() => setReloadKey((key) => key + 1)}>
            Réessayer
          </button>
        </>
      ) : null}

      {accounts !== null && accounts.length === 0 ? <p>{BLOCKED_EMPTY_MESSAGE}</p> : null}

      {accounts !== null && accounts.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {accounts.map((account) => (
            <li key={account.handle} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{account.displayName}</strong> <span>@{account.handle}</span>
              </span>
              <button
                type="button"
                className="y-btn y-btn-md y-btn-outline y-btn-pill"
                style={{ minHeight: 44 }}
                onClick={() => unblock(account.handle)}
              >
                Débloquer
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <button
          type="button"
          className="y-btn y-btn-md y-btn-outline y-btn-pill"
          onClick={loadMore}
          disabled={loadingMore}
        >
          Voir plus
        </button>
      ) : null}

      <p role="status">{notice}</p>
    </section>
  );
}
