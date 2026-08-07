import type { CareerCargoOps, CargoOpsCommodityId } from './api';
import { CommodityIcon } from './CommodityIcon';
import {
  CARGO_OPS_TIERS,
  cargoOpsUnlockProgress,
  type CargoOpsTierId,
} from './cargo-ops-unlock';

const LABELS: Record<CargoOpsCommodityId, string> = {
  general: 'General',
  supplies: 'Supplies',
  electronics: 'Electronics',
  perishables: 'Perishables',
  machinery: 'Machinery',
};

function payMultHint(rep: number): string {
  if (rep < 30) return 'pay ×0.85';
  if (rep < 50) return 'pay ×0.95';
  if (rep < 70) return 'pay ×1.00';
  if (rep < 85) return 'pay ×1.08';
  return 'pay ×1.15';
}

/** Compact Cargo Ops ladder for Hangar / Career. */
export function CargoOpsPanel(props: {
  cargoOps: CareerCargoOps | null | undefined;
  /** Optional lease-unlock progress line while still locked. */
  leaseUnlockHint?: string | null;
}) {
  const ops = props.cargoOps;
  if (!ops?.commodities) {
    return (
      <section className="cargo-ops-panel" aria-label="Cargo Ops">
        <h3>Cargo Ops</h3>
        <p className="muted">Progression unlocks after your first freight settle.</p>
        {props.leaseUnlockHint ? (
          <p className="muted">{props.leaseUnlockHint}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="cargo-ops-panel" aria-label="Cargo Ops">
      <h3>Cargo Ops</h3>
      <p className="muted">
        Unlock opens the board for that freight class. Pay rises with that
        commodity&apos;s own reputation — Dry is always open.
      </p>
      {props.leaseUnlockHint ? (
        <p className="muted">{props.leaseUnlockHint}</p>
      ) : null}
      <ul className="cargo-ops-tiers">
        {CARGO_OPS_TIERS.map((tier) => {
          const unlocked = tier.commodityIds.every(
            (id) => ops.commodities[id]?.unlocked,
          );
          const progress = cargoOpsUnlockProgress(
            ops,
            tier.id as CargoOpsTierId,
          );
          return (
            <li
              key={tier.id}
              className={
                unlocked ? 'cargo-ops-tier open' : 'cargo-ops-tier locked'
              }
            >
              <div className="cargo-ops-tier-head">
                <strong>
                  {unlocked ? '●' : '○'} {tier.label}
                </strong>
                {!unlocked ? <span className="cargo-ops-lock">Locked</span> : null}
              </div>
              {progress.summary ? (
                <p className="cargo-ops-progress muted">{progress.summary}</p>
              ) : null}
              <ul className="cargo-ops-commodities">
                {tier.commodityIds.map((id) => {
                  const row = ops.commodities[id];
                  if (!row) return null;
                  const fill = Math.max(0, Math.min(100, row.rep));
                  return (
                    <li key={id}>
                      <div className="cargo-ops-commodity-head">
                        <span className="commodity-inline">
                          <CommodityIcon commodityId={id} size={28} />
                          {LABELS[id]}
                          {!row.unlocked ? ' · locked' : ''}
                        </span>
                        <span>
                          rep {row.rep} · {row.settlesOk} clean ·{' '}
                          {payMultHint(row.rep)}
                        </span>
                      </div>
                      <div className="cargo-ops-bar" role="presentation">
                        <div
                          className="cargo-ops-bar-fill"
                          style={{ width: `${fill}%` }}
                        />
                      </div>
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
