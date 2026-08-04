import { useEffect, useMemo, useState } from 'react';

export type CrewFlyOption = {
  id: string;
  displayName: string;
  perkLabel?: string;
};

/** Idle-crew picker + Crew fly action for Accepted legs / holds. */
export function CrewFlyControls(props: {
  idleCrew: CrewFlyOption[];
  busy?: boolean;
  /** Preferred crew id (persisted on the mission as crewMemberId). */
  value?: string;
  /** Fired when the pilot pick changes — parent should persist. */
  onSelect?: (crewMemberId: string) => void;
  onFly: (crewMemberId: string) => void;
  buttonLabel?: string;
  className?: string;
}) {
  const idle = props.idleCrew;
  const idleIds = useMemo(() => idle.map((c) => c.id).join('\0'), [idle]);
  const preferred =
    props.value && idle.some((c) => c.id === props.value)
      ? props.value
      : undefined;
  const [crewId, setCrewId] = useState(preferred ?? idle[0]?.id ?? '');

  useEffect(() => {
    if (preferred) {
      setCrewId(preferred);
      return;
    }
    if (!idle.some((c) => c.id === crewId)) {
      setCrewId(idle[0]?.id ?? '');
    }
    // idleIds: stable fingerprint so a new array ref alone does not reset the pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferred, idleIds]);

  if (idle.length === 0) {
    return <span className="muted">No idle crew</span>;
  }

  const selected =
    crewId && idle.some((c) => c.id === crewId) ? crewId : (idle[0]?.id ?? '');

  return (
    <div className={props.className ?? 'crew-fly-controls'}>
      <label className="crew-fly-pick">
        <select
          value={selected}
          disabled={props.busy}
          onChange={(e) => {
            const next = e.target.value;
            setCrewId(next);
            props.onSelect?.(next);
          }}
          aria-label="Choose crew"
          title="Which crew flies this leg"
        >
          {idle.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
              {c.perkLabel ? ` · ${c.perkLabel}` : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="accept"
        disabled={props.busy || !selected}
        onClick={() => {
          if (selected) props.onFly(selected);
        }}
      >
        {props.buttonLabel ?? 'Crew fly'}
      </button>
    </div>
  );
}
