import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAREER_PLAYER_AIRFRAMES,
  careerPlayerAirframePackPaths,
  defaultCareerPlayerAirframe,
  findCareerPlayerAirframe,
  isCareerPlayerAirframeEnabled,
  listCareerPlayerAirframes,
  listStarterCareerPlayerAirframes,
  resolveAirframeCruiseFuelFlowKgPerHour,
  resolveAirframeCruiseSpeedKt,
  resolveAirframeMaxRangeNm,
} from './career-player-airframes.js';

describe('career player airframes', () => {
  it('makes every current homologated pack available to the player market', () => {
    const ids = new Set(CAREER_PLAYER_AIRFRAMES.map((airframe) => airframe.typeId));
    for (const expected of [
      'asobo-c172sp-cargo',
      'blacksquare-commander-114',
      'blacksquare-bonanza-professional',
      'c208-caravan-cargo',
      'pmdg-738-bcf-family',
      'pmdg-738-pax-family',
      'tfdi-md11f-family',
      'toliss-a346-family',
    ]) {
      assert.ok(ids.has(expected), `${expected} missing from player catalog`);
    }
    assert.equal(ids.has('blacksquare-commander-114tc'), false);
    assert.equal(ids.has('asobo-c208b-cargo'), false);
  });

  it('treats omitted enabled as market-eligible', () => {
    assert.equal(isCareerPlayerAirframeEnabled({}), true);
    assert.equal(isCareerPlayerAirframeEnabled({ enabled: true }), true);
    assert.equal(isCareerPlayerAirframeEnabled({ enabled: false }), false);
    assert.equal(isCareerPlayerAirframeEnabled(undefined), false);
  });

  it('aliases legacy glass and vendor variants to family Market SKUs', () => {
    assert.equal(
      findCareerPlayerAirframe('asobo-c172sp-classic-cargo')?.typeId,
      'asobo-c172sp-cargo',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-commander-114tc')?.typeId,
      'blacksquare-commander-114',
    );
    assert.equal(
      findCareerPlayerAirframe('asobo-c208b-cargo')?.typeId,
      'c208-caravan-cargo',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-caravan-cargo-pod')?.label,
      'Cessna 208 Caravan Cargo',
    );
  });

  it('lists both Caravan OFP packs on the shared Market SKU', () => {
    const caravan = findCareerPlayerAirframe('c208-caravan-cargo');
    assert.ok(caravan);
    const paths = careerPlayerAirframePackPaths(caravan!);
    assert.ok(paths.some((p) => p.includes('asobo-c208b-cargo')));
    assert.ok(paths.some((p) => p.includes('blacksquare-caravan-cargo-pod')));
  });

  it('offers only C152, C172, and Commander 114 as starter choices', () => {
    const starters = listStarterCareerPlayerAirframes();
    assert.deepEqual(
      starters.map((row) => row.typeId),
      [
        'asobo-cessna-c152',
        'asobo-c172sp-cargo',
        'blacksquare-commander-114',
      ],
    );
    assert.ok(starters.every((row) => row.aircraftClassId === 'light_ga'));
  });

  it('keeps concrete variants under their economic class', () => {
    const ga = listCareerPlayerAirframes('light_ga');
    assert.ok(ga.some((airframe) => airframe.typeId === 'asobo-c172sp-cargo'));
    assert.ok(ga.some((airframe) => airframe.typeId === 'asobo-cessna-c152'));
    assert.ok(ga.some((airframe) => airframe.typeId === 'blacksquare-commander-114'));
    assert.ok(ga.some((airframe) => airframe.simbriefIcao === 'BE36'));
    assert.equal(
      findCareerPlayerAirframe('blacksquare-commander-114')?.simbriefIcao,
      'C182',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-commander-114')?.maxCargoKg,
      320,
    );
    assert.equal(
      findCareerPlayerAirframe('asobo-cessna-c152')?.simbriefIcao,
      'C172',
    );
    const turboprops = listCareerPlayerAirframes('light_turboprop');
    assert.ok(turboprops.some((a) => a.typeId === 'c208-caravan-cargo'));
    assert.ok(turboprops.length >= 1);
  });

  it('uses the old representative model for legacy saves', () => {
    assert.equal(
      defaultCareerPlayerAirframe('light_ga')?.typeId,
      'blacksquare-bonanza-professional',
    );
    assert.equal(
      defaultCareerPlayerAirframe('light_turboprop')?.typeId,
      'c208-caravan-cargo',
    );
    assert.equal(
      findCareerPlayerAirframe('asobo-c172sp-cargo')?.label,
      'Cessna 172SP',
    );
    assert.equal(
      findCareerPlayerAirframe('asobo-c172sp-classic-passengers')?.typeId,
      'asobo-c172sp-cargo',
    );
  });

  it('exposes per-airframe range and burn for starters', () => {
    const commander = findCareerPlayerAirframe('blacksquare-commander-114');
    assert.equal(commander?.maxRangeNm, 800);
    assert.equal(
      resolveAirframeMaxRangeNm('blacksquare-commander-114', 'light_ga'),
      800,
    );
    assert.ok(
      (resolveAirframeCruiseFuelFlowKgPerHour('blacksquare-commander-114') ?? 0) >
        20,
    );
    assert.equal(resolveAirframeMaxRangeNm('missing-type', 'light_ga'), 800);
    assert.equal(resolveAirframeCruiseSpeedKt('carenado-404-titan-cargo'), 181);
  });
});

