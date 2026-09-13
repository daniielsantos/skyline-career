import type { CareerClassOps } from './api';
import {
  CLASS_OPS_PROGRESS_IDS,
  classOpsNextUnlock,
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

  const next = classOpsNextUnlock(ops);
  const unlockedCount = CLASS_OPS_PROGRESS_IDS.filter(
    (id) => classOpsUnlockProgress(ops, id).unlocked,
  ).length;

  return (
    <section className="cargo-ops-panel class-ops-panel" aria-label="Class Ops">
      <h3>Class Ops</h3>
      <p className="muted cargo-ops-lede">
        Starters (Light GA / turboprop) are always open. Jet or Medium unlocks
        Narrow; Narrow unlocks Wide. Contract crew flights count — empty ferry /
        reposition legs do not.
      </p>

      <p className="class-ops-status-line" role="status">
        <strong>
          {unlockedCount}/{CLASS_OPS_PROGRESS_IDS.length}
        </strong>{' '}
        ladder classes unlocked
        <span className="muted">
          {' '}
          · starters always open
        </span>
      </p>

      {next ? (
        <div className="cargo-ops-next" aria-label="Next class unlock">
          <p className="cargo-ops-next-label">Next unlock</p>
          <p className="cargo-ops-next-title">{next.label}</p>
          <p className="muted cargo-ops-next-lede">{next.summary}</p>
        </div>
      ) : (
        <p className="cargo-ops-all-open muted">All freighter classes unlocked.</p>
      )}

      <ul className="cargo-ops-tiers">
        {CLASS_OPS_PROGRESS_IDS.map((id) => {
          const progress = classOpsUnlockProgress(ops, id);
          const isNext = next?.classId === id;
          return (
            <li
              key={id}
              className={[
                'cargo-ops-tier',
                'class-ops-tier',
                progress.unlocked ? 'open' : 'locked',
                isNext ? 'is-next' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="cargo-ops-tier-head">
                <div className="cargo-ops-tier-title">
                  <strong>{progress.label}</strong>
                  {progress.unlocked ? (
                    <span className="class-ops-badge open">Unlocked</span>
                  ) : isNext ? (
                    <span className="cargo-ops-next-tag">Working toward</span>
                  ) : (
                    <span className="class-ops-badge locked">Locked</span>
                  )}
                </div>
              </div>
              {progress.summary ? (
                <p
                  className={
                    progress.unlocked
                      ? 'cargo-ops-progress class-ops-stats'
                      : 'cargo-ops-progress muted'
                  }
                >
                  {progress.summary}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
