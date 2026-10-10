import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatQnh,
  formatTailwind,
  formatWind,
  plannedRunway,
  stationFromAviationWeather,
  stationsFromAviationWeather,
  tailwindKt,
} from './metar-brief.ts';

const route = 'SBCT/33 DCT REPID DCT SBGR/09L';

describe('planned runway from the OFP route', () => {
  it('reads the runway suffix on the origin and destination tokens', () => {
    assert.equal(plannedRunway(route, 'SBCT', 'origin'), '33');
    assert.equal(plannedRunway(route, 'SBGR', 'dest'), '09L');
  });

  it('ignores a route that does not name that end', () => {
    assert.equal(plannedRunway('SBCT DCT SBGR', 'SBCT', 'origin'), null);
    assert.equal(plannedRunway(undefined, 'SBCT', 'dest'), null);
  });
});

describe('METAR line', () => {
  it('calls a tailwind and stays quiet on a headwind', () => {
    assert.equal(tailwindKt(360, 10, '18'), 10);
    assert.equal(tailwindKt(180, 10, '18'), null);
    assert.equal(tailwindKt(90, 8, '18'), null);
  });

  it('formats wind, QNH, and the tailwind phrase', () => {
    const station = {
      windDir: 210,
      windSpeedKt: 14,
      windGustKt: 22,
      qnhHpa: 1013.2,
      variable: false,
    };
    assert.equal(formatWind(station), '210° 14 kt, gust 22');
    assert.equal(formatQnh(station), '1013 hPa');
    assert.equal(
      formatTailwind({ ...station, windDir: 360, windSpeedKt: 10, windGustKt: 16 }, '18'),
      'Tailwind 10 kt, gust 16 kt on 18',
    );
    assert.equal(formatWind({ ...station, windSpeedKt: 0, windGustKt: null }), 'Calm');
  });

  it('does not invent a tailwind from variable wind', () => {
    const station = {
      windDir: null,
      windSpeedKt: 6,
      windGustKt: null,
      qnhHpa: 1016,
      variable: true,
    };
    assert.equal(formatWind(station), 'Variable 6 kt');
    assert.equal(formatTailwind(station, '27'), null);
  });

  it('keeps the aviation weather fields the line uses', () => {
    const stations = stationsFromAviationWeather([
      { icaoId: 'sbgr', wdir: 270, wspd: 10, altim: 1019 },
      { icaoId: 'KJFK', wdir: 'VRB', wspd: 4, wgst: 9, altim: 1031.6 },
      { icaoId: 'NOPE' },
    ]);
    assert.deepEqual(stations.SBGR, {
      windDir: 270,
      windSpeedKt: 10,
      windGustKt: null,
      qnhHpa: 1019,
      variable: false,
    });
    assert.equal(stations.KJFK?.variable, true);
    assert.equal(stations.KJFK?.windGustKt, 9);
    assert.equal(stationFromAviationWeather({ icaoId: 'X' }), null);
  });
});
