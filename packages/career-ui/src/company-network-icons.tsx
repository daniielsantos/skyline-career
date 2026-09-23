/** Shared FBO / WH / HQ glyphs for Company network chips and map markers. */

export type CompanyNetworkIconKind = 'fbo' | 'wh' | 'hq';

export function companyNetworkIconSvg(kind: CompanyNetworkIconKind): string {
  if (kind === 'hq') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="9" fill="#6aa8d8" fill-opacity="0.22" stroke="#6aa8d8" stroke-width="1.6"/>
  <path d="M12 6.5 13.8 11.2 18.8 11.5 14.9 14.7 16.2 19.5 12 16.8 7.8 19.5 9.1 14.7 5.2 11.5 10.2 11.2Z" fill="#6aa8d8"/>
</svg>`;
  }
  if (kind === 'fbo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="3" y="10" width="18" height="10" rx="1.5" fill="#f0a35a" opacity="0.35"/>
  <path d="M4 10V7.5L12 3l8 4.5V10" fill="none" stroke="#f0a35a" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8 20v-5h3v5M13 20v-3.5h3V20" fill="none" stroke="#f0a35a" stroke-width="1.5"/>
  <circle cx="12" cy="8" r="1.2" fill="#f0a35a"/>
</svg>`;
  }
  // Warehouse: industrial shed + bay door (no rib/grid lines).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M3 10.5 12 4.5 21 10.5" fill="#5ec8c0" fill-opacity="0.22" stroke="#5ec8c0" stroke-width="1.6" stroke-linejoin="round"/>
  <rect x="4" y="10" width="16" height="10.5" rx="1.2" fill="#5ec8c0" fill-opacity="0.28" stroke="#5ec8c0" stroke-width="1.55"/>
  <rect x="8.25" y="13.25" width="7.5" height="7.25" rx="0.6" fill="none" stroke="#5ec8c0" stroke-width="1.45"/>
  <path d="M8.25 16.25h7.5" stroke="#5ec8c0" stroke-width="1.35" stroke-linecap="round"/>
  <path d="M3.5 20.75h17" stroke="#5ec8c0" stroke-width="1.55" stroke-linecap="round"/>
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
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M12 6.5 13.8 11.2 18.8 11.5 14.9 14.7 16.2 19.5 12 16.8 7.8 19.5 9.1 14.7 5.2 11.5 10.2 11.2Z"
          fill="currentColor"
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
        <rect
          x="3"
          y="10"
          width="18"
          height="10"
          rx="1.5"
          fill="currentColor"
          opacity="0.22"
        />
        <path
          d="M4 10V7.5L12 3l8 4.5V10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8 20v-5h3v5M13 20v-3.5h3V20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="8" r="1.2" fill="currentColor" />
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
        d="M3 10.5 12 4.5 21 10.5"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect
        x="4"
        y="10"
        width="16"
        height="10.5"
        rx="1.2"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.55"
      />
      <rect
        x="8.25"
        y="13.25"
        width="7.5"
        height="7.25"
        rx="0.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="M8.25 16.25h7.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M3.5 20.75h17"
        stroke="currentColor"
        strokeWidth="1.55"
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
