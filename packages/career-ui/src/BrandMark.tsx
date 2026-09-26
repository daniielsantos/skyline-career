/**
 * Brand lockup — compact sidebar mark or baked hero image.
 * Hero: Airframe PNG; compact: AIR|FRAME wordmark + geometric A mark.
 * `skyline-hero-lockup.png` / `md11f-mark.png` kept as archive.
 */

import airframeMarkUrl from './assets/brand/airframe-mark.png';
import airframeHeroLockupUrl from './assets/brand/airframe-hero-lockup.png';

type BrandMarkProps = {
  className?: string;
  /** Optional secondary line (e.g. "Career" on the compact mark). */
  subtitle?: string;
  /**
   * `compact` — A mark + AIRFRAME (sidebar).
   * `hero` — baked AIR · MD-11F · FRAME / CAREER (gates / login).
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
          src={airframeHeroLockupUrl}
          alt="Airframe Career"
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
      <span className="brand-mark-row" aria-label="Airframe">
        <img
          className="brand-mark-icon"
          src={airframeMarkUrl}
          alt=""
          width={40}
          height={40}
          decoding="async"
          draggable={false}
        />
        <span className="brand-mark-lockup" aria-hidden="true">
          <span className="brand-mark-word">
            <span className="brand-mark-sky">AIR</span>
            <span className="brand-mark-line">FRAME</span>
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
