import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { clearSimBriefAirframesCache } from '../../agent/src/ofp-compliance/simbrief-airframes.ts';
import {
  buildMissionDispatch,
  clearClassMaxCargoKgCache,
  flyableDispatchCargoKg,
  resolveClassMaxCargoKg,
} from './dispatch-helpers.ts';

afterEach(() => {
  clearClassMaxCargoKgCache();
  clearSimBriefAirframesCache();
});

describe('resolveClassMaxCargoKg', () => {
  it('prefers live SimBrief structural over a complete catalog row (BN2)', async () => {
    const limit = await resolveClassMaxCargoKg(
      'light_ga',
      'blackbox-bn2-islander-cargo-tip-tanks',
      {
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
      },
    );
    assert.equal(limit.source, 'mzfw-oew');
    assert.equal(limit.maxCargoKg, Math.round(2186 / 2.2046226218));
  });

  it('falls back to airframe catalog when SimBrief is unreachable', async () => {
    const limit = await resolveClassMaxCargoKg(
      'light_ga',
      'blackbox-bn2-islander-cargo-tip-tanks',
      {
        fetchImpl: async () => {
          throw new Error('network down');
        },
      },
    );
    assert.equal(limit.source, 'airframe-catalog');
    assert.equal(limit.maxCargoKg, 991);
  });

  it('falls back to class when SimBrief fails and catalog has no maxCargoKg', async () => {
    const limit = await resolveClassMaxCargoKg('light_ga', undefined, {
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });
    assert.equal(limit.source, 'class-fallback');
    assert.equal(limit.maxCargoKg, 450);
  });

  it('keeps F70 catalog payload below F100 (not SimBrief Default mzfw-oew)', async () => {
    const f70 = await resolveClassMaxCargoKg('narrow_freighter', 'justflight-f70');
    const f100 = await resolveClassMaxCargoKg(
      'narrow_freighter',
      'justflight-f100',
    );
    assert.equal(f70.source, 'airframe-catalog');
    assert.equal(f100.source, 'airframe-catalog');
    assert.equal(f70.maxCargoKg, 9190);
    assert.equal(f100.maxCargoKg, 11993);
    assert.ok(f70.maxCargoKg < f100.maxCargoKg);
  });
});

describe('flyableDispatchCargoKg', () => {
  it('clamps booked mission cargo to route fuel+MTOW ops cap', () => {
    // Book structural max; ops fuel+MTOW on a medium leg must cut below that.
    const flyable = flyableDispatchCargoKg(
      {
        cargoKg: 1_588,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
      500,
      1_588,
      {
        oewKg: 3_207,
        mtowKg: 4_756,
        fuelCapacityKg: 1_173,
        fuelBurnKgPerNm: 0.8,
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
    );
    assert.equal(flyable.fuelFeasible, true);
    assert.ok(flyable.operationalMaxCargoKg < 1_588);
    assert.equal(flyable.cargoKg, flyable.operationalMaxCargoKg);
    assert.ok(flyable.cargoKg > 200);
  });

  it('keeps booked cargo when already under ops cap', () => {
    const flyable = flyableDispatchCargoKg(
      {
        cargoKg: 400,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
      209,
      1_588,
      {
        oewKg: 3_207,
        mtowKg: 4_756,
        fuelCapacityKg: 1_173,
        fuelBurnKgPerNm: 0.8,
      },
    );
    assert.equal(flyable.cargoKg, 400);
  });

  it('prefers heavier catalog OEW over lighter SimBrief OEW (offline)', () => {
    // C90-class: SimBrief OEW ~2964 kg; catalog ~3207 kg ≈ MSFS empty.
    const lightSb = flyableDispatchCargoKg(
      {
        cargoKg: 1_200,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
      209,
      1_588,
      {
        oewKg: 2_964,
        mtowKg: 4_756,
        fuelCapacityKg: 1_173,
        fuelBurnKgPerNm: 0.8,
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
    );
    const catalogOnly = flyableDispatchCargoKg(
      {
        cargoKg: 1_200,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
      209,
      1_588,
      {
        oewKg: 3_207,
        mtowKg: 4_756,
        fuelCapacityKg: 1_173,
        fuelBurnKgPerNm: 0.8,
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
    );
    assert.equal(lightSb.operationalMaxCargoKg, catalogOnly.operationalMaxCargoKg);
    assert.ok(lightSb.cargoKg < 1_200);
  });

  it('reserves station crew under MTOW so SimBrief freight matches inject', () => {
    const withCrew = flyableDispatchCargoKg(
      {
        cargoKg: 1_000,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
      209,
      1_588,
      {
        oewKg: 3_207,
        mtowKg: 4_756,
        fuelCapacityKg: 1_173,
        fuelBurnKgPerNm: 0.8,
      },
    );
    const noCrew = flyableDispatchCargoKg(
      {
        cargoKg: 1_000,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-king-air-c90-gtx-passengers',
      },
      209,
      1_588,
      {
        oewKg: 3_207,
        mtowKg: 4_756,
        fuelCapacityKg: 1_173,
        fuelBurnKgPerNm: 0.8,
      },
      { crewKg: 0 },
    );
    assert.ok(withCrew.operationalMaxCargoKg < noCrew.operationalMaxCargoKg);
    assert.ok(
      noCrew.operationalMaxCargoKg - withCrew.operationalMaxCargoKg >= 150,
    );
  });
});

describe('buildMissionDispatch ATR payload prefill', () => {
  it('sends manualpayload not cargo for ATR 72 HighLine maxcargo cap', async () => {
    const built = await buildMissionDispatch(
      {
        id: 'msn_atr72',
        status: 'dispatched',
        originIcao: 'SAEZ',
        destIcao: 'SBGR',
        commodityId: 'electronics',
        cargoKg: Math.round(14_500 / 2.20462262185),
        payUsd: 1,
        urgency: 'normal',
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'microsoft-atr-72-600',
        deadlineTick: 100,
        reason: 'test',
        pax: 0,
      },
      {
        units: 'LBS',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              AT76: {
                airframes: [
                  {
                    airframe_internal_id: 'awemeter_hl',
                    airframe_list_type: 'AT76',
                    airframe_icao: 'AT76',
                    airframe_comments:
                      'Microsoft (MSFS) - ATR 72 - HighLine [credit: Awemeter]',
                    airframe_name: 'ATR-72-600 Highline',
                    airframe_passengers: 28,
                    airframe_options: {
                      wgtunits: 'LBS',
                      oew: 29410,
                      mzfw: 46260,
                      mtow: 50660,
                      maxfuel: 11296,
                      maxcargo: 3739,
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      },
    );
    const qs = new URL(built.url).searchParams;
    assert.equal(qs.get('cargo'), null);
    assert.ok(qs.get('manualpayload'));
    const payloadLb = Number(qs.get('manualpayload')) * 1000;
    assert.ok(Math.abs(payloadLb - 14_500) < 5);
  });
});

describe('buildMissionDispatch pax_and_cargo', () => {
  it('prefills pax from SimBrief airframe_passengers', async () => {
    const built = await buildMissionDispatch(
      {
        id: 'msn_b707',
        status: 'dispatched',
        originIcao: 'SBKP',
        destIcao: 'SBGR',
        commodityId: 'electronics',
        cargoKg: 29_329,
        payUsd: 1,
        urgency: 'normal',
        aircraftClassId: 'narrow_freighter',
        airframeTypeId: 'inibuilds-boeing-b707-gns',
        deadlineTick: 100,
        reason: 'test',
        pax: 0,
      },
      {
        units: 'KGS',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              B703: {
                airframes: [
                  {
                    airframe_internal_id: 'B703',
                    airframe_list_type: 'B703',
                    airframe_icao: 'B703',
                    airframe_comments: 'Default',
                    airframe_name: 'B707-320C',
                    airframe_passengers: 194,
                    airframe_options: {
                      wgtunits: 'LBS',
                      oew: 148300,
                      mzfw: 230000,
                      mtow: 333600,
                      maxfuel: 160000,
                      maxcargo: 50000,
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      },
    );
    assert.equal(built.maxPaxSeats, 194);
    assert.match(built.url, /[?&]pax=194(?:&|$)/);
    // Freight leftover after 194×230 lb reserved — not the full mission as cargo=
    assert.match(built.url, /[?&]cargo=9\./);
    // Force SimBrief standard 175/55 (Dual Class defaults ~190 and inflates Payload).
    const acdata = new URL(built.url).searchParams.get('acdata');
    assert.ok(acdata);
    assert.deepEqual(JSON.parse(acdata!), { paxwgt: 175, bagwgt: 55 });
  });

  it('prefills Just Flight F100 seats instead of pax=1 freight', async () => {
    const built = await buildMissionDispatch(
      {
        id: 'msn_f100',
        status: 'dispatched',
        originIcao: 'SBKP',
        destIcao: 'SBGR',
        commodityId: 'electronics',
        cargoKg: 10_000,
        payUsd: 1,
        urgency: 'normal',
        aircraftClassId: 'narrow_freighter',
        airframeTypeId: 'justflight-f100',
        deadlineTick: 100,
        reason: 'test',
        pax: 0,
      },
      {
        units: 'LBS',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              F100: {
                airframes: [
                  {
                    airframe_internal_id: 'F100JF',
                    airframe_list_type: 'F100',
                    airframe_icao: 'F100',
                    airframe_comments:
                      'Just Flight (MSFS) - 100 Pax, Sliding Door, Large Cargo',
                    airframe_name: 'F100',
                    airframe_passengers: 100,
                    airframe_options: {
                      wgtunits: 'LBS',
                      oew: 54000,
                      mzfw: 81000,
                      mtow: 98000,
                      maxfuel: 24000,
                      maxcargo: 18000,
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      },
    );
    assert.equal(built.maxPaxSeats, 100);
    assert.match(built.url, /[?&]pax=95(?:&|$)/);
    assert.doesNotMatch(built.url, /[?&]pax=1(?:&|$)/);
  });

  it('prefills ToLiss A340-600 cabin seats (440 pax) on widebody dispatch', async () => {
    const built = await buildMissionDispatch(
      {
        id: 'msn_a346',
        status: 'dispatched',
        originIcao: 'SBGR',
        destIcao: 'EGLL',
        commodityId: 'electronics',
        cargoKg: 56_811,
        payUsd: 1,
        urgency: 'normal',
        aircraftClassId: 'wide_freighter',
        airframeTypeId: 'toliss-toliss-a346-pro-preset-pax',
        deadlineTick: 100,
        reason: 'test',
        pax: 0,
      },
      {
        units: 'KGS',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              A346: {
                airframes: [
                  {
                    airframe_internal_id: '38898_1772717739162',
                    airframe_list_type: 'A346',
                    airframe_icao: 'A346',
                    airframe_comments:
                      'Aerosoft (MSFS) - A340-600 Pro (Standard Gross Weight)',
                    airframe_name: 'A340-642',
                    airframe_passengers: 440,
                    airframe_options: {
                      wgtunits: 'KGS',
                      oew: 185500,
                      mzfw: 245000,
                      mtow: 368000,
                      maxfuel: 152024,
                      maxcargo: 56811,
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      },
    );
    assert.equal(built.maxPaxSeats, 440);
    assert.match(built.url, /[?&]pax=440(?:&|$)/);
    assert.match(built.url, /[?&]cargo=10\./);
    const acdata = new URL(built.url).searchParams.get('acdata');
    assert.ok(acdata);
    assert.deepEqual(JSON.parse(acdata!), { paxwgt: 175, bagwgt: 55 });
  });
});

describe('buildMissionDispatch F28', () => {
  it('uses Just Flight Mk.4000 internal id, not type=F28', async () => {
    const built = await buildMissionDispatch(
      {
        id: 'msn_f28',
        status: 'dispatched',
        originIcao: 'KMIA',
        destIcao: 'MMUN',
        commodityId: 'electronics',
        cargoKg: 4_000,
        payUsd: 1,
        urgency: 'normal',
        aircraftClassId: 'narrow_freighter',
        airframeTypeId: 'justflight-fokker-f28',
        deadlineTick: 100,
        reason: 'test',
        pax: 0,
      },
      {
        units: 'LBS',
        liveTitle: 'Just Flight Fokker F28-4000 Air21',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              F28: {
                airframes: [
                  {
                    airframe_internal_id: '624280_mk1000',
                    airframe_list_type: 'F28',
                    airframe_icao: 'F28',
                    airframe_comments: 'Just Flight (MSFS) - Fokker F28 Mk.1000',
                    airframe_name: 'F28',
                    airframe_passengers: 65,
                  },
                  {
                    airframe_internal_id: '624280_mk4000',
                    airframe_list_type: 'F28',
                    airframe_icao: 'F28',
                    airframe_comments: 'Just Flight (MSFS) - Fokker F28 Mk.4000',
                    airframe_name: 'F28',
                    airframe_passengers: 85,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      },
    );
    assert.equal(built.type, '624280_mk4000');
    assert.match(built.url, /[?&]type=624280_mk4000(?:&|$)/);
    assert.doesNotMatch(built.url, /[?&]type=F28(?:&|$)/);
  });
});
