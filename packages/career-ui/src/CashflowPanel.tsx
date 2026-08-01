import type { CareerCashflowSnapshot, CareerLedgerEntry, CareerLedgerSummary } from './api';

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

function LedgerRow(props: {
  entry: CareerLedgerEntry;
  formatMoney: (n: number) => string;
}) {
  const { entry, formatMoney } = props;
  const positive = entry.amountUsd >= 0;
  return (
    <li className="cashflow-row">
      <div className="cashflow-row-main">
        <strong>{kindLabel(entry.kind)}</strong>
        <span className={positive ? 'cashflow-pos' : 'cashflow-neg'}>
          {positive ? '+' : '−'}
          {formatMoney(Math.abs(entry.amountUsd))}
        </span>
      </div>
      <div className="cashflow-row-meta">
        <span>Day {entry.dayIndex}</span>
        {entry.icao ? <span>{entry.icao}</span> : null}
        {entry.note ? <span>{entry.note}</span> : null}
      </div>
    </li>
  );
}

export function HangarCashflowPanel(props: {
  cashflow: CareerCashflowSnapshot | null;
  formatMoney: (n: number) => string;
}) {
  const snap = props.cashflow;
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
        <ul className="cashflow-list">
          {snap.recent.map((entry) => (
            <LedgerRow
              key={entry.id}
              entry={entry}
              formatMoney={props.formatMoney}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
