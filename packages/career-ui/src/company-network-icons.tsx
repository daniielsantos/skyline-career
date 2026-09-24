/** Shared FBO / WH / HQ glyphs for Company network chips and map markers. */

export type CompanyNetworkIconKind = 'fbo' | 'wh' | 'hq';

const STROKE = {
  width: 1.45,
  join: 'round' as const,
  cap: 'round' as const,
};

/**
 * Map-marker SVGs (fixed brand colors). Outline + soft fill — ops diagram,
 * not solid app tiles. FBO = pier shed + yard crane; WH = hangar + dock bay.
 */
export function companyNetworkIconSvg(kind: CompanyNetworkIconKind): string {
  if (kind === 'hq') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="9.15" fill="#6aa8d8" fill-opacity="0.16" stroke="#6aa8d8" stroke-width="1.5"/>
  <path d="M12 5.9 13.85 11l5.35.32-4.1 3.4 1.3 5.15L12 17.2 7.6 19.87l1.3-5.15-4.1-3.4L10.15 11Z" fill="none" stroke="#6aa8d8" stroke-width="1.35" stroke-linejoin="round"/>
</svg>`;
  }
  if (kind === 'fbo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M3.6 20.6h16.8" stroke="#f0a35a" stroke-width="1.35" stroke-linecap="round" opacity="0.5"/>
  <path d="M4.6 20.6V17.9h5.4V20.6" fill="none" stroke="#f0a35a" stroke-width="1.35" stroke-linejoin="round"/>
  <path d="M9.4 17.9V11.1L14.6 7.5 19.8 11.1V17.9Z" fill="#f0a35a" fill-opacity="0.15" stroke="#f0a35a" stroke-width="1.45" stroke-linejoin="round"/>
  <path d="M12.7 17.9v-3.9h3.1v3.9" fill="none" stroke="#f0a35a" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M6.1 17.9V6.2" stroke="#f0a35a" stroke-width="1.45" stroke-linecap="round"/>
  <path d="M6.1 6.55h7.4" stroke="#f0a35a" stroke-width="1.45" stroke-linecap="round"/>
  <path d="M13.5 6.55v2.15" stroke="#f0a35a" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M3.4 19.9V10.5L12 4.7l8.6 5.8v9.4Z" fill="#5ec8c0" fill-opacity="0.15" stroke="#5ec8c0" stroke-width="1.45" stroke-linejoin="round"/>
  <path d="M8 19.9V13.2h8v6.7" fill="none" stroke="#5ec8c0" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M8 16.55h8" stroke="#5ec8c0" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
  <path d="M12 4.7v2.9" stroke="#5ec8c0" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/>
</svg>`;
}

export function NetworkChipIcon(props: { kind: CompanyNetworkIconKind }) {
  if (props.kind === 'hq') {
    return (
      <svg
        className="va-company-network-chip-icon va-company-network-chip-icon-hq"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="9.15"
          fill="currentColor"
          fillOpacity={0.16}
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <path
          d="M12 5.9 13.85 11l5.35.32-4.1 3.4 1.3 5.15L12 17.2 7.6 19.87l1.3-5.15-4.1-3.4L10.15 11Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.35}
          strokeLinejoin={STROKE.join}
        />
      </svg>
    );
  }
  if (props.kind === 'fbo') {
    return (
      <svg
        className="va-company-network-chip-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
      >
        <path
          d="M3.6 20.6h16.8"
          stroke="currentColor"
          strokeWidth={1.35}
          strokeLinecap={STROKE.cap}
          opacity={0.5}
        />
        <path
          d="M4.6 20.6V17.9h5.4V20.6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.35}
          strokeLinejoin={STROKE.join}
        />
        <path
          d="M9.4 17.9V11.1L14.6 7.5 19.8 11.1V17.9Z"
          fill="currentColor"
          fillOpacity={0.15}
          stroke="currentColor"
          strokeWidth={STROKE.width}
          strokeLinejoin={STROKE.join}
        />
        <path
          d="M12.7 17.9v-3.9h3.1v3.9"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinejoin={STROKE.join}
        />
        <path
          d="M6.1 17.9V6.2"
          stroke="currentColor"
          strokeWidth={STROKE.width}
          strokeLinecap={STROKE.cap}
        />
        <path
          d="M6.1 6.55h7.4"
          stroke="currentColor"
          strokeWidth={STROKE.width}
          strokeLinecap={STROKE.cap}
        />
        <path
          d="M13.5 6.55v2.15"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap={STROKE.cap}
          opacity={0.85}
        />
      </svg>
    );
  }
  return (
    <svg
      className="va-company-network-chip-icon va-company-network-chip-icon-wh"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M3.4 19.9V10.5L12 4.7l8.6 5.8v9.4Z"
        fill="currentColor"
        fillOpacity={0.15}
        stroke="currentColor"
        strokeWidth={STROKE.width}
        strokeLinejoin={STROKE.join}
      />
      <path
        d="M8 19.9V13.2h8v6.7"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin={STROKE.join}
      />
      <path
        d="M8 16.55h8"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap={STROKE.cap}
        opacity={0.75}
      />
      <path
        d="M12 4.7v2.9"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap={STROKE.cap}
        opacity={0.55}
      />
    </svg>
  );
}

export function companyNetworkMarkerElement(
  kind: CompanyNetworkIconKind,
  selected: boolean,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `va-company-network-map-marker is-${kind}${
    selected ? ' is-selected' : ''
  }`;
  const size =
    kind === 'fbo' || kind === 'hq'
      ? selected
        ? 40
        : 36
      : selected
        ? 36
        : 32;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  const img = document.createElement('img');
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    companyNetworkIconSvg(kind),
  )}`;
  img.alt = '';
  img.draggable = false;
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.pointerEvents = 'none';
  el.appendChild(img);
  return el;
}
