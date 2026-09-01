import type { EconomyCatchUpStatus } from './api';

function formatAwayHours(elapsedHours: number): string {
  if (elapsedHours < 1) {
    return `${Math.max(1, Math.round(elapsedHours * 60))}m`;
  }
  return `${elapsedHours}h`;
}

export function economySyncTooltip(status: EconomyCatchUpStatus): string {
  const away = formatAwayHours(status.elapsedHours);
  const pulseSec = Math.round(status.pulseMs / 1000);
  return [
    `Economy syncing — ${status.ticksBehind} batch${
      status.ticksBehind === 1 ? '' : 'es'
    } behind (~${away} away).`,
    `~${status.etaMinutes} min left while Career stays open`,
    `(${status.ticksPerPulse} batches / ${pulseSec}s).`,
    'Freights and NPC update as batches run. You can keep playing.',
  ].join(' ');
}

export function EconomySyncIndicator(props: { status: EconomyCatchUpStatus }) {
  const title = economySyncTooltip(props.status);
  return (
    <button
      type="button"
      className="economy-sync-chip"
      title={title}
      aria-label={title}
    >
      <span className="economy-sync-chip-icon" aria-hidden>
        ⟳
      </span>
    </button>
  );
}
