import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

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

/**
 * Primary/confirm CTA that shows spinner + busyLabel while an async action runs.
 * Keeps the same className (action / accept) for existing confirm styles.
 */
export function BusyButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    busy?: boolean;
    busyLabel?: string;
    children: ReactNode;
  },
) {
  const {
    busy = false,
    busyLabel = 'Working',
    children,
    className,
    disabled,
    type,
    ...rest
  } = props;
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={className}
      disabled={Boolean(disabled || busy)}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <>
          <BusySpinner size="sm" className="busy-spinner-on-accent" />
          <span>{busyLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
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

const ACTION_WAIT_MS = 180;

type WaitSnap = {
  /** Enabled buttons at the click, including the one just pressed. */
  enabledAtClick: number;
  /** Lowest enabled-button count seen since the click. */
  minEnabled: number;
  /** Title + label at the click, before the wait rewrite. */
  signature: string;
};

function enabledButtonCount(): number {
  return document.querySelectorAll('button:not([disabled])').length;
}

function buttonSignature(btn: HTMLButtonElement): string {
  return `${btn.getAttribute('title') ?? ''}\n${btn.textContent ?? ''}`;
}

function countRecovered(snap: WaitSnap): boolean {
  const now = enabledButtonCount();
  // The clicked control may stay disabled after the reply (Stock leaves the
  // aircraft assigned). The shared lock is over once the other buttons return.
  return now > snap.minEnabled && now >= snap.enabledAtClick - 1;
}

function labelStillWaiting(btn: HTMLButtonElement): boolean {
  const text = btn.textContent ?? '';
  return text.includes('…') || text.includes('...');
}

function clearActionWait(btn: HTMLButtonElement) {
  btn.removeAttribute('data-action-wait');
  if (btn.dataset.actionWaitAria === '1') {
    btn.removeAttribute('aria-busy');
    delete btn.dataset.actionWaitAria;
  }
}

/**
 * After a click, if that button stays disabled while the reply is in flight,
 * show the same small spinner the confirm CTAs use. Other buttons locked by
 * the same wait stay quiet. Fast clicks that re-enable before the delay
 * never flash. A button that stays disabled after the reply (the aircraft
 * left the ramp, the load is no longer dirty) drops the spinner once the
 * other controls unlock or its own label settles. A confirm dialog that
 * closes passes the spinner back to the button that opened it.
 */
export function ActionWait() {
  useEffect(() => {
    let timer = 0;
    let dip = 0;
    let watch = 0;
    let opener: HTMLButtonElement | null = null;
    let armed: HTMLButtonElement | null = null;
    let obs: MutationObserver | null = null;

    const disarm = () => {
      window.clearInterval(watch);
      watch = 0;
      obs?.disconnect();
      obs = null;
      if (armed) clearActionWait(armed);
      armed = null;
    };

    const arm = (btn: HTMLButtonElement, snap: WaitSnap) => {
      if (armed && armed !== btn) clearActionWait(armed);
      obs?.disconnect();
      armed = btn;
      const live: WaitSnap = {
        ...snap,
        minEnabled: Math.min(snap.minEnabled, enabledButtonCount()),
        signature: buttonSignature(btn),
      };
      btn.dataset.actionWait = '1';
      if (btn.getAttribute('aria-busy') !== 'true') {
        btn.setAttribute('aria-busy', 'true');
        btn.dataset.actionWaitAria = '1';
      }
      obs = new MutationObserver(() => {
        if (armed !== btn) return;
        if (!btn.isConnected || !btn.disabled || buttonSignature(btn) !== live.signature) {
          disarm();
        }
      });
      obs.observe(btn, {
        attributes: true,
        attributeFilter: ['title', 'class', 'disabled'],
        childList: true,
        characterData: true,
        subtree: true,
      });
      window.clearInterval(watch);
      watch = window.setInterval(() => {
        if (!armed || !armed.isConnected) {
          disarm();
          return;
        }
        live.minEnabled = Math.min(live.minEnabled, enabledButtonCount());
        if (!armed.disabled || countRecovered(live)) disarm();
      }, 120);
    };

    const onClick = (ev: Event) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest('button');
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.dataset.noActionWait === '1') return;
      if (armed && armed !== btn && !btn.disabled) disarm();
      if (btn.disabled) return;
      const previous = opener;
      window.clearTimeout(timer);
      window.clearInterval(dip);
      const clicked = btn;
      const snap: WaitSnap = {
        enabledAtClick: enabledButtonCount(),
        minEnabled: enabledButtonCount(),
        signature: buttonSignature(clicked),
      };
      queueMicrotask(() => {
        if (!clicked.isConnected || clicked.disabled) return;
        opener = clicked;
      });
      dip = window.setInterval(() => {
        snap.minEnabled = Math.min(snap.minEnabled, enabledButtonCount());
      }, 40);
      timer = window.setTimeout(() => {
        window.clearInterval(dip);
        dip = 0;
        snap.minEnabled = Math.min(snap.minEnabled, enabledButtonCount());
        if (!clicked.isConnected) {
          if (previous?.isConnected && previous.disabled) {
            const now = enabledButtonCount();
            arm(previous, {
              enabledAtClick: now + 1,
              minEnabled: now,
              signature: buttonSignature(previous),
            });
          }
          return;
        }
        if (!clicked.disabled) return;
        const moved = buttonSignature(clicked) !== snap.signature;
        const deepDip = snap.minEnabled < snap.enabledAtClick - 1;
        if (countRecovered(snap)) return;
        if (moved && !deepDip && !labelStillWaiting(clicked)) return;
        opener = null;
        arm(clicked, snap);
      }, ACTION_WAIT_MS);
    };

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.clearTimeout(timer);
      window.clearInterval(dip);
      disarm();
      opener = null;
    };
  }, []);
  return null;
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
