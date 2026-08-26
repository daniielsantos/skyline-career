import { useId, useState } from 'react';

const REASON_CLAMP = 120;

export function StagingLotReason(props: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trimmed = props.text.trim();
  if (!trimmed) return null;

  const long = trimmed.length > REASON_CLAMP;
  if (!long) {
    return <p className="staging-lot-reason">{trimmed}</p>;
  }

  return (
    <div className="staging-lot-reason-wrap">
      <p id={id} className={`staging-lot-reason${open ? ' is-open' : ''}`}>
        {open ? trimmed : `${trimmed.slice(0, REASON_CLAMP).trim()}…`}
      </p>
      <button
        type="button"
        className="linkish staging-lot-reason-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Less' : 'More'}
      </button>
    </div>
  );
}
