import { useEffect, useId, useRef, useState } from 'react';
import type { PageHelpCopy } from './page-help';

export function PageHelpButton(props: { help: PageHelpCopy }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeRef.current?.focus();
      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
      }
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
    return undefined;
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="page-help-trigger"
        aria-label={props.help.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="7.6" r="1.15" fill="currentColor" />
          <path
            d="M10.7 11.1h1.85V16.8H10.7v-1.05h-.95V14.4h.95z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="confirm-dialog page-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
          >
            <p className="confirm-kicker">{props.help.kicker}</p>
            <h2 id={titleId} className="confirm-title">
              {props.help.title}
            </h2>
            <ul id={bodyId} className="page-help-bullets">
              {props.help.bullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="confirm-actions">
              <button
                ref={closeRef}
                type="button"
                className="action"
                onClick={() => setOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
