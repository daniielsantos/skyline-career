import { useEffect, useId, useRef } from 'react';

/** Compact airline money map — who pays / who receives. */

export function VaMoneyMap(props: {
  marketHireCutPct: number;
  airlineLaborCutPct: number;
}) {
  const market = Math.max(
    0,
    Math.min(100, Math.round(props.marketHireCutPct)),
  );
  const airline = Math.max(
    0,
    Math.min(100, Math.round(props.airlineLaborCutPct)),
  );
  const rows: { job: string; pays: string; earns: string }[] = [
    {
      job: 'Freights / Charter (airline tail)',
      pays: 'Company · Jet-A',
      earns: `${market}% route net → your home · rest company`,
    },
    {
      job: 'Demand / Wide haul (desk stock)',
      pays: 'Company · Jet-A',
      earns: `${airline}% route net → your home · rest company`,
    },
    {
      job: 'Internal Haul (WH→WH)',
      pays: 'Company · Jet-A',
      earns: 'Haul fee → your home',
    },
    {
      job: 'Empty ferry (Line crew)',
      pays: 'Allowance · company · overflow your home',
      earns: '—',
    },
    {
      job: 'Pilot travel (Move chip)',
      pays: 'Your home wallet',
      earns: '—',
    },
    {
      job: 'Inspect / repair / overhaul',
      pays: 'Company wallet (owner only)',
      earns: '—',
    },
    {
      job: 'Solo empire (your port / WH)',
      pays: 'Your home wallet',
      earns: '100% → your home',
    },
  ];
  return (
    <div className="va-money-map">
      <p className="va-money-map-blurb">
        Topbar Wallet is always your <strong>home</strong> company. This Ledger
        is the shared <strong>company</strong> wallet. Solo keeps 100% after CAPEX;
        airline desk pays better than market hire on an airline tail — never above
        solo.
      </p>
      <table className="va-money-map-table">
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">Pays</th>
            <th scope="col">Pilot earns</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.job}>
              <td>{row.job}</td>
              <td>{row.pays}</td>
              <td>{row.earns}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reference dialog — Ledger keeps the map off the main flow. */
export function VaMoneyMapDialog(props: {
  marketHireCutPct: number;
  airlineLaborCutPct: number;
  onClose: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        className="confirm-dialog va-money-map-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Reference</p>
        <h2 id={titleId} className="confirm-title">
          Money map
        </h2>
        <div id={bodyId} className="confirm-body va-money-map-dialog-body">
          <VaMoneyMap
            marketHireCutPct={props.marketHireCutPct}
            airlineLaborCutPct={props.airlineLaborCutPct}
          />
        </div>
        <div className="confirm-actions">
          <button
            ref={closeRef}
            type="button"
            className="action"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
