import { useEffect, useMemo, useState } from 'react';
import type {
  CareerCashflowSnapshot,
  CareerLedgerEntry,
  CareerLedgerSummary,
} from './api';

const CASHFLOW_PAGE_SIZE = 20;

const KIND_LABEL: Record<string, string> = {
  freight_payout: 'Freight payout',
  hangar_parking: 'Hangar parking',
  lease_payment: 'Lease payment',
  lease_out_income: 'Lease-out income',
  lease_deposit: 'Lease deposit',
  aircraft_buy: 'Aircraft purchase',
  aircraft_lease_sign: 'Lease entry',
  aircraft_sell: 'Aircraft sale',
  aircraft_buyout: 'Lease buyout',
  ferry: 'Ferry',
  fuel: 'Jet-A',
  inspection: 'Inspection',
  repair: 'Repair',
  other: 'Other',
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

function SummaryCard(props: {
  title: string;
  summary: CareerLedgerSummary;
  formatMoney: (n: number) => string;
}) {
  const { summary, formatMoney } = props;
  return (
    <div className="cashflow-summary-card">
      <p className="aircraft-card-section-label">{props.title}</p>
      <dl className="cashflow-summary-dl">
        <div>
          <dt>Income</dt>
          <dd className="cashflow-pos">{formatMoney(summary.incomeUsd)}</dd>
        </div>
        <div>
          <dt>Expenses</dt>
          <dd className="cashflow-neg">−{formatMoney(summary.expenseUsd)}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className={summary.netUsd >= 0 ? 'cashflow-pos' : 'cashflow-neg'}>
            {summary.netUsd >= 0 ? '' : '−'}
            {formatMoney(Math.abs(summary.netUsd))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function amountCell(entry: CareerLedgerEntry, formatMoney: (n: number) => string) {
  const positive = entry.amountUsd >= 0;
  return (
    <span className={positive ? 'cashflow-pos' : 'cashflow-neg'}>
      {positive ? '+' : '−'}
      {formatMoney(Math.abs(entry.amountUsd))}
    </span>
  );
}

export function HangarCashflowPanel(props: {
  cashflow: CareerCashflowSnapshot | null;
  formatMoney: (n: number) => string;
}) {
  const snap = props.cashflow;
  const [page, setPage] = useState(1);

  const recent = snap?.recent ?? [];
  const pageCount = Math.max(1, Math.ceil(recent.length / CASHFLOW_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
  }, [recent.length]);

  const pageEntries = useMemo(() => {
    const start = (safePage - 1) * CASHFLOW_PAGE_SIZE;
    return recent.slice(start, start + CASHFLOW_PAGE_SIZE);
  }, [recent, safePage]);

  if (!snap) {
    return <p className="empty">Loading cashflow…</p>;
  }
  if (snap.recent.length === 0 && snap.allTime.entryCount === 0) {
    return (
      <p className="empty">
        No ledger yet — freights, fuel, hangar parking, leases, and shop visits will
        show up here.
      </p>
    );
  }

  const total = recent.length;
  const rangeLabel =
    total === 0
      ? '0 records'
      : `${(safePage - 1) * CASHFLOW_PAGE_SIZE + 1}–${Math.min(
          safePage * CASHFLOW_PAGE_SIZE,
          total,
        )} of ${total}`;

  return (
    <div className="cashflow-panel">
      <div className="cashflow-summary-grid">
        <SummaryCard
          title="This week"
          summary={snap.week}
          formatMoney={props.formatMoney}
        />
        <SummaryCard
          title="This month"
          summary={snap.month}
          formatMoney={props.formatMoney}
        />
        <SummaryCard
          title="All time"
          summary={snap.allTime}
          formatMoney={props.formatMoney}
        />
      </div>

      <div className="cashflow-history">
        <p className="aircraft-card-section-label">Recent activity</p>
        {total === 0 ? (
          <p className="empty">No recent ledger rows.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="cashflow-table">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Activity</th>
                    <th scope="col">ICAO</th>
                    <th scope="col">Note</th>
                    <th scope="col" className="cashflow-col-amount">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.dayIndex}</td>
                      <td>{kindLabel(entry.kind)}</td>
                      <td>{entry.icao ?? '—'}</td>
                      <td className="cashflow-col-note">
                        {entry.note?.trim() ? entry.note : '—'}
                      </td>
                      <td className="cashflow-col-amount">
                        {amountCell(entry, props.formatMoney)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Cashflow activity pages">
              <p>{rangeLabel}</p>
              <div>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
