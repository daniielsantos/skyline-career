import type { CompanyCrewSnapshot, Mission } from './api';
import { crewPortraitUrl } from './crewPortraits';
import { CrewFlyControls } from './CrewFlyControls';

function formatEta(arrivesAtMs: number | undefined): string | null {
  if (typeof arrivesAtMs !== 'number' || !Number.isFinite(arrivesAtMs)) {
    return null;
  }
  return new Date(arrivesAtMs).toLocaleTimeString();
}

function legProgressPct(mission: Mission, nowMs: number): number {
  if (
    typeof mission.airborneAtMs !== 'number' ||
    typeof mission.expectedRouteMs !== 'number' ||
    mission.expectedRouteMs <= 0
  ) {
    return 0;
  }
  const duration = mission.expectedRouteMs;
  const flown = Math.min(
    duration,
    Math.max(0, nowMs - mission.airborneAtMs),
  );
  return Math.min(100, Math.round((flown / duration) * 100));
}

function legEtaHours(mission: Mission, nowMs: number): number {
  if (
    typeof mission.airborneAtMs !== 'number' ||
    typeof mission.expectedRouteMs !== 'number'
  ) {
    return 0;
  }
  return Math.max(
    0,
    (mission.airborneAtMs + mission.expectedRouteMs - nowMs) / 3_600_000,
  );
}

function crewInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

/** Stable 0–3 tint index from a name (no purple palette). */
function portraitTone(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 4;
}

export type CrewReadyMission = {
  mission: Mission;
  aircraftLabel: string;
};

export function CrewPortrait(props: {
  name: string;
  /** Future: real headshot URL from roster asset pack. */
  imageUrl?: string | null;
  airborne?: boolean;
}) {
  const tone = portraitTone(props.name);
  if (props.imageUrl) {
    return (
      <div
        className={`crew-portrait${props.airborne ? ' is-airborne' : ''}`}
        data-tone={tone}
      >
        <img src={props.imageUrl} alt="" />
      </div>
    );
  }
  return (
    <div
      className={`crew-portrait${props.airborne ? ' is-airborne' : ''}`}
      data-tone={tone}
      aria-hidden="true"
    >
      <span className="crew-portrait-initials">{crewInitials(props.name)}</span>
    </div>
  );
}

/** Hangar roster + short hire desk for company crew. */
export function CrewPanel(props: {
  companyCrew: CompanyCrewSnapshot | null | undefined;
  formatMoney: (n: number) => string;
  formatTonnes?: (kg: number) => string;
  formatDuration?: (hours: number) => string;
  busy?: boolean;
  nowMs?: number;
  readyMissions?: CrewReadyMission[];
  onOpenAirport?: (icao: string) => void;
  onHire?: (candidateId: string) => void;
  onFire?: (memberId: string) => void;
  onCrewDispatch?: (mission: Mission, crewMemberId: string) => void;
  onCrewAssign?: (mission: Mission, crewMemberId: string) => void;
  onReturnToFbo?: (mission: Mission) => void;
}) {
  const crew = props.companyCrew;
  if (!crew || crew.slotsUnlocked <= 0) {
    return (
      <section className="crew-panel" aria-label="Company crew">
        <header className="crew-panel-head">
          <h3>Crew</h3>
          <p className="muted">
            Buy an FBO to unlock a company crew slot. Hire from the short desk
            here — not a pilot market. Crew flies your airframes on wall-clock
            ETA (fee per leg + daily salary).
          </p>
        </header>
      </section>
    );
  }

  const members = crew.members ?? [];
  const hirePool = crew.hirePool ?? [];
  const canHire = (crew.rosterSlotsFree ?? 0) > 0 && Boolean(props.onHire);
  const idleCrew = members
    .filter((m) => m.status === 'idle')
    .map((m) => ({
      id: m.id,
      displayName: m.displayName,
      perkLabel: m.perkLabel,
    }));
  const canCrew = idleCrew.length > 0 && Boolean(props.onCrewDispatch);
  const ready = props.readyMissions ?? [];
  const nowMs = props.nowMs ?? Date.now();

  return (
    <section className="crew-panel" aria-label="Company crew">
      <header className="crew-panel-head">
        <h3>Crew</h3>
        <p className="muted">
          Roster {members.length}/{crew.slotsUnlocked}
          {typeof crew.slotsMax === 'number' ? ` (max ${crew.slotsMax})` : ''}
          {crew.baseIcao ? ` · based at ${crew.baseIcao}` : ''}
          {' · '}
          fee {Math.round(crew.feeFrac * 100)}% outbound (+½ return) · daily
          salary · round-trip back to origin.
        </p>
      </header>

      {ready.length > 0 ? (
        <div className="crew-section">
          <h4 className="crew-section-title">Crew legs</h4>
          <p className="muted crew-section-lede">
            Accepted legs and airborne round-trips — pick idle crew or watch
            progress.
          </p>
          <ul className="crew-leg-list">
            {ready.map(({ mission, aircraftLabel }) => {
              const airborne =
                mission.status === 'in_flight' && mission.crewOperated === true;
              const crewName = mission.crewMemberId
                ? members.find((m) => m.id === mission.crewMemberId)
                    ?.displayName
                : undefined;
              const pct = airborne ? legProgressPct(mission, nowMs) : 0;
              const etaH = airborne ? legEtaHours(mission, nowMs) : 0;
              return (
                <li key={mission.id} className="crew-leg-card">
                  <div className="crew-leg-card-top">
                    <strong className="crew-leg-route">
                      {mission.originIcao}
                      <span aria-hidden="true">→</span>
                      {mission.destIcao}
                    </strong>
                    <span
                      className={
                        airborne ? 'crew-status airborne' : 'crew-status idle'
                      }
                    >
                      {airborne
                        ? mission.crewDeadhead
                          ? 'Returning'
                          : 'En route'
                        : mission.status}
                    </span>
                  </div>
                  <p className="crew-card-meta">
                    {aircraftLabel}
                    {mission.crewDeadhead
                      ? ' · empty return'
                      : props.formatTonnes
                        ? ` · ${props.formatTonnes(mission.cargoKg)}`
                        : ''}
                    {mission.crewDeadhead
                      ? ''
                      : ` · ${props.formatMoney(mission.payUsd)}`}
                    {airborne && crewName ? ` · ${crewName}` : ''}
                  </p>
                  {airborne ? (
                    <div className="crew-leg-progress">
                      <div
                        className="progress-track"
                        title={`${pct}% · ETA ${
                          props.formatDuration
                            ? props.formatDuration(etaH)
                            : `${Math.round(etaH * 60)}m`
                        }`}
                      >
                        <span style={{ width: `${pct}%` }} />
                        <em>{pct}%</em>
                      </div>
                      <p className="crew-card-meta">
                        ETA{' '}
                        {props.formatDuration
                          ? props.formatDuration(etaH)
                          : `${Math.round(etaH * 60)}m`}
                      </p>
                    </div>
                  ) : canCrew || props.onReturnToFbo ? (
                    <div className="crew-card-actions">
                      {canCrew ? (
                        <CrewFlyControls
                          idleCrew={idleCrew}
                          busy={props.busy}
                          value={mission.crewMemberId}
                          onSelect={(crewMemberId) =>
                            props.onCrewAssign?.(mission, crewMemberId)
                          }
                          onFly={(crewMemberId) =>
                            props.onCrewDispatch?.(mission, crewMemberId)
                          }
                        />
                      ) : (
                        <span className="muted">No idle crew</span>
                      )}
                      {props.onReturnToFbo ? (
                        <button
                          type="button"
                          className="action ghost"
                          disabled={props.busy}
                          title="Cancel this leg and bond cargo back at the FBO"
                          onClick={() => props.onReturnToFbo?.(mission)}
                        >
                          Return
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="crew-section">
        <h4 className="crew-section-title">Roster</h4>
        {members.length === 0 ? (
          <p className="empty">No one hired yet — pick a candidate below.</p>
        ) : (
          <ul className="crew-person-grid">
            {members.map((member) => {
              const eta = formatEta(member.arrivesAtMs);
              const route =
                member.status === 'airborne' &&
                member.originIcao &&
                member.destIcao
                  ? `${member.originIcao}→${member.destIcao}`
                  : null;
              const airborne = member.status === 'airborne';
              return (
                <li key={member.id} className="crew-person-card">
                  <CrewPortrait
                    name={member.displayName}
                    imageUrl={crewPortraitUrl(member.portraitId)}
                    airborne={airborne}
                  />
                  <div className="crew-person-body">
                    <div className="crew-person-head">
                      <strong className="crew-person-name">
                        {member.displayName}
                      </strong>
                      <span
                        className={
                          airborne
                            ? 'crew-status airborne'
                            : 'crew-status idle'
                        }
                      >
                        {airborne ? 'Airborne' : 'Idle'}
                      </span>
                    </div>
                    {member.perkLabel ? (
                      <p className="crew-person-perk">
                        <span className="crew-perk-tag">{member.perkLabel}</span>
                        {member.perkHint ? (
                          <span className="muted"> {member.perkHint}</span>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="crew-card-meta">
                      Base{' '}
                      {props.onOpenAirport ? (
                        <button
                          type="button"
                          className="linkish"
                          onClick={() =>
                            props.onOpenAirport?.(member.baseIcao)
                          }
                        >
                          {member.baseIcao}
                        </button>
                      ) : (
                        member.baseIcao
                      )}
                      {typeof member.salaryUsdPerDay === 'number'
                        ? ` · ${props.formatMoney(member.salaryUsdPerDay)}/day`
                        : ''}
                      {typeof member.lastFeeUsd === 'number'
                        ? ` · last fee ${props.formatMoney(member.lastFeeUsd)}`
                        : ''}
                    </p>
                    {route ? (
                      <p className="crew-person-route">
                        {route}
                        {eta ? ` · ETA ${eta}` : ''}
                      </p>
                    ) : null}
                    {member.status === 'idle' && props.onFire ? (
                      <div className="crew-card-actions">
                        <button
                          type="button"
                          className="action ghost"
                          disabled={props.busy}
                          onClick={() => props.onFire?.(member.id)}
                        >
                          Fire
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="crew-section">
        <h4 className="crew-section-title">Hire desk</h4>
        <p className="muted crew-section-lede">
          {hirePool.length} candidate{hirePool.length === 1 ? '' : 's'} at{' '}
          {crew.baseIcao ?? 'FBO'} — refreshes each economy day.
          {!canHire && members.length >= crew.slotsUnlocked
            ? ' Slot full — fire to hire someone else.'
            : ''}
        </p>
        {hirePool.length === 0 ? (
          <p className="empty">No candidates today — check back tomorrow.</p>
        ) : (
          <ul className="crew-person-grid">
            {hirePool.map((cand) => (
              <li key={cand.id} className="crew-person-card is-hire">
                <CrewPortrait
                  name={cand.displayName}
                  imageUrl={crewPortraitUrl(cand.portraitId)}
                />
                <div className="crew-person-body">
                  <div className="crew-person-head">
                    <strong className="crew-person-name">
                      {cand.displayName}
                    </strong>
                    <span className="crew-perk-tag">{cand.perkLabel}</span>
                  </div>
                  <p className="crew-card-meta">{cand.perkHint}</p>
                  <p className="crew-card-meta">
                    Salary {props.formatMoney(cand.salaryUsdPerDay)}/day
                  </p>
                  {canHire ? (
                    <div className="crew-card-actions">
                      <button
                        type="button"
                        className="accept"
                        disabled={props.busy}
                        onClick={() => props.onHire?.(cand.id)}
                      >
                        Hire · {props.formatMoney(cand.hireUsd)}
                      </button>
                    </div>
                  ) : (
                    <p className="crew-card-meta muted">No free roster slot</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
