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
        <div className="cargo-ops-head">
          <h3>Class Ops</h3>
        </div>
        <p className="muted cargo-ops-empty">
          Unlocks with hours and clean settles on freights.
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
      <div className="cargo-ops-head">
        <h3>Class Ops</h3>
        <div className="cargo-ops-meta">
          <span
            className="cargo-ops-chip"
            title="Ladder classes (Light GA / turboprop start open)"
          >
            {unlockedCount}/{CLASS_OPS_PROGRESS_IDS.length}
          </span>
        </div>
      </div>

      {next ? (
        <div className="cargo-ops-next" aria-label="Next class unlock">
          <p className="cargo-ops-next-label">Next</p>
          <p className="cargo-ops-next-title">{next.label}</p>
          <p className="cargo-ops-next-progress">{next.summary}</p>
        </div>
      ) : (
        <p className="cargo-ops-all-open muted">All classes open.</p>
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
                    <span className="class-ops-badge open">Open</span>
                  ) : isNext ? (
                    <span className="cargo-ops-next-tag">Next</span>
                  ) : (
                    <span className="class-ops-badge locked">Locked</span>
                  )}
                </div>
              </div>
              {progress.unlocked && progress.summary ? (
                <p className="cargo-ops-progress class-ops-stats">
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
