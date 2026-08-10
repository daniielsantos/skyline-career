import type { AircraftClass, CareerClassOps } from './api';
import {
  CLASS_OPS_PROGRESS_IDS,
  classOpsUnlockProgress,
} from './class-ops-unlock';

/** Compact Class Ops ladder for Hangar / Career. */
export function ClassOpsPanel(props: {
  classOps: CareerClassOps | null | undefined;
}) {
  const ops = props.classOps;
  if (!ops?.classes) {
    return (
      <section className="cargo-ops-panel class-ops-panel" aria-label="Class Ops">
        <h3>Class Ops</h3>
        <p className="muted">
          Unlock freighter classes with flight hours and clean settles. Light GA
          and turboprop start open; Medium is optional beside Light jet.
        </p>
      </section>
    );
  }

  return (
    <section className="cargo-ops-panel class-ops-panel" aria-label="Class Ops">
      <h3>Class Ops</h3>
      <p className="muted">
        Starters are open. Jet or Medium unlock Narrow; Narrow unlocks Wide.
        Empty ferry legs do not count.
      </p>
      <ul className="cargo-ops-tiers">
        {CLASS_OPS_PROGRESS_IDS.map((id) => {
          const progress = classOpsUnlockProgress(ops, id as AircraftClass);
          return (
            <li
              key={id}
              className={
                progress.unlocked
                  ? 'cargo-ops-tier open'
                  : 'cargo-ops-tier locked'
              }
            >
              <div className="cargo-ops-tier-head">
                <strong>
                  {progress.unlocked ? '●' : '○'} {progress.label}
                </strong>
                {!progress.unlocked ? (
                  <span className="cargo-ops-lock">Locked</span>
                ) : null}
              </div>
              {progress.summary ? (
                <p className="cargo-ops-progress muted">{progress.summary}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
