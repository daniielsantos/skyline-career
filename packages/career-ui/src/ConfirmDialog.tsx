import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type ConfirmTone = 'default' | 'danger' | 'warn';

export type ConfirmOptions = {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const confirmDialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      body={pending.body}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      tone={pending.tone}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}

function ConfirmDialog(props: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tone = props.tone ?? 'default';
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const onCancel = props.onCancel;
  const onConfirm = props.onConfirm;

  useEffect(() => {
    const focusTarget = tone === 'danger' ? cancelRef.current : confirmRef.current;
    focusTarget?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tone, onCancel, onConfirm]);

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
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
