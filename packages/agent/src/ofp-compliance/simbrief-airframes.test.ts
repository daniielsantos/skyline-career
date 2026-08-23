import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  airframeMaxCargoKg,
  fallbackSimBriefAirframeForDefault,
  inferSimBriefAirframeMatchFromTitle,
  liveTitleMatchesMarketSku,
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

  it('matches Microsoft ATR 72 HighLine without taking Economy', () => {
    const atr72: SimBriefAirframe[] = [
      {
        internalId: 'AT76',
        icao: 'AT76',
        listType: 'AT76',
        comments: 'Default',
        name: 'ATR 72-600',
        passengers: 70,
      },
      {
        internalId: 'awemeter_econ',
        icao: 'AT76',
        listType: 'AT76',
        comments: 'Microsoft (MSFS) - ATR 72 - Economy [credit: Awemeter]',
        name: 'ATR 72-600',
        passengers: 70,
      },
      {
        internalId: 'awemeter_hl',
        icao: 'AT76',
        listType: 'AT76',
        comments: 'Microsoft (MSFS) - ATR 72 - HighLine [credit: Awemeter]',
        name: 'ATR 72-600',
        passengers: 70,
      },
    ];
    assert.equal(
      matchSimBriefAirframe(
        atr72,
        'Microsoft \\(MSFS\\) - ATR 72 - HighLine',
      )?.internalId,
      'awemeter_hl',
    );
  });

  it('matches Microsoft ATR 42 HighLine without taking Economy', () => {
    const atr42: SimBriefAirframe[] = [
      {
        internalId: 'AT46',
        icao: 'AT46',
        listType: 'AT46',
        comments: 'Default',
        name: 'ATR 42-600',
        passengers: 48,
      },
      {
        internalId: 'awemeter_econ42',
        icao: 'AT46',
        listType: 'AT46',
        comments: 'Microsoft (MSFS) - ATR 42 - Economy [credit: Awemeter]',
        name: 'ATR 42-600',
        passengers: 48,
      },
      {
        internalId: 'awemeter_hl42',
        icao: 'AT46',
        listType: 'AT46',
        comments: 'Microsoft (MSFS) - ATR 42 - HighLine [credit: Awemeter]',
        name: 'ATR 42-600',
        passengers: 48,
      },
    ];
    assert.equal(
      matchSimBriefAirframe(
        atr42,
        'Microsoft \\(MSFS\\) - ATR 42 - HighLine',
      )?.internalId,
      'awemeter_hl42',
    );
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

  it('maps Just Flight F100 MSFS door/cargo titles onto SimBrief comments', () => {
    assert.equal(
      inferSimBriefAirframeMatchFromTitle(
        'Just Flight F100 | Integral Airstairs | Small Cargo Door | L2 Door | Just Flight',
      ),
      'Just Flight \\(MSFS\\) - 98 Pax, L2 Door, Integral Stairs, Small Cargo',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle(
        'Just Flight F100 | Integral Airstairs | Large Cargo Door | Just Flight',
      ),
      'Just Flight \\(MSFS\\) - 100 Pax, Integral Stairs, Large Cargo',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle(
        'Just Flight F100 | Sliding Door | Large Cargo Door | Just Flight',
      ),
      'Just Flight \\(MSFS\\) - 100 Pax, Sliding Door, Large Cargo',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle(
        'Just Flight F100 | Integral Airstairs | Small Cargo Door | Just Flight',
      ),
      'Just Flight \\(MSFS\\) - 100 Pax, Integral Stairs, Small Cargo',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('Just Flight F100 | Just Flight'),
      undefined,
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('Just Flight F70 | Just Flight'),
      'Just Flight \\(MSFS\\) - 70 Passengers',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('Just Flight Fokker F28-4000 Air21'),
      'Just Flight \\(MSFS\\) - Fokker F28 Mk.4000',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('Fly The Maddog X MD-82 20th'),
      'Leonardo Maddog \\(MSFS\\) - Y162 Config',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('Fly The Maddog X MD-88 20th'),
      'Leonardo Maddog \\(MSFS\\) - Y162 Config',
    );
    assert.equal(
      liveTitleMatchesMarketSku(
        'Fly The Maddog X MD-88 20th',
        'leonardo-fly-the-maddog-x-md-88-20th',
      ),
      true,
    );
    assert.equal(
      liveTitleMatchesMarketSku(
        'Fly The Maddog X MD-82 20th',
        'leonardo-fly-the-maddog-x-md-82-20th',
      ),
      true,
    );
    assert.equal(
      liveTitleMatchesMarketSku(
        'Fly The Maddog X MD-83 20th',
        'leonardo-fly-the-maddog-x-md-83-20th',
      ),
      true,
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('Microsoft A321LR'),
      'iniBuilds \\(MSFS\\) - A321LR LEAP-1A',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('A321'),
      'iniBuilds \\(MSFS\\) - A321LR LEAP-1A',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('FenixA321 IAE WF TC'),
      'Fenix Simulations \\(MSFS\\) - A321 IAE$',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('FenixA321 CFM SL SC'),
      'Fenix Simulations \\(MSFS\\) - A321 CFM \\(SL\\)',
    );
    assert.equal(liveTitleMatchesMarketSku('A321', 'microsoft-a321lr'), true);
    assert.equal(
      liveTitleMatchesMarketSku('FenixA321 IAE WF TC', 'microsoft-a321lr'),
      false,
    );
    assert.equal(
      liveTitleMatchesMarketSku('FenixA321 IAE WF TC', 'fenix-a321'),
      true,
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('FenixA320 CFM SL'),
      'Fenix Simulations \\(MSFS\\) - A320 CFM \\(SL\\)',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('FenixA320 IAE WF'),
      'Fenix Simulations \\(MSFS\\) - A320 IAE$',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('FenixA319 CFM SL HD'),
      'Fenix Simulations \\(MSFS\\) - A319 CFM \\(SL\\)',
    );
    assert.equal(
      inferSimBriefAirframeMatchFromTitle('FenixA319 IAE WF SD'),
      'Fenix Simulations \\(MSFS\\) - A319 IAE$',
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

  it('falls back from Default when ICAO only has a vendor MSFS airframe', async () => {
    const { type, airframe } = await resolveSimBriefDispatchType({
      simbriefIcao: 'C408',
      simbriefAirframeMatch: 'Default',
      titleHint: 'C408 SkyCourier Passenger',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            C408: {
              airframes: [
                {
                  airframe_internal_id: '3_1736658831347',
                  airframe_list_type: 'C408',
                  airframe_icao: 'C408',
                  airframe_comments:
                    'Carenado (MSFS) - Cessna 408 SkyCourier',
                  airframe_name: 'Cessna 408 SkyCourier',
                  airframe_passengers: 0,
                },
              ],
            },
          }),
          { status: 200 },
        ),
    });
    assert.equal(type, '3_1736658831347');
    assert.match(airframe.comments, /Carenado/);
  });
});

describe('fallbackSimBriefAirframeForDefault', () => {
  it('prefers the sole airframe and MSFS vendors when several exist', () => {
    assert.equal(
      fallbackSimBriefAirframeForDefault([
        {
          internalId: 'only',
          icao: 'C408',
          listType: 'C408',
          comments: 'Carenado (MSFS) - Cessna 408 SkyCourier',
          name: 'C408',
          passengers: 0,
        },
      ])?.internalId,
      'only',
    );
    assert.equal(
      fallbackSimBriefAirframeForDefault(
        [
          {
            internalId: 'xplane',
            icao: 'C408',
            listType: 'C408',
            comments: 'Some (X-Plane) - Cessna 408',
            name: 'C408',
            passengers: 0,
          },
          {
            internalId: 'msfs',
            icao: 'C408',
            listType: 'C408',
            comments: 'Carenado (MSFS) - Cessna 408 SkyCourier',
            name: 'C408',
            passengers: 0,
          },
        ],
        'SkyCourier',
      )?.internalId,
      'msfs',
    );
  });
});

describe('airframeMaxCargoKg / resolveSimBriefMaxCargoKg', () => {
  it('keeps credible freighter maxcargo (B738 BCF) over larger mzfw-oew', async () => {
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

  it('prefers mzfw-oew over tiny GA Freight soft-cap (BN2)', async () => {
    const { maxCargoKg, source } = await resolveSimBriefMaxCargoKg({
      simbriefIcao: 'BN2P',
      simbriefAirframeMatch: 'Default',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            BN2P: {
              airframes: [
                {
                  airframe_internal_id: 'bn2p_default',
                  airframe_list_type: 'BN2P',
                  airframe_icao: 'BN2P',
                  airframe_comments: 'Default',
                  airframe_name: 'BN-2 Islander',
                  airframe_passengers: 9,
                  airframe_options: {
                    wgtunits: 'LBS',
                    maxcargo: 400,
                    oew: 4114,
                    mzfw: 6300,
                    mtow: 6600,
                    maxfuel: 390,
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    });
    assert.equal(source, 'mzfw-oew');
    // 6300 − 4114 = 2186 lb → kg
    assert.equal(maxCargoKg, Math.round(2186 / 2.2046226218));
  });

  it('airframeMaxCargoKg prefers structural unless maxcargo is a credible freight rating', () => {
    assert.equal(
      airframeMaxCargoKg({
        internalId: 'ga',
        icao: 'BN2P',
        listType: 'BN2P',
        comments: 'Default',
        name: 'BN2',
        passengers: 9,
        maxCargoKg: 181,
        oewKg: 1866,
        mzfwKg: 2858,
      }),
      992,
    );
    assert.equal(
      airframeMaxCargoKg({
        internalId: 'bcf',
        icao: 'B738',
        listType: 'B738',
        comments: 'BCF',
        name: 'B738',
        passengers: 0,
        maxCargoKg: 18_137,
        oewKg: 39_633,
        mzfwKg: 62_732,
      }),
      18_137,
    );
  });
});
