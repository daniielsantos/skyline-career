/** Shared FBO / WH glyphs for Company network chips and map markers. */

export function companyNetworkIconSvg(kind: 'fbo' | 'wh'): string {
  if (kind === 'fbo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="3" y="10" width="18" height="10" rx="1.5" fill="#f0a35a" opacity="0.35"/>
  <path d="M4 10V7.5L12 3l8 4.5V10" fill="none" stroke="#f0a35a" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8 20v-5h3v5M13 20v-3.5h3V20" fill="none" stroke="#f0a35a" stroke-width="1.5"/>
  <circle cx="12" cy="8" r="1.2" fill="#f0a35a"/>
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="3.5" y="6" width="17" height="13" rx="1.5" fill="#5ec8c0" opacity="0.28"/>
  <path d="M3.5 10.5h17M12 6v13M7.5 6v13M16.5 6v13" fill="none" stroke="#5ec8c0" stroke-width="1.5"/>
  <path d="M5 19.5h14" fill="none" stroke="#5ec8c0" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
}

export function NetworkChipIcon(props: { kind: 'fbo' | 'wh' }) {
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
      <rect
        x="3.5"
        y="6"
        width="17"
        height="13"
        rx="1.5"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M3.5 10.5h17M12 6v13M7.5 6v13M16.5 6v13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 19.5h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function companyNetworkMarkerElement(
  kind: 'fbo' | 'wh',
  selected: boolean,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `va-company-network-map-marker is-${kind}${
    selected ? ' is-selected' : ''
  }`;
  const size = kind === 'fbo' ? (selected ? 40 : 36) : selected ? 36 : 32;
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
