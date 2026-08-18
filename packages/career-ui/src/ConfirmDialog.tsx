import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type ConfirmTone = 'default' | 'danger' | 'warn';

export type ConfirmOptions = {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Fly/Confirm starts disabled (e.g. while the body still loads). */
  confirmDisabled?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [confirmDisabled, setConfirmDisabled] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmDisabled(opts.confirmDisabled ?? false);
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
    setConfirmDisabled(false);
  }, []);

  const onConfirm = useCallback(() => {
    if (confirmDisabled) return;
    close(true);
  }, [close, confirmDisabled]);
  const onCancel = useCallback(() => close(false), [close]);

  const confirmDialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      body={pending.body}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      tone={pending.tone}
      confirmDisabled={confirmDisabled}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  ) : null;

  return { confirm, confirmDialog, setConfirmDisabled };
}

function ConfirmDialog(props: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tone = props.tone ?? 'default';
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const startOnCancel = useRef(Boolean(props.confirmDisabled));

  // Focus once on open — re-running on parent re-renders steals focus from
  // interactive body controls (e.g. <select>) and closes native dropdowns.
  useEffect(() => {
    const focusTarget =
      tone === 'danger' || startOnCancel.current
        ? cancelRef.current
        : confirmRef.current;
    focusTarget?.focus();
  }, [tone]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onCancel();
      }}
    >
      <div
        className={`confirm-dialog tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">
          {tone === 'danger' ? 'Confirm action' : tone === 'warn' ? 'Check before continuing' : 'Confirm'}
        </p>
        <h2 id={titleId} className="confirm-title">
          {props.title}
        </h2>
        <div id={bodyId} className="confirm-body">
          {typeof props.body === 'string'
            ? props.body.split('\n').map((line, index) => (
                <p key={`${index}-${line}`}>{line || '\u00a0'}</p>
              ))
            : props.body}
        </div>
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="action ghost"
            onClick={props.onCancel}
          >
            {props.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={
              tone === 'danger'
                ? 'action danger'
                : tone === 'warn'
                  ? 'action warn'
                  : 'action'
            }
            disabled={props.confirmDisabled}
            aria-busy={props.confirmDisabled || undefined}
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
