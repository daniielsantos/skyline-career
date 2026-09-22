import { useEffect, useMemo, useState } from 'react';
import type {
  CareerCashflowSnapshot,
  CareerLedgerEntry,
  CareerLedgerSummary,
  CompanyCreditSnapshot,
} from './api';
import { postCreditDraw, postCreditRepay } from './api';
import { boardMoneyLabel, isFiniteMoney } from './board-money';

const CASHFLOW_PAGE_SIZE = 10;

/** Mirror of shared LEDGER_SYSTEM_KINDS — keep in sync for Member column. */
const LEDGER_SYSTEM_KINDS = new Set([
  'hangar_parking',
  'crew_salary',
  'ground_staff_salary',
  'base_dispatcher_salary',
  'va_line_crew_salary',
  'credit_interest',
  'warehouse_storage',
  'fbo_storage',
  'port_yard_hold',
  'port_concession_lease',
  'fbo_hold_expire',
  'lease_payment',
  'lease_out_income',
]);

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
  fbo_buy: 'Base purchase',
  fbo_storage: 'Base storage',
  fbo_hold_expire: 'Base hold expired',
  fbo_spot_buy: 'FBO spot buy',
  fbo_spot_sale: 'FBO spot sale',
  port_buy: 'Port purchase',
  port_yard_hold: 'Port yard hold',
  port_drayage: 'Port stevedore',
  port_shuttle: 'Port shuttle',
  internal_haul_pay: 'Internal haul pay',
  port_concession_claim: 'Port FBO claim',
  port_concession_lease: 'Port FBO lease',
  port_concession_upgrade: 'Port FBO upgrade',
  fbo_reroute: 'Base reroute',
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
  base_dispatcher_salary: 'Base Dispatcher salary',
  base_dispatcher_hire: 'Base Dispatcher hire',
  base_dispatcher_fire: 'Base Dispatcher severance',
  ferry: 'Ferry',
  pilot_travel: 'Pilot travel',
  fuel: 'Jet-A',
  inspection: 'Inspection',
  repair: 'Repair',
  engine_overhaul: 'Engine overhaul',
  airframe_overhaul: 'Airframe overhaul',
  credit_draw: 'Credit draw',
  credit_repay: 'Credit repay',
  credit_interest: 'Credit interest',
  other: 'Other',
};

function kindLabel(kind: string, note?: string): string {
  if (
    kind === 'other' &&
    note &&
    /^debug\b/i.test(note.trim())
  ) {
    return 'Debug credit';
  }
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

function memberLabel(
  entry: CareerLedgerEntry,
  namesByAccountId: Record<string, string> | undefined,
): string {
  const id = entry.actorAccountId?.trim();
  if (id) {
    return namesByAccountId?.[id]?.trim() || id;
  }
  if (LEDGER_SYSTEM_KINDS.has(entry.kind)) return 'System';
  return '—';
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
          <dd className={
            isFiniteMoney(summary.netUsd) && summary.netUsd >= 0
              ? 'cashflow-pos'
              : 'cashflow-neg'
          }>
            {isFiniteMoney(summary.netUsd) && summary.netUsd >= 0 ? '' : '−'}
            {boardMoneyLabel(
              isFiniteMoney(summary.netUsd) ? Math.abs(summary.netUsd) : null,
              formatMoney,
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Week / month / all-time P&L cards (VA Ledger can place these above the hero). */
export function CashflowSummaryGrid(props: {
  cashflow: CareerCashflowSnapshot;
  formatMoney: (n: number) => string;
}) {
  return (
    <div className="cashflow-summary-grid">
      <SummaryCard
        title="This week"
        summary={props.cashflow.week}
        formatMoney={props.formatMoney}
      />
      <SummaryCard
        title="This month"
        summary={props.cashflow.month}
        formatMoney={props.formatMoney}
      />
      <SummaryCard
        title="All time"
        summary={props.cashflow.allTime}
        formatMoney={props.formatMoney}
      />
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

export function CompanyCreditBlock(props: {
  credit: CompanyCreditSnapshot | null;
  walletUsd: number;
  busy: boolean;
  /** Hide draw/repay (VA members — same wallet, owner-only credit). */
  actionsLocked?: boolean;
  /**
   * VA listed: Cargo Ops on this company is the owner's ladder — label
   * honestly; formula unchanged.
   */
  vaOwnerOpsLabels?: boolean;
  formatMoney: (n: number) => string;
  onUpdated: (next: {
    walletUsd: number;
    companyCredit: CompanyCreditSnapshot;
  }) => void;
  onError: (message: string) => void;
}) {
  const { credit, busy, formatMoney } = props;
  const ownerOps = Boolean(props.vaOwnerOpsLabels);
  const [drawAmount, setDrawAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const locked = busy || localBusy || Boolean(props.actionsLocked);

  if (!credit) {
    return (
      <div className="company-credit-block">
        <p className="aircraft-card-section-label">Credit</p>
        <p className="empty">Unavailable until hangar is ready.</p>
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
      <p className="aircraft-card-section-label">Credit</p>
      <p className="company-credit-blurb">
        {ownerOps
          ? 'Fleet value + owner Ops. Daily interest while drawn.'
          : 'Fleet value + Ops rep. Daily interest while drawn.'}
      </p>
      {overdue ? (
        <p className="banner warn">
          Overdue {credit.overdueDays} day{credit.overdueDays === 1 ? '' : 's'} —
          repay to unlock buy, ferry, and accept.
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
          <dt>{ownerOps ? 'Owner ops' : 'Ops rep'}</dt>
          <dd>{Math.round(credit.repScore * 100)}%</dd>
        </div>
        {credit.dailyInterestUsd > 0 ? (
          <div>
            <dt>Day interest</dt>
            <dd>{formatMoney(credit.dailyInterestUsd)}</dd>
          </div>
        ) : null}
      </dl>
      {props.actionsLocked ? (
        <p className="settings-help company-credit-locked-hint">
          Owner-only — members can view, not draw/repay.
        </p>
      ) : (
        <div className="company-credit-actions">
          <div className="company-credit-action">
            <span className="company-credit-action-label">Draw</span>
            <div className="company-credit-action-row">
              <input
                type="number"
                min={0}
                step={100}
                value={drawAmount}
                disabled={locked || overdue || credit.availableUsd <= 0}
                placeholder={String(Math.floor(credit.availableUsd))}
                aria-label="Draw amount"
                onChange={(e) => setDrawAmount(e.target.value)}
              />
              <button
                type="button"
                className="accept"
                disabled={locked || overdue || credit.availableUsd <= 0}
                onClick={() => void runDraw()}
              >
                Draw
              </button>
            </div>
          </div>
          <div className="company-credit-action">
            <span className="company-credit-action-label">Repay</span>
            <div className="company-credit-action-row">
              <input
                type="number"
                min={0}
                step={100}
                value={repayAmount}
                disabled={locked || credit.principalUsd <= 0}
                placeholder={String(Math.floor(credit.principalUsd))}
                aria-label="Repay amount"
                onChange={(e) => setRepayAmount(e.target.value)}
              />
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
                  Max
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HangarCashflowPanel(props: {
  cashflow: CareerCashflowSnapshot | null;
  companyCredit: CompanyCreditSnapshot | null;
  walletUsd: number;
  busy: boolean;
  /** When true, show credit status but no draw/repay controls. */
  creditActionsLocked?: boolean;
  /** VA Ledger hero owns Credit — omit the inline block here. */
  hideCredit?: boolean;
  /** When true, omit week/month/all-time (rendered above by CashflowSummaryGrid). */
  hideSummaries?: boolean;
  /** VA listed: label credit Cargo Ops as owner ladder (formula unchanged). */
  vaOwnerOpsLabels?: boolean;
  /**
   * My VA Ledger: show Member column. Map accountId → display name from roster.
   * Omit on solo Hangar cashflow.
   */
  memberNamesByAccountId?: Record<string, string>;
  formatMoney: (n: number) => string;
  onCreditUpdated: (next: {
    walletUsd: number;
    companyCredit: CompanyCreditSnapshot;
  }) => void;
  onCreditError: (message: string) => void;
}) {
  const snap = props.cashflow;
  const showMember = props.memberNamesByAccountId != null;
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
      {!props.hideCredit ? (
        <CompanyCreditBlock
          credit={props.companyCredit}
          walletUsd={props.walletUsd}
          busy={props.busy}
          actionsLocked={props.creditActionsLocked}
          vaOwnerOpsLabels={props.vaOwnerOpsLabels}
          formatMoney={props.formatMoney}
          onUpdated={props.onCreditUpdated}
          onError={props.onCreditError}
        />
      ) : null}
      {emptyLedger ? (
        <p className="empty">
          No ledger yet — freights, fuel, hangar parking, credit, leases, and shop
          visits will show up here.
        </p>
      ) : (
        <>
          {!props.hideSummaries ? (
            <CashflowSummaryGrid
              cashflow={snap!}
              formatMoney={props.formatMoney}
            />
          ) : null}

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
                        {showMember ? <th scope="col">Member</th> : null}
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
                          <td>{kindLabel(entry.kind, entry.note)}</td>
                          {showMember ? (
                            <td>{memberLabel(entry, props.memberNamesByAccountId)}</td>
                          ) : null}
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
