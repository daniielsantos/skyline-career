import type { LogbookListFilter } from './logbook';

type Props = {
  value: LogbookListFilter;
  onChange: (next: LogbookListFilter) => void;
  settledCount: number;
  cancelledCount: number;
};

/** Two-state filter: Settled (default) | Cancelled. */
export function LogbookListFilterToggle(props: Props) {
  return (
    <div
      className="logbook-list-filter"
      role="group"
      aria-label="Logbook status filter"
    >
      <button
        type="button"
        className={props.value === 'settled' ? 'is-active' : undefined}
        aria-pressed={props.value === 'settled'}
        onClick={() => props.onChange('settled')}
      >
        Settled
        {props.settledCount > 0 ? ` (${props.settledCount})` : ''}
      </button>
      <button
        type="button"
        className={props.value === 'cancelled' ? 'is-active' : undefined}
        aria-pressed={props.value === 'cancelled'}
        onClick={() => props.onChange('cancelled')}
      >
        Cancelled
        {props.cancelledCount > 0 ? ` (${props.cancelledCount})` : ''}
      </button>
    </div>
  );
}
