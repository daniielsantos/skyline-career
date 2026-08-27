import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAREER_PLAYER_AIRFRAMES,
  careerPlayerAirframePackPaths,
  clampCareerMaxCargoKg,
  defaultCareerPlayerAirframe,
  findCareerPlayerAirframe,
  isCareerPlayerAirframeEnabled,
  listCareerPlayerAirframes,
  listStarterCareerPlayerAirframes,
  resolveAirframeCruiseFuelFlowKgPerHour,
  resolveAirframeCruiseSpeedKt,
  resolveAirframeMaxRangeNm,
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
    assert.equal(f100?.maxPaxSeats, 100);
    assert.ok((f70?.maxCargoKg ?? 0) < (f100?.maxCargoKg ?? 0));
    assert.equal(f70?.simbriefAirframeMatch, 'Just Flight \\(MSFS\\) - 70 Passengers');
  });

  it('stages FSReborn Phenom 300E as pax_and_cargo (belly freight capped)', () => {
    const phenom = findCareerPlayerAirframe('fsreborn-phenom-300e');
    assert.equal(phenom?.loadLayout, 'pax_and_cargo');
    assert.equal(phenom?.maxPaxSeats, 7);
    assert.equal(phenom?.simconnectCargoHoldMaxLb, 463);
    assert.equal(
      phenom?.simbriefAirframeMatch,
      'FSReborn \\(MSFS\\) - Phenom 300E',
    );
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
    assert.equal(a319?.maxPaxSeats, 150);
    assert.equal(a319?.efbPaxWeightLb, undefined);
    assert.equal(a319?.simconnectEmptyPayloadBiasLb, 2642);
  });

  it('stages Fenix A321 family as pax_and_cargo', () => {
    const a321 = findCareerPlayerAirframe('fenix-a321');
    assert.equal(a321?.loadLayout, 'pax_and_cargo');
    assert.equal(a321?.maxPaxSeats, 230);
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
      551,
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

