import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAREER_PLAYER_AIRFRAMES,
  careerPlayerAirframePackPaths,
  clampCareerMaxCargoKg,
  defaultCareerPlayerAirframe,
  findCareerAirframeConfiguration,
  findCareerPlayerAirframe,
  isCareerPlayerAirframeEnabled,
  isPassengerConfigurationEligible,
  listCareerPlayerAirframes,
  listStarterCareerPlayerAirframes,
  resolvePassengerCapacity,
  resolveAirframeCabinSummary,
  resolveAirframeCruiseFuelFlowKgPerHour,
  resolveAirframeCruiseSpeedKt,
  resolveAirframeMaxRangeNm,
  resolveAirframeFuelBurnKgPerNm,
  resolveAirframePerfForUi,
  simconnectCabinOvershootLb,
} from './career-player-airframes.js';

describe('career player airframes', () => {
  it('makes every current homologated pack available to the player market', () => {
    const ids = new Set(CAREER_PLAYER_AIRFRAMES.map((airframe) => airframe.typeId));
    // Only packs that survived the re-homologation pass belong here — the list
    // grows as packs are homologated, it is not a frozen snapshot.
    for (const expected of [
      'asobo-c172sp-cargo',
      'blacksquare-commander-114',
      'blacksquare-bonanza-professional',
      'blacksquare-b36tp-bonanza-professional',
      'blacksquare-b60-duke',
      'blacksquare-turbine-duke',
      'pmdg-738-bcf-family',
      'pmdg-738-pax-family',
      'pmdg-738-bbj2-family',
      'pmdg-dc6',
      'tfdi-md11f-family',
    ]) {
      assert.ok(ids.has(expected), `${expected} missing from player catalog`);
    }
    assert.equal(
      ids.size,
      CAREER_PLAYER_AIRFRAMES.length,
      'duplicate typeId in player catalog',
    );
    for (const airframe of CAREER_PLAYER_AIRFRAMES) {
      assert.equal(
        findCareerPlayerAirframe(airframe.typeId)?.typeId,
        airframe.typeId,
        `${airframe.typeId} does not resolve to itself`,
      );
      assert.ok(airframe.aircraftClassId, `${airframe.typeId} has no class`);
    }
    assert.equal(ids.has('blacksquare-commander-114tc'), false);
    assert.equal(
      findCareerPlayerAirframe('pmdg-dc6')?.aircraftClassId,
      'medium_piston',
      'PMDG DC-6 is the medium_piston SKU, not wide',
    );
    assert.equal(ids.has('asobo-c208b-cargo'), false);
    assert.equal(
      findCareerPlayerAirframe('blacksquare-bonanza-professional')?.aircraftClassId,
      'light_ga',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-b36tp-bonanza-professional')
        ?.aircraftClassId,
      'light_turboprop',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-b60-duke')?.aircraftClassId,
      'light_ga',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-turbine-duke')?.aircraftClassId,
      'light_turboprop',
    );
  });

  it('gives Just Flight F70 and F100 separate OFP packs', () => {
    const f70 = findCareerPlayerAirframe('justflight-f70');
    const f100 = findCareerPlayerAirframe('justflight-f100');
    assert.equal(f70?.rolesPackRelPath, 'profiles/ofp/justflight-fokker-f70.json');
    assert.equal(
      f100?.rolesPackRelPath,
      'profiles/ofp/justflight-fokker-f100.json',
    );
    assert.notEqual(f70?.rolesPackRelPath, f100?.rolesPackRelPath);
    assert.equal(f70?.loadLayout, 'pax_and_cargo');
    assert.equal(f70?.maxPaxSeats, 70);
    assert.equal(f70?.simconnectCabinSeats, 80);
    assert.equal(simconnectCabinOvershootLb(f70), 10 * 170);
    assert.equal(simconnectCabinOvershootLb(f100), 0);
    assert.equal(f100?.simconnectCargoHoldMaxLb, 7784);
    assert.equal(f100?.loadLayout, 'pax_and_cargo');
    assert.equal(f100?.maxPaxSeats, 97);
    assert.ok((f70?.maxCargoKg ?? 0) < (f100?.maxCargoKg ?? 0));
    assert.equal(f70?.simbriefAirframeMatch, 'Just Flight \\(MSFS\\) - 70 Passengers');
  });

  it('lists Just Flight BAe 146-100/200/300 as three Market SKUs with family packs', () => {
    const s100 = findCareerPlayerAirframe('justflight-146-100');
    const s200 = findCareerPlayerAirframe('justflight-146-200');
    const s300 = findCareerPlayerAirframe('justflight-146-300');
    assert.equal(s100?.simbriefIcao, 'B461');
    assert.equal(s200?.simbriefIcao, 'B462');
    assert.equal(s300?.simbriefIcao, 'B463');
    assert.equal(
      s100?.simbriefAirframeMatch,
      'Just Flight \\(MSFS\\) - BAe 146-100',
    );
    assert.equal(
      s200?.simbriefAirframeMatch,
      'Just Flight \\(MSFS\\) - BAe 146-200',
    );
    assert.equal(
      s300?.simbriefAirframeMatch,
      'Just Flight \\(MSFS\\) - BAe 146-300',
    );
    assert.equal(s100?.maxPaxSeats, 80);
    assert.equal(s200?.maxPaxSeats, 112);
    assert.equal(s300?.maxPaxSeats, 128);
    assert.equal(s100?.efbPaxWeightLb, 170);
    assert.equal(s300?.efbPaxWeightLb, 170);
    assert.deepEqual(
      [...careerPlayerAirframePackPaths(s100!)].sort(),
      [
        'profiles/ofp/justflight-146-100-statesman.json',
        'profiles/ofp/justflight-146-100.json',
      ].sort(),
    );
    assert.deepEqual(
      [...careerPlayerAirframePackPaths(s200!)].sort(),
      [
        'profiles/ofp/justflight-146-200-freighter.json',
        'profiles/ofp/justflight-146-200.json',
      ].sort(),
    );
    assert.deepEqual(
      [...careerPlayerAirframePackPaths(s300!)].sort(),
      [
        'profiles/ofp/justflight-146-300-freighter.json',
        'profiles/ofp/justflight-146-300.json',
      ].sort(),
    );
  });

  it('stages Synaptic A220-300 as pax_and_cargo with Synaptic/iniBuilds SimBrief airframe', () => {
    const a220 = findCareerPlayerAirframe('synaptic-a220-300');
    assert.equal(a220?.simbriefIcao, 'BCS3');
    assert.equal(
      a220?.simbriefAirframeMatch,
      'Synaptic / iniBuilds \\(MSFS\\) - A220-300',
    );
    assert.equal(a220?.injectCapable, false);
    assert.equal(a220?.loadLayout, 'pax_and_cargo');
    assert.equal(a220?.maxPaxSeats, 140);
    assert.equal(
      a220?.rolesPackRelPath,
      'profiles/ofp/synaptic-a220-300.json',
    );
  });

  it('stages Skyward C680 on the Skyward SimBrief airframe row', () => {
    const c680 = findCareerPlayerAirframe('skyward-cessna-c680');
    assert.equal(c680?.simbriefIcao, 'C680');
    assert.equal(c680?.efbPaxWeightLb, 210);
    assert.equal(
      c680?.simbriefAirframeMatch,
      'Skyward Simulations \\(MSFS\\) - C680 Sovereign\\+',
    );
    assert.equal(c680?.rolesPackRelPath, 'profiles/ofp/skyward-cessna-c680.json');
    assert.equal(c680?.loadLayout, 'pax_and_cargo');
    assert.equal(c680?.maxPaxSeats, 10);
  });

  it('stages FSReborn Phenom 300E as pax_and_cargo (belly freight capped)', () => {
    const phenom = findCareerPlayerAirframe('fsreborn-phenom-300e');
    assert.equal(phenom?.loadLayout, 'pax_and_cargo');
    assert.equal(phenom?.maxPaxSeats, 7);
    assert.equal(phenom?.simconnectCargoHoldMaxLb, 463);
    // SimBrief SBEG→SBCA enroute ≈1.11 kg/nm; class 1.4 blocked mid-range charters.
    assert.equal(phenom?.fuelBurnKgPerNm, 1.11);
    assert.equal(phenom?.cruiseSpeedKt, 445);
    const vision = findCareerPlayerAirframe(
      'workingtitle-microsoft-vision-jet-complete-seating',
    );
    assert.equal(vision?.fuelBurnKgPerNm, 0.751);
    assert.equal(vision?.maxRangeNm, 1200);
    const longitude = findCareerPlayerAirframe(
      'workingtitle-cessna-citation-longitude-passengers',
    );
    assert.equal(longitude?.fuelBurnKgPerNm, 1.831);
    assert.equal(longitude?.maxRangeNm, 3500);
    // Cruise-sample save override beats catalog (and class template).
    assert.equal(
      resolveAirframeFuelBurnKgPerNm('fsreborn-phenom-300e', 'light_jet', {
        fuelBurnKgPerNm: 1.05,
        cruiseFuelFlowKgPerHour: 460,
        cruiseSpeedKt: 438,
        updatedAtIso: '2026-09-12T00:00:00.000Z',
        sampleCount: 1,
      }),
      1.05,
    );
    assert.equal(
      phenom?.simbriefAirframeMatch,
      'FSReborn \\(MSFS\\) - Phenom 300E',
    );
  });

  it('certifies passenger configurations for all nine light-jet Market SKUs', () => {
    const expected = new Map<string, [number, string]>([
      ['workingtitle-cessna-citation-cj4', [10, 'dispatch_ready']],
      ['workingtitle-cessna-citation-longitude-passengers', [10, 'dispatch_ready']],
      ['skyward-cessna-c680', [10, 'inject_verified']],
      ['flightfx-citation-x', [12, 'dispatch_ready']],
      ['flightfx-mg-hjet-ha420', [6, 'dispatch_ready']],
      ['flysimware-learjet-35a-cargo', [8, 'dispatch_ready']],
      ['microsoft-pc-24-cargo', [10, 'dispatch_ready']],
      ['fsreborn-phenom-300e', [7, 'inject_verified']],
      ['workingtitle-microsoft-vision-jet-complete-seating', [6, 'dispatch_ready']],
    ]);
    const lightJets = listCareerPlayerAirframes('light_jet');
    assert.equal(lightJets.length, expected.size);
    assert.equal(new Set(lightJets.map((row) => row.typeId)).size, expected.size);

    for (const [typeId, [capacity, certificationState]] of expected) {
      const airframe = findCareerPlayerAirframe(typeId);
      assert.ok(airframe, `${typeId} missing`);
      const passengerConfigurations = airframe!.configurations!.filter(
        isPassengerConfigurationEligible,
      );
      assert.ok(passengerConfigurations.length > 0, `${typeId} has no eligible pax pack`);
      assert.equal(
        Math.max(...passengerConfigurations.map((row) => row.passengerCapacity)),
        capacity,
      );
      assert.ok(
        passengerConfigurations.every(
          (row) => row.certificationState === certificationState,
        ),
      );
      assert.ok(passengerConfigurations.every((row) => row.requiredCrew === 2));
      assert.ok(
        passengerConfigurations.every(
          (row) =>
            row.baggageAllowanceLbPerPassenger === 55 &&
            row.baggageCapacityLb >= row.passengerCapacity * 55,
        ),
      );
    }
  });

  it('stamps dispatch_ready passenger configs on charter-eligible GA/TP SKUs', () => {
    const samples = new Map<string, number>([
      ['blacksquare-b60-duke', 5],
      ['asobo-cessna-c152', 3],
      ['asobo-beechcraft-bonanza', 5],
      ['workingtitle-tbm-930-passengers', 6],
      ['microsoft-pc-12-ngx-passengers', 9],
      ['c208-caravan-cargo', 8],
      ['inibuilds-f406-caravan-ii-passenger', 12],
      ['microsoft-atr-42-600', 18],
    ]);
    for (const [typeId, capacity] of samples) {
      assert.equal(
        resolvePassengerCapacity(typeId, 'passenger'),
        capacity,
        typeId,
      );
    }

    const gaTp = [
      ...listCareerPlayerAirframes('light_ga'),
      ...listCareerPlayerAirframes('light_turboprop'),
    ];
    for (const airframe of gaTp) {
      const passengerConfigurations = (airframe.configurations ?? []).filter(
        isPassengerConfigurationEligible,
      );
      assert.ok(
        passengerConfigurations.length > 0,
        `${airframe.typeId} missing eligible passenger configuration`,
      );
      assert.ok(
        passengerConfigurations.every(
          (row) =>
            row.certificationState === 'dispatch_ready' &&
            row.baggageAllowanceLbPerPassenger === 55 &&
            row.baggageCapacityLb >= row.passengerCapacity * 55,
        ),
        airframe.typeId,
      );
    }

    assert.equal(
      resolvePassengerCapacity(
        'microsoft-pc-12-ngx-passengers',
        undefined,
        'profiles/ofp/microsoft-pc-12ngx-cargo.json',
      ),
      0,
    );
    assert.equal(
      resolvePassengerCapacity(
        'microsoft-pc-12-ngx-passengers',
        undefined,
        'profiles/ofp/microsoft-pc-12-ngx-passengers.json',
      ),
      9,
    );
  });

  it('stamps passenger configs on medium_piston and narrow pax SKUs for charter', () => {
    assert.equal(
      resolvePassengerCapacity('microsoft-douglas-dc-3-metal-left', 'passenger'),
      26,
    );
    assert.equal(resolvePassengerCapacity('pmdg-dc6', 'passenger'), 68);

    for (const airframe of listCareerPlayerAirframes('medium_piston')) {
      const pax = (airframe.configurations ?? []).filter(
        isPassengerConfigurationEligible,
      );
      assert.ok(pax.length > 0, `${airframe.typeId} missing passenger config`);
    }

    const freighterOnly = new Set([
      'pmdg-738-bcf-family',
      'blackbird-c-130j-long-configuration',
    ]);
    for (const airframe of listCareerPlayerAirframes('narrow_freighter')) {
      const pax = (airframe.configurations ?? []).filter(
        isPassengerConfigurationEligible,
      );
      if (freighterOnly.has(airframe.typeId)) {
        assert.equal(
          pax.length,
          0,
          `${airframe.typeId} must stay cargo-only for charter Fit`,
        );
        assert.equal(resolvePassengerCapacity(airframe.typeId, 'passenger'), 0);
        continue;
      }
      assert.ok(
        pax.length > 0,
        `${airframe.typeId} missing eligible passenger configuration`,
      );
      assert.equal(
        Math.max(...pax.map((row) => row.passengerCapacity)),
        airframe.maxPaxSeats,
        airframe.typeId,
      );
      assert.ok(
        pax.every(
          (row) =>
            row.certificationState === 'dispatch_ready' &&
            row.baggageCapacityLb >= row.passengerCapacity * 55,
        ),
        airframe.typeId,
      );
    }

    const dual = findCareerPlayerAirframe('justflight-146-200')!;
    assert.equal(
      findCareerAirframeConfiguration(dual, 'cargo')?.role,
      'cargo',
    );
    assert.equal(resolvePassengerCapacity(dual.typeId, 'cargo'), 0);
    assert.equal(resolvePassengerCapacity(dual.typeId, 'passenger'), 112);
  });

  it('summarizes cabin/charter layout for Market and Hangar cards', () => {
    const duke = resolveAirframeCabinSummary('blacksquare-b60-duke', 'light_ga');
    assert.equal(duke.passengerSeats, 5);
    assert.equal(duke.hasPassengerConfig, true);
    assert.equal(duke.dualLayout, false);
    assert.equal(duke.defaultRole, 'passenger');

    const titan = resolveAirframeCabinSummary('microsoft-404-titan', 'light_ga');
    assert.equal(titan.passengerSeats, 9);
    assert.equal(titan.dualLayout, true);
    assert.equal(titan.defaultRole, 'cargo');

    const md11 = resolveAirframeCabinSummary('tfdi-md11f-family', 'wide_freighter');
    assert.equal(md11.passengerSeats, 0);
    assert.equal(md11.hasPassengerConfig, false);

    const perf = resolveAirframePerfForUi('blacksquare-b60-duke', 'light_ga');
    assert.equal(perf.cabin.passengerSeats, 5);
  });

  it('blocks cargo-family packs from passenger capacity', () => {
    const learjet = findCareerPlayerAirframe('flysimware-learjet-35a-cargo')!;
    const pc24 = findCareerPlayerAirframe('microsoft-pc-24-cargo')!;
    for (const [airframe, cargoPack, passengerId, expectedCapacity] of [
      [
        learjet,
        'profiles/ofp/flysimware-learjet-35a-cargo.json',
        'passenger',
        8,
      ],
      [pc24, 'profiles/ofp/microsoft-pc-24-cargo.json', 'vip', 10],
    ] as const) {
      const cargo = findCareerAirframeConfiguration(airframe, undefined, cargoPack);
      assert.equal(cargo?.role, 'cargo');
      assert.equal(cargo?.passengerCapacity, 0);
      assert.equal(isPassengerConfigurationEligible(cargo), false);
      assert.equal(resolvePassengerCapacity(airframe.typeId, undefined, cargoPack), 0);
      assert.equal(
        resolvePassengerCapacity(airframe.typeId, passengerId),
        expectedCapacity,
      );
      assert.equal(
        resolvePassengerCapacity(airframe.typeId, 'unknown-configuration'),
        0,
      );
    }
  });

  it('stages Just Flight F28 family as pax_and_cargo', () => {
    const f28 = findCareerPlayerAirframe('justflight-fokker-f28');
    assert.equal(f28?.loadLayout, 'pax_and_cargo');
    assert.equal(f28?.maxPaxSeats, 85);
    assert.equal(f28?.rolesPackRelPath, 'profiles/ofp/justflight-fokker-f28.json');
  });

  it('stages Microsoft A320neo V2 as pax_and_cargo on the iniBuilds SimBrief row', () => {
    const neo = findCareerPlayerAirframe('microsoft-a320neo-v2');
    assert.equal(neo?.loadLayout, 'pax_and_cargo');
    assert.equal(neo?.maxPaxSeats, 180);
    assert.equal(neo?.efbPaxWeightLb, 187);
    assert.equal(
      neo?.simbriefAirframeMatch,
      'iniBuilds \\(MSFS\\) - A320neo V2',
    );
  });

  it('stages Fenix A320 family as pax_and_cargo', () => {
    const fenix = findCareerPlayerAirframe('fenix-a320');
    assert.equal(fenix?.loadLayout, 'pax_and_cargo');
    assert.equal(fenix?.maxPaxSeats, 180);
    assert.equal(fenix?.efbPaxWeightLb, undefined);
    assert.equal(fenix?.simconnectEmptyPayloadBiasLb, 2591);
  });

  it('stages Microsoft A321LR as pax_and_cargo on the iniBuilds SimBrief row', () => {
    const lr = findCareerPlayerAirframe('microsoft-a321lr');
    assert.equal(lr?.loadLayout, 'pax_and_cargo');
    assert.equal(lr?.maxPaxSeats, 220);
    assert.equal(lr?.efbPaxWeightLb, 188);
    assert.equal(lr?.simbriefIcao, 'A21N');
    assert.equal(
      lr?.simbriefAirframeMatch,
      'iniBuilds \\(MSFS\\) - A321LR LEAP-1A',
    );
  });

  it('stages Fenix A319 family as pax_and_cargo', () => {
    const a319 = findCareerPlayerAirframe('fenix-a319');
    assert.equal(a319?.loadLayout, 'pax_and_cargo');
    assert.equal(a319?.maxPaxSeats, 145);
    assert.equal(a319?.efbPaxWeightLb, undefined);
    assert.equal(a319?.simconnectEmptyPayloadBiasLb, 2642);
  });

  it('stages Fenix A321 family as pax_and_cargo', () => {
    const a321 = findCareerPlayerAirframe('fenix-a321');
    assert.equal(a321?.loadLayout, 'pax_and_cargo');
    assert.equal(a321?.maxPaxSeats, 220);
    assert.equal(a321?.efbPaxWeightLb, undefined);
    assert.equal(a321?.simconnectEmptyPayloadBiasLb, 2201);
    assert.equal(a321?.simbriefIcao, 'A321');
  });

  it('stages Leonardo Maddog MD-82 as pax_and_cargo on the MSFS Y162 SimBrief row', () => {
    const md82 = findCareerPlayerAirframe('leonardo-fly-the-maddog-x-md-82-20th');
    assert.equal(md82?.loadLayout, 'pax_and_cargo');
    assert.equal(md82?.maxPaxSeats, 162);
    assert.equal(
      md82?.simbriefAirframeMatch,
      'Leonardo Maddog \\(MSFS\\) - Y162 Config',
    );
  });

  it('stages Leonardo Maddog MD-83 as pax_and_cargo on the MSFS Y162 SimBrief row', () => {
    const md83 = findCareerPlayerAirframe('leonardo-fly-the-maddog-x-md-83-20th');
    assert.equal(md83?.loadLayout, 'pax_and_cargo');
    assert.equal(md83?.maxPaxSeats, 162);
    assert.equal(
      md83?.simbriefAirframeMatch,
      'Leonardo Maddog \\(MSFS\\) - Y162 Config',
    );
  });

  it('stages Leonardo Maddog MD-88 as pax_and_cargo on the MSFS Y162 SimBrief row', () => {
    const md88 = findCareerPlayerAirframe('leonardo-fly-the-maddog-x-md-88-20th');
    assert.equal(md88?.loadLayout, 'pax_and_cargo');
    assert.equal(md88?.maxPaxSeats, 162);
    assert.equal(
      md88?.simbriefAirframeMatch,
      'Leonardo Maddog \\(MSFS\\) - Y162 Config',
    );
  });

  it('stages PMDG 777-200ER as pax_and_cargo on the PMDG B772 SimBrief row', () => {
    const er = findCareerPlayerAirframe('pmdg-777-200er');
    assert.equal(er?.loadLayout, 'pax_and_cargo');
    assert.equal(er?.maxPaxSeats, 294);
    assert.equal(er?.simconnectCargoHoldMaxLb, 85140);
    assert.equal(er?.injectCapable, true);
    assert.equal(er?.rolesPackRelPath, 'profiles/ofp/pmdg-777-pax.json');
  });

  it('stages PMDG 777-200LR as pax_and_cargo with Skyline inject', () => {
    const lr = findCareerPlayerAirframe('pmdg-777-200lr');
    assert.equal(lr?.loadLayout, 'pax_and_cargo');
    assert.equal(lr?.maxPaxSeats, 297);
    assert.equal(lr?.simconnectCargoHoldMaxLb, 60346);
    assert.equal(lr?.injectCapable, true);
    assert.equal(lr?.rolesPackRelPath, 'profiles/ofp/pmdg-777-200lr-pax.json');
    assert.equal(lr?.simbriefIcao, 'B77L');
    assert.equal(lr?.simbriefAirframeMatch, 'PMDG \\(MSFS\\) - Standard');
  });

  it('stages PMDG 777-300ER as pax_and_cargo with Skyline inject', () => {
    const wr = findCareerPlayerAirframe('pmdg-777-300er');
    assert.equal(wr?.loadLayout, 'pax_and_cargo');
    assert.equal(wr?.maxPaxSeats, 370);
    assert.equal(wr?.simconnectCargoHoldMaxLb, 84335);
    assert.equal(wr?.injectCapable, true);
    assert.equal(wr?.rolesPackRelPath, 'profiles/ofp/pmdg-777-300er-pax.json');
    assert.equal(wr?.simbriefIcao, 'B77W');
    assert.equal(wr?.simbriefAirframeMatch, 'PMDG \\(MSFS\\) - 777,000 MTOW');
  });

  it('stages PMDG 777F freighter with Skyline inject on PMDG SimBrief row', () => {
    const f = findCareerPlayerAirframe('pmdg-777f');
    assert.equal(f?.injectCapable, true);
    assert.equal(f?.rolesPackRelPath, 'profiles/ofp/pmdg-777.json');
    assert.equal(f?.simbriefIcao, 'B77F');
    assert.equal(f?.simbriefAirframeMatch, 'PMDG \\(MSFS\\) - 766,800 MTOW');
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
      findCareerPlayerAirframe('asobo-beechcraft-bonanza-private-charter')?.typeId,
      'asobo-beechcraft-bonanza',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-commander-114tc')?.typeId,
      'blacksquare-commander-114',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-a36tc-bonanza-professional')?.typeId,
      'blacksquare-bonanza-professional',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-grand-duke')?.typeId,
      'blacksquare-b60-duke',
    );
    assert.equal(
      findCareerPlayerAirframe('asobo-c208b-cargo')?.typeId,
      'c208-caravan-cargo',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-caravan-cargo-pod')?.typeId,
      'c208-caravan-cargo',
    );
    assert.equal(
      findCareerPlayerAirframe('microsoft-atr-72-600-highline-03')?.typeId,
      'microsoft-atr-72-600',
    );
    assert.equal(
      findCareerPlayerAirframe('microsoft-atr-72-600-highline-03')?.label,
      'ATR 72-600',
    );
    assert.equal(
      findCareerPlayerAirframe('microsoft-atr-42-600-stol')?.typeId,
      'microsoft-atr-42-600',
    );
    assert.equal(
      findCareerPlayerAirframe('microsoft-404-titan-cargo')?.typeId,
      'microsoft-404-titan',
    );
  });

  it('lists Caravan OFP packs on the shared Market SKU', () => {
    const caravan = findCareerPlayerAirframe('c208-caravan-cargo');
    assert.ok(caravan);
    const paths = careerPlayerAirframePackPaths(caravan!);
    assert.ok(paths.some((p) => p.includes('blacksquare-caravan-cargo-pod')));
    assert.ok(paths.some((p) => p.includes('blacksquare-caravan-professional-gear')));
    assert.ok(
      paths.some((p) =>
        p.includes('blacksquare-caravan-professional-super-cargomaster'),
      ),
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-caravan-professional-gear')?.typeId,
      'c208-caravan-cargo',
    );
    assert.equal(
      findCareerPlayerAirframe('blacksquare-caravan-professional-super-cargomaster')
        ?.typeId,
      'c208-caravan-cargo',
    );
    assert.equal(
      CAREER_PLAYER_AIRFRAMES.some(
        (row) => row.typeId === 'blacksquare-caravan-professional-gear',
      ),
      false,
    );
  });

  it('lists BN2 Islander as one Market SKU with SpecialOps + Cargo Tip Tanks packs', () => {
    assert.equal(
      CAREER_PLAYER_AIRFRAMES.some(
        (row) => row.typeId === 'blackbox-bn2-islander-specialops-analogue',
      ),
      false,
    );
    const bn2 = findCareerPlayerAirframe('blackbox-bn2-islander-cargo-tip-tanks');
    assert.ok(bn2);
    assert.equal(bn2!.label, 'BN2 Islander');
    const paths = careerPlayerAirframePackPaths(bn2!);
    assert.ok(paths.some((p) => p.includes('blackbox-bn2-islander-cargo-tip-tanks')));
    assert.ok(
      paths.some((p) => p.includes('blackbox-bn2-islander-specialops-analogue')),
    );
    assert.equal(
      findCareerPlayerAirframe('blackbox-bn2-islander-specialops-analogue')?.typeId,
      'blackbox-bn2-islander-cargo-tip-tanks',
    );
    assert.equal(
      findCareerPlayerAirframe('blackbox-bn2-islander-cargo-analogue-tip-tanks')
        ?.typeId,
      'blackbox-bn2-islander-cargo-tip-tanks',
    );
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
      512,
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
    assert.equal(commander?.maxRangeNm, 725);
    // Per-airframe range wins over the class default (800 nm for light_ga).
    assert.equal(
      resolveAirframeMaxRangeNm('blacksquare-commander-114', 'light_ga'),
      725,
    );
    assert.ok(
      (resolveAirframeCruiseFuelFlowKgPerHour('blacksquare-commander-114') ?? 0) >
        20,
    );
    assert.equal(resolveAirframeMaxRangeNm('missing-type', 'light_ga'), 800);
    assert.equal(resolveAirframeCruiseSpeedKt('blacksquare-commander-114'), 174);
    // De-homologated SKUs expose no per-airframe cruise speed.
    assert.equal(resolveAirframeCruiseSpeedKt('carenado-404-titan-cargo'), undefined);
  });

  it('clamps maxCargo to MTOW−OEW / MZFW−OEW', () => {
    assert.equal(
      clampCareerMaxCargoKg({
        maxCargoKg: 2948,
        oewKg: 1922,
        mtowKg: 3969,
      }),
      2047,
    );
    assert.equal(
      clampCareerMaxCargoKg({
        maxCargoKg: 2948,
        oewKg: 1922,
        mtowKg: 3969,
        mzfwKg: 3550,
      }),
      1628,
    );
  });
});

