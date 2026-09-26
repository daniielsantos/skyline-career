/**
 * Brand lockup — compact sidebar wordmark or baked hero image.
 * Compact: CSS AIR|FRAME (no abstract glyph — reads at a glance).
 * Hero: Airframe PNG for gates / login.
 * Archives: `airframe-sidebar-lockup.png`, `airframe-mark.png`, `md11f-mark.png`.
 */

import airframeHeroLockupUrl from './assets/brand/airframe-hero-lockup.png';

type BrandMarkProps = {
  className?: string;
  /** Optional secondary line under the compact lockup. */
  subtitle?: string;
  /**
   * `compact` — AIR|FRAME wordmark (sidebar / compact chrome).
   * `hero` — baked AIR · … · FRAME / CAREER (gates / login).
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
      <span className="brand-mark-lockup" aria-label="Airframe">
        <span className="brand-mark-word">
          <span className="brand-mark-sky">AIR</span>
          <span className="brand-mark-line">FRAME</span>
        </span>
      </span>
      {props.subtitle ? (
        <span className="brand-mark-subtitle">{props.subtitle}</span>
      ) : null}
    </span>
  );
}
