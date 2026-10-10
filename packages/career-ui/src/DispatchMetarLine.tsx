import { useEffect, useState } from 'react';
import { fetchMetar, type MetarStation } from './api';
import { formatQnh, formatTailwind, formatWind, plannedRunway } from './metar-brief';

export function DispatchMetarLine(props: {
  originIcao: string;
  destIcao: string;
  route?: string;
  enRoute: boolean;
}) {
  const origin = props.originIcao.trim().toUpperCase();
  const dest = props.destIcao.trim().toUpperCase();
  const [stations, setStations] = useState<Record<string, MetarStation>>({});

  useEffect(() => {
    const ids = props.enRoute ? [dest] : [origin, dest];
    let cancel = false;
    async function load() {
      try {
        const result = await fetchMetar(ids);
        if (!cancel) setStations(result.stations ?? {});
      } catch {
        if (!cancel) setStations({});
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [origin, dest, props.enRoute]);

  const chips = (props.enRoute ? [dest] : [origin, dest]).flatMap((icao) => {
    const station = stations[icao];
    if (!station) return [];
    const wind = formatWind(station);
    const qnh = formatQnh(station);
    if (!wind && !qnh) return [];
    const runway = plannedRunway(
      props.route,
      icao,
      icao === origin ? 'origin' : 'dest',
    );
    const tailwind = icao === dest ? formatTailwind(station, runway) : null;
    const facts = [wind, qnh].filter(Boolean).join(' · ');
    return [{ icao, facts, tailwind }];
  });

  if (!chips.length) return null;

  return (
    <p className="dispatch-metar">
      {chips.map((chip) => (
        <span key={chip.icao}>
          <span className="dispatch-metar-icao">{chip.icao}</span> {chip.facts}
          {chip.tailwind ? (
            <span className="dispatch-metar-tail"> · {chip.tailwind}</span>
          ) : null}
        </span>
      ))}
    </p>
  );
}
