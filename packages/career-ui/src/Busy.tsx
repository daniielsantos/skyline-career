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

/** Inline spinner + visible label (pagination, muted panels, sidebar). */
export function BusyStatus(props: {
  label: string;
  size?: BusySize;
  className?: string;
}) {
  return (
    <span
      className={`busy-status${props.className ? ` ${props.className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      <BusySpinner size={props.size ?? 'sm'} />
      <span>{props.label}</span>
    </span>
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
      <p className="busy-block-label">{props.label}</p>
    </div>
  );
}

/** Boot splash while career state hydrates (freights, dispatch, etc.). */
export function BusyBoot(props: {
  title: string;
  detail?: string;
  align?: 'start' | 'center';
  className?: string;
}) {
  const align = props.align ?? 'start';
  return (
    <div
      className={`busy-boot busy-boot--${align}${props.className ? ` ${props.className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-label={props.title}
    >
      <BusySpinner size="lg" />
      <div>
        <h2>{props.title}</h2>
        {props.detail ? <p className="muted">{props.detail}</p> : null}
      </div>
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
