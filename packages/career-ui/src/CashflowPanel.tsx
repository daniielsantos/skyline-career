import { useEffect, useMemo, useState } from 'react';
import type {
  CareerCashflowSnapshot,
  CareerLedgerEntry,
  CareerLedgerSummary,
  CompanyCreditSnapshot,
} from './api';
import { postCreditDraw, postCreditRepay } from './api';

const CASHFLOW_PAGE_SIZE = 20;

const KIND_LABEL: Record<string, string> = {
  freight_payout: 'Freight payout',
  hangar_parking: 'Hangar parking',
  lease_payment: 'Lease payment',
  lease_out_income: 'Lease-out income',
  lease_deposit: 'Lease deposit',
  lease_early_return: 'Lease early return',
  aircraft_buy: 'Aircraft purchase',
  aircraft_lease_sign: 'Lease entry',
  aircraft_sell: 'Aircraft sale',
  aircraft_buyout: 'Lease buyout',
  fbo_buy: 'FBO purchase',
  fbo_storage: 'FBO storage',
  fbo_hold_expire: 'FBO hold expired',
  fbo_spot_buy: 'FBO spot buy',
  fbo_spot_sale: 'FBO spot sale',
  port_buy: 'Port purchase',
  port_yard_hold: 'Port yard hold',
  fbo_reroute: 'FBO reroute',
  warehouse_buy: 'Warehouse purchase',
  warehouse_storage: 'Warehouse storage',
  warehouse_upgrade: 'Warehouse upgrade',
  demand_payout: 'Demand delivery',
  crew_fee: 'Crew dispatch fee',
  crew_salary: 'Crew salary',
  crew_hire: 'Crew hire',
  ground_staff_salary: 'Ground staff salary',
  ground_staff_hire: 'Ground staff hire',
  ground_staff_fire: 'Ground staff severance',
  ferry: 'Ferry',
  pilot_travel: 'Pilot travel',
  fuel: 'Jet-A',
  inspection: 'Inspection',
  repair: 'Repair',
  credit_draw: 'Credit draw',
  credit_repay: 'Credit repay',
  credit_interest: 'Credit interest',
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

function CompanyCreditBlock(props: {
  credit: CompanyCreditSnapshot | null;
  walletUsd: number;
  busy: boolean;
  formatMoney: (n: number) => string;
  onUpdated: (next: {
    walletUsd: number;
    companyCredit: CompanyCreditSnapshot;
  }) => void;
  onError: (message: string) => void;
}) {
  const { credit, busy, formatMoney } = props;
  const [drawAmount, setDrawAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const locked = busy || localBusy;

  if (!credit) {
    return (
      <div className="company-credit-block">
        <p className="aircraft-card-section-label">Company credit</p>
        <p className="empty">Credit line unavailable until hangar is ready.</p>
      </div>
    );
  }

  const overdue = credit.overdueDays > 0;

  async function runDraw() {
    const amount = Number(drawAmount);
    if (!(amount > 0)) {
      props.onError('Enter a positive draw amount');
      return;
    }
    setLocalBusy(true);
    try {
      const result = await postCreditDraw(amount);
      props.onUpdated({
        walletUsd: result.walletUsd,
        companyCredit: result.companyCredit,
      });
      setDrawAmount('');
    } catch (err) {
      props.onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  }

  async function runRepay() {
    const amount = Number(repayAmount);
    if (!(amount > 0)) {
      props.onError('Enter a positive repay amount');
      return;
    }
    setLocalBusy(true);
    try {
      const result = await postCreditRepay(amount);
      props.onUpdated({
        walletUsd: result.walletUsd,
        companyCredit: result.companyCredit,
      });
      setRepayAmount('');
    } catch (err) {
      props.onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className={`company-credit-block${overdue ? ' is-overdue' : ''}`}>
      <p className="aircraft-card-section-label">Company credit</p>
      <p className="company-credit-blurb">
        Revolving line from owned fleet sell-back + Cargo Ops reputation. Daily
        interest ~{(0.08).toFixed(2)}%/day. Overdue blocks buy, ferry, and accept.
      </p>
      {overdue ? (
        <p className="banner warn">
          Overdue {credit.overdueDays} day{credit.overdueDays === 1 ? '' : 's'} —
          repay from wallet to clear interest shortfall before ops.
        </p>
      ) : null}
      <dl className="company-credit-dl">
        <div>
          <dt>Limit</dt>
          <dd>{formatMoney(credit.limitUsd)}</dd>
        </div>
        <div>
          <dt>Drawn</dt>
          <dd className={credit.principalUsd > 0 ? 'cashflow-neg' : undefined}>
            {formatMoney(credit.principalUsd)}
          </dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd className="cashflow-pos">{formatMoney(credit.availableUsd)}</dd>
        </div>
        <div>
          <dt>Day interest</dt>
          <dd>{formatMoney(credit.dailyInterestUsd)}</dd>
        </div>
        <div>
          <dt>Collateral</dt>
          <dd>{formatMoney(credit.collateralUsd)}</dd>
        </div>
        <div>
          <dt>Ops rep</dt>
          <dd>{Math.round(credit.repScore * 100)}%</dd>
        </div>
      </dl>
      <div className="company-credit-actions">
        <label>
          Draw
          <input
            type="number"
            min={0}
            step={100}
            value={drawAmount}
            disabled={locked || overdue || credit.availableUsd <= 0}
            placeholder={String(Math.floor(credit.availableUsd))}
            onChange={(e) => setDrawAmount(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="accept"
          disabled={locked || overdue || credit.availableUsd <= 0}
          onClick={() => void runDraw()}
        >
          Draw
        </button>
        <label>
          Repay
          <input
            type="number"
            min={0}
            step={100}
            value={repayAmount}
            disabled={locked || credit.principalUsd <= 0}
            placeholder={String(Math.floor(credit.principalUsd))}
            onChange={(e) => setRepayAmount(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="accept"
          disabled={locked || credit.principalUsd <= 0}
          onClick={() => void runRepay()}
        >
          Repay
        </button>
        {credit.principalUsd > 0 ? (
          <button
            type="button"
            className="ghost"
            disabled={locked || props.walletUsd <= 0}
            onClick={() => {
              setRepayAmount(
                String(
                  Math.min(
                    Math.floor(credit.principalUsd),
                    Math.floor(props.walletUsd),
                  ),
                ),
              );
            }}
          >
            Max repay
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function HangarCashflowPanel(props: {
  cashflow: CareerCashflowSnapshot | null;
  companyCredit: CompanyCreditSnapshot | null;
  walletUsd: number;
  busy: boolean;
  formatMoney: (n: number) => string;
  onCreditUpdated: (next: {
    walletUsd: number;
    companyCredit: CompanyCreditSnapshot;
  }) => void;
  onCreditError: (message: string) => void;
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

  const emptyLedger =
    !snap || (snap.recent.length === 0 && snap.allTime.entryCount === 0);

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
      <CompanyCreditBlock
        credit={props.companyCredit}
        walletUsd={props.walletUsd}
        busy={props.busy}
        formatMoney={props.formatMoney}
        onUpdated={props.onCreditUpdated}
        onError={props.onCreditError}
      />

      {emptyLedger ? (
        <p className="empty">
          No ledger yet — freights, fuel, hangar parking, credit, leases, and shop
          visits will show up here.
        </p>
      ) : (
        <>
          <div className="cashflow-summary-grid">
            <SummaryCard
              title="This week"
              summary={snap!.week}
              formatMoney={props.formatMoney}
            />
            <SummaryCard
              title="This month"
              summary={snap!.month}
              formatMoney={props.formatMoney}
            />
            <SummaryCard
              title="All time"
              summary={snap!.allTime}
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
        </>
      )}
    </div>
  );
}
