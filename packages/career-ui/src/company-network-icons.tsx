/** Shared FBO / WH / HQ glyphs for Company network chips and map markers. */

export type CompanyNetworkIconKind = 'fbo' | 'wh' | 'hq';

/** Solid map-marker SVGs (fixed brand colors). */
export function companyNetworkIconSvg(kind: CompanyNetworkIconKind): string {
  if (kind === 'hq') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="10" fill="#6aa8d8"/>
  <path d="M12 5.8 13.95 11l5.55.35-4.25 3.55 1.35 5.35L12 17.35 7.4 20.25l1.35-5.35-4.25-3.55L10.05 11Z" fill="#0e141b"/>
</svg>`;
  }
  if (kind === 'fbo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M3.5 10.2 12 3.8l8.5 6.4V20.5H3.5V10.2Z" fill="#f0a35a"/>
  <rect x="8" y="13.4" width="3.2" height="7.1" rx="0.4" fill="#1a1208"/>
  <rect x="12.8" y="15.2" width="3.2" height="5.3" rx="0.4" fill="#1a1208"/>
  <circle cx="12" cy="8.2" r="1.35" fill="#1a1208"/>
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M2.8 10.6 12 3.9l9.2 6.7V20.6H2.8V10.6Z" fill="#5ec8c0"/>
  <rect x="8.1" y="13.1" width="7.8" height="7.5" rx="0.55" fill="#0e1a18"/>
  <path d="M8.1 16.4h7.8" stroke="#5ec8c0" stroke-width="1.2" stroke-linecap="round"/>
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
      >
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path
          d="M12 5.8 13.95 11l5.55.35-4.25 3.55 1.35 5.35L12 17.35 7.4 20.25l1.35-5.35-4.25-3.55L10.05 11Z"
          fill="#0e141b"
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
      >
        <path
          d="M3.5 10.2 12 3.8l8.5 6.4V20.5H3.5V10.2Z"
          fill="currentColor"
        />
        <rect
          x="8"
          y="13.4"
          width="3.2"
          height="7.1"
          rx="0.4"
          fill="#1a1208"
        />
        <rect
          x="12.8"
          y="15.2"
          width="3.2"
          height="5.3"
          rx="0.4"
          fill="#1a1208"
        />
        <circle cx="12" cy="8.2" r="1.35" fill="#1a1208" />
      </svg>
    );
  }
  return (
    <svg
      className="va-company-network-chip-icon va-company-network-chip-icon-wh"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.8 10.6 12 3.9l9.2 6.7V20.6H2.8V10.6Z"
        fill="currentColor"
      />
      <rect
        x="8.1"
        y="13.1"
        width="7.8"
        height="7.5"
        rx="0.55"
        fill="#0e1a18"
      />
      <path
        d="M8.1 16.4h7.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
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
