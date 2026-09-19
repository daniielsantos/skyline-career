import { Fragment } from 'react';
import { IcaoLink } from './IcaoLink';
import { splitTourRouteStops } from './tour-route-format';

export { formatTourPaxByLeg, splitTourRouteStops } from './tour-route-format';

type TourRouteLabelProps = {
  routeLabel: string;
  onOpenAirport?: (icao: string) => void;
  busy?: boolean;
  className?: string;
};

/**
 * Multi-stop tour route for Base Dispatcher tables — ICAO chips with arrows,
 * matching Market Freights/Charter boards (not a flat monochrome string).
 */
export function TourRouteLabel(props: TourRouteLabelProps) {
  const stops = splitTourRouteStops(props.routeLabel);
  if (stops.length === 0) {
    return <span className={props.className ?? 'route'}>—</span>;
  }
  return (
    <div className={props.className ?? 'route'}>
      {stops.map((icao, i) => (
        <Fragment key={`${icao}-${i}`}>
          {i > 0 ? <span className="arrow">→</span> : null}
          {props.onOpenAirport ? (
            <IcaoLink
              icao={icao}
              onOpen={props.onOpenAirport}
              disabled={props.busy}
            />
          ) : (
            <strong className="icao">{icao}</strong>
          )}
        </Fragment>
      ))}
    </div>
  );
}
