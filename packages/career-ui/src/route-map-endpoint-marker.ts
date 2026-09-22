/**
 * Lightweight OD endpoint labels for desk/bridge routes on network maps.
 * Reuses `.dispatch-route-marker*` styles; non-interactive so WH/port pins stay clickable.
 */
export function routeEndpointMarkerEl(
  icao: string,
  kind: 'dep' | 'arr',
): HTMLDivElement {
  const el = document.createElement('div');
  const code = icao.trim().toUpperCase() || '—';
  const label = kind === 'dep' ? 'DEP' : 'ARR';
  el.className = `dispatch-route-marker dispatch-route-marker-${kind}`;
  el.style.pointerEvents = 'none';
  el.title = `${label} ${code}`;
  el.setAttribute('aria-label', `${label} ${code}`);
  el.innerHTML = `<span class="dispatch-route-marker-icao">${code}</span><span class="dispatch-route-marker-kind">${label}</span>`;
  return el;
}
