import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearClassMaxCargoKgCache,
  flyableDispatchCargoKg,
  resolveClassMaxCargoKg,
} from './dispatch-helpers.ts';

afterEach(() => {
  clearClassMaxCargoKgCache();
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
