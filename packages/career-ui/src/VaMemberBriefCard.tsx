import { useEffect, useState } from 'react';

const STORAGE_KEY = 'airframe.vaMemberBrief.v1';

export type VaMemberBriefStep = {
  kicker: string;
  title: string;
  body: string;
};

/** One idea per slide — first-join mental model for VA members. */
export const VA_MEMBER_BRIEF_STEPS: readonly VaMemberBriefStep[] = [
  {
    kicker: 'Wallets',
    title: 'Topbar is home. Ledger is the airline.',
    body: 'Topbar Wallet is your personal company cash. My VA Ledger is shared airline money. Cuts land in home; Jet-A and MX on company tails hit the Ledger.',
  },
  {
    kicker: 'Cuts',
    title: 'Mkt % vs Desk % — both pay home.',
    body: 'Mkt % = Freights or Charter on an airline tail. Desk % = Demand or Wide haul from the company desk. Your cut of the net goes to home; the rest stays with the airline.',
  },
  {
    kicker: 'Progression',
    title: 'Cargo Ops and hours stay on home.',
    body: 'Cargo Ops, lease Dry cleans, Class Ops, and pilot hours write to your home company — even when you fly airline tails. Hangar progression is yours.',
  },
  {
    kicker: 'Jobs',
    title: 'Hauls move stock. Freights are market hire.',
    body: 'Hauls / Ports desk moves company cargo (Open desk holds). Freights board is market hire. Both can stamp a cut to home when you fly for the airline.',
  },
] as const;

/**
 * First-join mental model for VA members (not a full tutorial).
 * Dismiss persists in localStorage.
 */
export function VaMemberBriefCard(props: {
  /** Show only for pilot/dispatcher on a listed VA (not owner). */
  visible: boolean;
}) {
  const [dismissed, setDismissed] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (props.visible && !dismissed) setStepIndex(0);
  }, [props.visible, dismissed]);

  if (!props.visible || dismissed) return null;

  const steps = VA_MEMBER_BRIEF_STEPS;
  const step = steps[stepIndex] ?? steps[0]!;
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <aside className="va-member-brief" aria-label="Airline desk basics">
      <div className="va-member-brief-head">
        <p className="va-member-brief-kicker">{step.kicker}</p>
        <button
          type="button"
          className="action ghost va-member-brief-dismiss"
          aria-label="Dismiss brief"
          onClick={dismiss}
        >
          ×
        </button>
      </div>

      <h3 className="va-member-brief-title">{step.title}</h3>
      <p className="va-member-brief-body">{step.body}</p>

      <div className="va-member-brief-nav">
        <div
          className="va-member-brief-dots"
          role="tablist"
          aria-label="Brief steps"
        >
          {steps.map((s, i) => (
            <button
              key={s.kicker}
              type="button"
              role="tab"
              aria-selected={i === stepIndex}
              aria-label={`Step ${i + 1}: ${s.kicker}`}
              className={
                i === stepIndex
                  ? 'va-member-brief-dot is-active'
                  : 'va-member-brief-dot'
              }
              onClick={() => setStepIndex(i)}
            />
          ))}
        </div>

        <div className="va-member-brief-actions">
          {!isFirst ? (
            <button
              type="button"
              className="action ghost"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
          ) : null}
          {isLast ? (
            <button type="button" className="accept" onClick={dismiss}>
              Got it
            </button>
          ) : (
            <button
              type="button"
              className="accept"
              onClick={() =>
                setStepIndex((i) => Math.min(steps.length - 1, i + 1))
              }
            >
              Next
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
