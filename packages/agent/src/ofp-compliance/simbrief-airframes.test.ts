import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferSimBriefAirframeMatchFromTitle,
  matchSimBriefAirframe,
  preferSimBriefAirframeMatch,
  resolveSimBriefDispatchType,
  resolveSimBriefMaxCargoKg,
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

describe('inferSimBriefAirframeMatchFromTitle', () => {
  it('anchors NextGen EMB-110 variants without collapsing P1F into P', () => {
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('NextGenSim EMB-110P1F Bandeirante'),
      'NextGen Simulations \\(MSFS\\) - EMB-110P1F$',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('NextGenSim EMB-110P2 Bandeirante'),
      'NextGen Simulations \\(MSFS\\) - EMB-110P2$',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('NextGenSim EMB-110P1 Bandeirante'),
      'NextGen Simulations \\(MSFS\\) - EMB-110P1$',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('NextGenSim EMB-110P Bandeirante'),
      'NextGen Simulations \\(MSFS\\) - EMB-110P$',
    );
  });
});

describe('preferSimBriefAirframeMatch', () => {
  it('prefers anchored pack match over Market Default', () => {
    assert.equal(
      preferSimBriefAirframeMatch({
        packMatch: 'NextGen Simulations \\(MSFS\\) - EMB-110P2$',
        catalogMatch: 'Default',
        classMatch: 'Default',
      }),
      'NextGen Simulations \\(MSFS\\) - EMB-110P2$',
    );
  });

  it('uses title inference when pack is Default', () => {
    assert.equal(
      preferSimBriefAirframeMatch({
        packMatch: 'Default',
        inferredFromTitle: 'NextGen Simulations \\(MSFS\\) - EMB-110P$',
        catalogMatch: 'Default',
      }),
      'NextGen Simulations \\(MSFS\\) - EMB-110P$',
    );
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

describe('airframeMaxCargoKg / resolveSimBriefMaxCargoKg', () => {
  it('converts maxcargo LBS to kg', async () => {
    const { maxCargoKg, source, airframe } = await resolveSimBriefMaxCargoKg({
      simbriefIcao: 'B738',
      simbriefAirframeMatch: 'Converted Freighter',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            B738: {
              airframes: [
                {
                  airframe_internal_id: '746599_bcf',
                  airframe_list_type: 'B738',
                  airframe_icao: 'B738',
                  airframe_comments: 'PMDG (MSFS) - Boeing Converted Freighter',
                  airframe_name: 'B737-800BCF',
                  airframe_passengers: 0,
                  airframe_options: {
                    wgtunits: 'LBS',
                    maxcargo: 39985,
                    oew: 87375,
                    mzfw: 138300,
                    mtow: 174900,
                    maxfuel: 46063,
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    });
    assert.equal(source, 'maxcargo');
    assert.equal(maxCargoKg, 18137);
    assert.equal(airframe.mtowKg, 79333);
    assert.equal(airframe.fuelCapacityKg, 20894);
  });

  it('falls back to mzfw-oew when maxcargo is 0', async () => {
    const { maxCargoKg, source } = await resolveSimBriefMaxCargoKg({
      simbriefIcao: 'MD1F',
      simbriefAirframeMatch: 'MD-11F PW',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            MD1F: {
              airframes: [
                {
                  airframe_internal_id: '81536_pw',
                  airframe_list_type: 'MD1F',
                  airframe_icao: 'MD1F',
                  airframe_comments: 'TFDi Design (MSFS) - MD-11F PW',
                  airframe_name: 'MD-11F',
                  airframe_passengers: 4,
                  airframe_options: {
                    wgtunits: 'KGS',
                    maxcargo: 0,
                    oew: 112748,
                    mzfw: 204706,
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    });
    assert.equal(source, 'mzfw-oew');
    assert.equal(maxCargoKg, 91958);
  });
});
