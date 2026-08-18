type BusySize = 'sm' | 'md' | 'lg';

export function BusySpinner(props: { size?: BusySize; className?: string }) {
  const size = props.size ?? 'md';
  const sizeClass =
    size === 'lg'
      ? ' busy-spinner-lg'
      : size === 'sm'
        ? ' busy-spinner-sm'
        : '';
  return (
    <span
      className={`busy-spinner${sizeClass}${props.className ? ` ${props.className}` : ''}`}
      aria-hidden
    />
  );
}

/** Frosted spinner chip for table/board overlays. Label is for assistive tech. */
export function BusyChip(props: { label: string; className?: string }) {
  return (
    <div
      className={`busy-chip${props.className ? ` ${props.className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-label={props.label}
    >
      <BusySpinner />
    </div>
  );
}

/** Centered spinner for empty panels (map, ports, staging). */
export function BusyBlock(props: { label: string; className?: string }) {
  return (
    <div
      className={`busy-block${props.className ? ` ${props.className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-label={props.label}
    >
      <BusySpinner size="lg" />
    </div>
  );
}

export function TableSkeleton(props: {
  rows?: number;
  cols: number;
  lead?: 'icon' | 'text';
}) {
  const rows = props.rows ?? 6;
  const lead = props.lead ?? 'icon';
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="skel-row">
          {Array.from({ length: props.cols }, (_, c) => (
            <td key={c}>
              {c === 0 && lead === 'icon' ? (
                <span className="skel-cell">
                  <span className="skel skel-icon" />
                  <span
                    className="skel"
                    style={{ width: `${58 + (i % 3) * 12}%` }}
                  />
                </span>
              ) : (
                <span
                  className="skel"
                  style={{ width: `${38 + ((i + c) % 4) * 14}%` }}
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
