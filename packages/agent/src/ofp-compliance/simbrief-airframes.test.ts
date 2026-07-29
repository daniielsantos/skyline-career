import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchSimBriefAirframe,
  resolveSimBriefDispatchType,
  type SimBriefAirframe,
} from './simbrief-airframes.js';

const B738: SimBriefAirframe[] = [
  {
    internalId: 'B738',
    icao: 'B738',
    listType: 'B738',
    comments: 'Default',
    name: 'B737-800',
    passengers: 184,
  },
  {
    internalId: '746599_dual',
    icao: 'B738',
    listType: 'B738',
    comments: 'PMDG (MSFS) - Dual Class [credit: PMDG Official]',
    name: 'B737-800',
    passengers: 163,
  },
  {
    internalId: '746599_bcf',
    icao: 'B738',
    listType: 'B738',
    comments: 'PMDG (MSFS) - Boeing Converted Freighter [credit: PMDG Official]',
    name: 'B737-800',
    passengers: 0,
  },
];

const MD1F: SimBriefAirframe[] = [
  {
    internalId: '81536_ge',
    icao: 'MD1F',
    listType: 'MD1F',
    comments: 'TFDi Design (MSFS) - MD-11F GE',
    name: 'MD-11F',
    passengers: 4,
  },
  {
    internalId: '81536_pw',
    icao: 'MD1F',
    listType: 'MD1F',
    comments: 'TFDi Design (MSFS) - MD-11F PW',
    name: 'MD-11F',
    passengers: 4,
  },
  {
    internalId: '81536_erf_ge',
    icao: 'MD1F',
    listType: 'MD1F',
    comments: 'TFDi Design (MSFS) - MD-11ERF GE',
    name: 'MD-11F',
    passengers: 4,
  },
];

describe('matchSimBriefAirframe', () => {
  it('matches PMDG Dual Class', () => {
    const hit = matchSimBriefAirframe(B738, 'PMDG \\(MSFS\\) - Dual Class');
    assert.equal(hit?.internalId, '746599_dual');
  });

  it('disambiguates TFDi PW vs GE from title hint', () => {
    const pw = matchSimBriefAirframe(
      MD1F,
      'TFDi Design \\(MSFS\\) - MD-11F',
      'TFDi Design MD-11F PW4462',
    );
    assert.equal(pw?.internalId, '81536_pw');
    const ge = matchSimBriefAirframe(
      MD1F,
      'TFDi Design \\(MSFS\\) - MD-11F',
      'TFDi Design MD-11F GE',
    );
    assert.equal(ge?.internalId, '81536_ge');
  });
});

describe('resolveSimBriefDispatchType', () => {
  it('resolves Internal ID from mocked airframes.json', async () => {
    const { type, airframe } = await resolveSimBriefDispatchType({
      simbriefIcao: 'B738',
      simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Dual Class',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            B738: {
              airframes: B738.map((a) => ({
                airframe_internal_id: a.internalId,
                airframe_list_type: a.listType,
                airframe_icao: a.icao,
                airframe_comments: a.comments,
                airframe_name: a.name,
                airframe_passengers: a.passengers,
              })),
            },
          }),
          { status: 200 },
        ),
    });
    assert.equal(type, '746599_dual');
    assert.match(airframe.comments, /Dual Class/);
  });
});
