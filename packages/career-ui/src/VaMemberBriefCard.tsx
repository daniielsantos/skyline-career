import { useEffect, useState } from 'react';

const STORAGE_KEY = 'airframe.vaMemberBrief.v1';

/**
 * First-join mental model for VA members (not a full tutorial).
 * Dismiss persists in localStorage.
 */
export function VaMemberBriefCard(props: {
  /** Show only for pilot/dispatcher on a listed VA (not owner). */
  visible: boolean;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!props.visible || dismissed) return null;

  return (
    <aside className="va-member-brief" aria-label="Airline desk basics">
      <div className="va-member-brief-head">
        <strong>Your wallets &amp; cuts</strong>
        <button
          type="button"
          className="action ghost va-member-brief-dismiss"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, '1');
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          Got it
        </button>
      </div>
      <ul className="va-member-brief-list">
        <li>
          Topbar <strong>Wallet</strong> is your <strong>home</strong> company.
          My VA <strong>Ledger</strong> is the shared airline cash.
        </li>
        <li>
          <strong>Mkt %</strong> = Freights/Charter on an airline tail → home.
          <strong> Desk %</strong> = Demand/Wide haul → home. Rest stays with the
          company.
        </li>
        <li>
          Cargo Ops, lease Dry cleans, and pilot hours live on your{' '}
          <strong>home</strong> — even when you fly company tails.
        </li>
        <li>
          Hauls desk moves company stock; Freights board is market hire. Both can
          pay a cut to home when stamped.
        </li>
      </ul>
    </aside>
  );
}
