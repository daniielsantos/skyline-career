/**
 * Skyline brand lockup — compact sidebar mark or baked hero lockup image.
 */

import md11fMarkUrl from './assets/brand/md11f-mark.png';
import skylineHeroLockupUrl from './assets/brand/skyline-hero-lockup.png';

type BrandMarkProps = {
  className?: string;
  /** Optional secondary line (e.g. "Career" on the compact mark). */
  subtitle?: string;
  /**
   * `compact` — front mark + SKYLINE (sidebar).
   * `hero` — single lockup image: SKY · MD-11F · LINE / CAREER (profile gate).
   */
  variant?: 'compact' | 'hero';
};

export function BrandMark(props: BrandMarkProps) {
  const variant = props.variant ?? 'compact';
  const rootClass = ['brand-mark', `brand-mark-${variant}`, props.className]
    .filter(Boolean)
    .join(' ');

  if (variant === 'hero') {
    return (
      <span className={rootClass}>
        <img
          className="brand-mark-hero-lockup"
          src={skylineHeroLockupUrl}
          alt="Skyline Career"
          width={1400}
          height={700}
          decoding="async"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span className={rootClass}>
      <span className="brand-mark-row" aria-label="Skyline">
        <img
          className="brand-mark-icon"
          src={md11fMarkUrl}
          alt=""
          width={40}
          height={40}
          decoding="async"
          draggable={false}
        />
        <span className="brand-mark-lockup" aria-hidden="true">
          <span className="brand-mark-word">
            <span className="brand-mark-sky">SKY</span>
            <span className="brand-mark-line">LINE</span>
          </span>
          <svg
            className="brand-mark-horizon"
            viewBox="0 0 100 2"
            preserveAspectRatio="none"
          >
            <line
              x1="0"
              y1="1"
              x2="100"
              y2="1"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </span>
      </span>
      {props.subtitle ? (
        <span className="brand-mark-subtitle">{props.subtitle}</span>
      ) : null}
    </span>
  );
}
