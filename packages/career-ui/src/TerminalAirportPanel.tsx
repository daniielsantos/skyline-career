import type { AirportView, CareerRunway, CareerRunwaySurface } from './api';
import { AirportSatelliteMap } from './AirportSatelliteMap';
import { BusyBlock } from './Busy';

function hubTierLabel(tier: NonNullable<AirportView['airport']['hubTier']>): string {
  switch (tier) {
    case 'major':
      return 'Major';
    case 'regional':
      return 'Regional';
    default:
      return 'Spoke';
  }
}

function fieldKind(airport: AirportView['airport']): string {
  if (airport.bushTripOnly) return 'Trip-only strip';
  if (airport.bush) return 'Bush soft-field';
  return 'Cargo terminal';
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function formatHeadingDeg(deg: number): string {
  const n = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(n).padStart(3, '0')}°`;
}

function padRunwayIdent(ident: string): string {
  const m = ident.trim().match(/^(\d{1,2})([LRC]?)$/i);
  if (!m) return ident.trim();
  const num = m[1]!.padStart(2, '0');
  const side = m[2] ? m[2].toUpperCase() : '';
  return `${num}${side}`;
}

function formatRunwayPair(runway: CareerRunway): string {
  const primary = padRunwayIdent(runway.ident);
  if (!runway.identReciprocal) return primary;
  return `${primary} / ${padRunwayIdent(runway.identReciprocal)}`;
}

function formatHeadingPair(runway: CareerRunway): string {
  const primary = formatHeadingDeg(runway.headingTrueDeg);
  if (!runway.identReciprocal) return primary;
  return `${primary} / ${formatHeadingDeg(runway.headingTrueDeg + 180)}`;
}

function formatMeters(m: number, withFeet = true): string {
  if (!Number.isFinite(m) || m <= 0) return '—';
  const meters = `${Math.round(m).toLocaleString('en-US')} m`;
  if (!withFeet) return meters;
  const ft = Math.round(m * 3.28084);
  return `${meters} (${ft.toLocaleString('en-US')} ft)`;
}

function surfaceLabel(surface: CareerRunwaySurface | undefined): string {
  if (!surface) return '—';
  return surface.charAt(0).toUpperCase() + surface.slice(1);
}

function PlateRow(props: { label: string; value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

export function TerminalAirportPanel(props: {
  airport: AirportView['airport'];
  hubLevel?: AirportView['hubLevel'];
  runways: CareerRunway[];
  homeHubIcao?: string | null;
  hydrating?: boolean;
  regionDisplay: string;
}) {
  const { airport, hubLevel, runways, homeHubIcao, hydrating, regionDisplay } = props;
  const isHome =
    Boolean(homeHubIcao) &&
    homeHubIcao!.trim().toUpperCase() === airport.icao.trim().toUpperCase();
  const hasCoords =
    typeof airport.lat === 'number' &&
    Number.isFinite(airport.lat) &&
    typeof airport.lon === 'number' &&
    Number.isFinite(airport.lon) &&
    !(airport.lat === 0 && airport.lon === 0);
  const levelBits = hubLevel
    ? [
        hubLevel.xpForNext != null
          ? `${hubLevel.progressPct}% to ${hubLevel.level + 1}`
          : 'Max level',
        `cap ×${hubLevel.capacityMult.toFixed(2)}`,
        `flow ×${hubLevel.flowMult.toFixed(2)}`,
        hubLevel.laneBonus > 0 ? `+${hubLevel.laneBonus} lane lots` : null,
        hubLevel.originPayMult > 1
          ? `origin pay ×${hubLevel.originPayMult.toFixed(2)}`
          : null,
        hubLevel.quiet ? 'quiet' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <>
      <div className="panel-head">
        <div>
          <h2>
            Field plate
            {isHome ? <span className="tag">Home hub</span> : null}
          </h2>
          <p>Published identity and runways for this hub.</p>
        </div>
      </div>

      <dl className="airport-plate">
        <PlateRow label="Region" value={regionDisplay || airport.region || '—'} />
        <PlateRow
          label="Coordinates"
          value={hasCoords ? formatLatLon(airport.lat!, airport.lon!) : '—'}
        />
        <PlateRow
          label="Hub"
          value={airport.hubTier ? hubTierLabel(airport.hubTier) : 'Spoke'}
        />
        <PlateRow label="Field" value={fieldKind(airport)} />
        <PlateRow
          label="Terminal"
          value={
            levelBits
              ? `Level ${airport.level} · ${levelBits}`
              : `Level ${airport.level}`
          }
        />
      </dl>

      <div className={hasCoords ? 'airport-field-split' : undefined}>
        {hasCoords ? (
          <AirportSatelliteMap
            icao={airport.icao}
            name={airport.name}
            lat={airport.lat!}
            lon={airport.lon!}
            runways={runways}
          />
        ) : null}

        <div className="airport-runways">
          <h3>Runways</h3>
          {hydrating && runways.length === 0 ? (
            <BusyBlock label="Loading runway plate" />
          ) : runways.length === 0 ? (
            <p className="muted">No runway data on file for this hub.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Runway</th>
                    <th>Heading</th>
                    <th>Length</th>
                    <th>Width</th>
                    <th>Surface</th>
                    <th>Lights</th>
                  </tr>
                </thead>
                <tbody>
                  {runways.map((runway, idx) => (
                    <tr key={`${runway.ident}-${runway.identReciprocal ?? idx}`}>
                      <td>{formatRunwayPair(runway)}</td>
                      <td>{formatHeadingPair(runway)}</td>
                      <td>{formatMeters(runway.lengthM)}</td>
                      <td>{formatMeters(runway.widthM, false)}</td>
                      <td>{surfaceLabel(runway.surface)}</td>
                      <td>{runway.lighted ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
