import type { CareerCargoOps } from './api';
import { CommodityIcon } from './CommodityIcon';
import {
  CARGO_OPS_COMMODITY_LABELS,
  CARGO_OPS_TIERS,
  cargoOpsNextUnlockChecks,
} from './cargo-ops-unlock';

function payMultHint(rep: number): string {
  if (rep < 30) return 'pay ×0.85';
  if (rep < 50) return 'pay ×0.95';
  if (rep < 70) return 'pay ×1.00';
  if (rep < 85) return 'pay ×1.08';
  return 'pay ×1.15';
}

function formatHours(hours: number): string {
  const n = Math.round(hours * 10) / 10;
  return `${n}h`;
}

/** Compact Cargo Ops ladder for Hangar / Career. */
export function CargoOpsPanel(props: {
  cargoOps: CareerCargoOps | null | undefined;
  /** Optional lease-unlock progress line while still locked. */
  leaseUnlockHint?: string | null;
  /** Last settle one-liner (why clean / lease did or did not move). */
  lastSettleNote?: string | null;
  /** Lifetime pilot hours on this company (home). */
  pilotFlightHours?: number | null;
}) {
  const ops = props.cargoOps;
  const hours =
    typeof props.pilotFlightHours === 'number' &&
    Number.isFinite(props.pilotFlightHours)
      ? props.pilotFlightHours
      : null;
  const leaseShort = props.leaseUnlockHint
    ? props.leaseUnlockHint
        .replace(/^Lease unlock:\s*/i, '')
        .replace(/\s*clean Dry freights \(on-time\)\.?/i, '')
        .trim()
    : null;

  const meta = (
    <div className="cargo-ops-meta">
      {hours != null ? (
        <span className="cargo-ops-chip" title="Career flight hours on this company">
          Pilot {formatHours(hours)}
        </span>
      ) : null}
      {leaseShort ? (
        <span
          className="cargo-ops-chip"
          title="Clean on-time Dry freights to unlock aircraft lease"
        >
          Lease {leaseShort}
        </span>
      ) : null}
    </div>
  );

  if (!ops?.commodities) {
    return (
      <section className="cargo-ops-panel" aria-label="Cargo Ops">
        <div className="cargo-ops-head">
          <h3>Cargo Ops</h3>
          {meta}
        </div>
        <p className="muted cargo-ops-empty">Unlocks after your first freight settle.</p>
        {props.lastSettleNote ? (
          <p className="cargo-ops-last" title={props.lastSettleNote}>
            {props.lastSettleNote}
          </p>
        ) : null}
      </section>
    );
  }

  const nextUnlock = cargoOpsNextUnlockChecks(ops);

  return (
    <section className="cargo-ops-panel" aria-label="Cargo Ops">
      <div className="cargo-ops-head">
        <h3>Cargo Ops</h3>
        {meta}
      </div>

      {props.lastSettleNote ? (
        <p className="cargo-ops-last" title={props.lastSettleNote}>
          {props.lastSettleNote}
        </p>
      ) : null}

      {nextUnlock ? (
        <div className="cargo-ops-next" aria-label="Next unlock">
          <p className="cargo-ops-next-label">Next</p>
          <p className="cargo-ops-next-title">{nextUnlock.tierLabel}</p>
          <ul className="cargo-ops-checklist">
            {nextUnlock.checks.map((check) => (
              <li
                key={check.id}
                className={check.done ? 'cargo-ops-check done' : 'cargo-ops-check'}
              >
                <span className="cargo-ops-check-mark" aria-hidden>
                  {check.done ? '✓' : '○'}
                </span>
                <span>{check.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="cargo-ops-all-open muted">All commodities open.</p>
      )}

      <ul className="cargo-ops-tiers">
        {CARGO_OPS_TIERS.map((tier) => {
          const unlocked = tier.commodityIds.every(
            (id) => ops.commodities[id]?.unlocked,
          );
          const isNext =
            !unlocked &&
            nextUnlock != null &&
            ((tier.id === 'value' &&
              nextUnlock.tierLabel.startsWith('Value')) ||
              (tier.id === 'time' && nextUnlock.tierLabel.startsWith('Time')) ||
              (tier.id === 'heavy' && nextUnlock.tierLabel.startsWith('Heavy')));
          return (
            <li
              key={tier.id}
              className={[
                'cargo-ops-tier',
                unlocked ? 'open' : 'locked',
                isNext ? 'is-next' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="cargo-ops-tier-head">
                <div className="cargo-ops-tier-title">
                  <strong>{tier.label}</strong>
                  {unlocked ? (
                    <span className="class-ops-badge open">Open</span>
                  ) : isNext ? (
                    <span className="cargo-ops-next-tag">Next</span>
                  ) : (
                    <span className="class-ops-badge locked">Locked</span>
                  )}
                </div>
              </div>
              <ul className="cargo-ops-commodities">
                {tier.commodityIds.map((id) => {
                  const row = ops.commodities[id];
                  if (!row) return null;
                  const fill = Math.max(0, Math.min(100, row.rep));
                  return (
                    <li
                      key={id}
                      className={row.unlocked ? '' : 'cargo-ops-commodity-locked'}
                    >
                      <div className="cargo-ops-commodity-head">
                        <span className="commodity-inline">
                          <CommodityIcon commodityId={id} size={28} />
                          {CARGO_OPS_COMMODITY_LABELS[id]}
                        </span>
                        {row.unlocked ? (
                          <span title={payMultHint(row.rep)}>
                            {row.rep} · {row.settlesOk} clean
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                      {row.unlocked ? (
                        <div className="cargo-ops-bar" role="presentation">
                          <div
                            className="cargo-ops-bar-fill"
                            style={{ width: `${fill}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
