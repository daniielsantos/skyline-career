import type { CareerCargoOps } from './api';
import { CommodityIcon } from './CommodityIcon';
import {
  CARGO_OPS_COMMODITY_LABELS,
  CARGO_OPS_TIERS,
  cargoOpsNextUnlockChecks,
  cargoOpsUnlockProgress,
  type CargoOpsTierId,
} from './cargo-ops-unlock';

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
          <p className="cargo-ops-side-note">{props.leaseUnlockHint}</p>
        ) : null}
      </section>
    );
  }

  const nextUnlock = cargoOpsNextUnlockChecks(ops);

  return (
    <section className="cargo-ops-panel" aria-label="Cargo Ops">
      <h3>Cargo Ops</h3>
      <p className="muted cargo-ops-lede">
        Tiers are an <strong>unlock path</strong>, not ranked by price. Dry trains
        you; Value is high $/kg; Time is deadline-sensitive; Heavy is bulk weight.
        Pay rises with each commodity&apos;s own rep after unlock.
      </p>

      {nextUnlock ? (
        <div className="cargo-ops-next" aria-label="Next unlock">
          <p className="cargo-ops-next-label">Next unlock</p>
          <p className="cargo-ops-next-title">{nextUnlock.tierLabel}</p>
          <p className="muted cargo-ops-next-lede">{nextUnlock.lede}</p>
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
        <p className="cargo-ops-all-open muted">All freight commodities unlocked.</p>
      )}

      {props.leaseUnlockHint ? (
        <p className="cargo-ops-side-note">
          <span className="cargo-ops-side-note-label">Lease</span>
          {props.leaseUnlockHint.replace(/^Lease unlock:\s*/i, '')}
        </p>
      ) : null}

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
          const progress = cargoOpsUnlockProgress(
            ops,
            tier.id as CargoOpsTierId,
          );
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
                  <strong>
                    {unlocked ? '●' : '○'} {tier.label}
                  </strong>
                  {isNext ? (
                    <span className="cargo-ops-next-tag">working toward</span>
                  ) : null}
                  {!unlocked && !isNext ? (
                    <span className="cargo-ops-lock">Locked</span>
                  ) : null}
                </div>
                <p className="muted cargo-ops-tier-lede">{tier.lede}</p>
              </div>
              {progress.summary && !isNext ? (
                <p className="cargo-ops-progress muted">{progress.summary}</p>
              ) : null}
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
                          <span>
                            rep {row.rep} · {row.settlesOk} clean ·{' '}
                            {payMultHint(row.rep)}
                          </span>
                        ) : (
                          <span className="muted">Locked — see checklist above</span>
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
