import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
import { resolveDispatchSimBriefParams } from './dispatch-helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('resolveMissionRolesPack', () => {
  it('resolves 404 Titan Passengers pack from live title (not cargo default)', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/microsoft-404-titan-cargo.json',
      airframeTypeId: 'microsoft-404-titan',
      liveTitle: '404 Titan Passengers',
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /microsoft-404-titan-passengers\.json$/,
    );
    assert.deepEqual(roles.pack.payload?.stationRoles?.baggageStations, [
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('keeps 404 Titan Cargo pack for cargo live title', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/microsoft-404-titan-cargo.json',
      airframeTypeId: 'microsoft-404-titan',
      liveTitle: '404 Titan Cargo',
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /microsoft-404-titan-cargo\.json$/,
    );
    assert.deepEqual(roles.pack.payload?.stationRoles?.baggageStations, [3, 4]);
  });

  it('resolves the Asobo C208B pack from the live title', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'C208B Cargo N208AS',
    });
    // Both packs sit on the shared Caravan SKU, so the live title decides which
    // one loads instead of the mission-class default.
    assert.match(roles.path.replace(/\\/g, '/'), /asobo-c208b-cargo\.json$/);
  });

  it('keeps Black Square pack for BS live title', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'Black Square Caravan Professional Cargo Pod N2500A',
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /blacksquare-caravan-cargo-pod\.json$/,
    );
  });

  it('falls back to mission class pack when title is unknown', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'Totally Unknown Aircraft XYZ',
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /blacksquare-caravan-cargo-pod\.json$/,
    );
    assert.match(roles.via, /mission class/);
  });

  it('rejects another homologated model for a purchased concrete airframe', async () => {
    await assert.rejects(
      resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/asobo-c172sp-cargo.json',
        liveTitle: 'Black Square Commander 114',
        airframeTypeId: 'asobo-c172sp-cargo',
        strictAirframeMatch: true,
      }),
      /does not match the purchased airframe/,
    );
  });

  it('rejects C408 Cargo Loaded (crew-only livery) for the Empty inject pack', async () => {
    await assert.rejects(
      resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/microsoft-c408-skycourier-cargo.json',
        liveTitle: 'C408 SkyCourier Cargo - Loaded',
        airframeTypeId: 'microsoft-c408-skycourier-cargo',
        strictAirframeMatch: true,
      }),
      /not homologated for the purchased airframe|does not match the purchased airframe/,
    );
  });

  it('accepts C408 Cargo Empty for inject', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/microsoft-c408-skycourier-cargo.json',
      liveTitle: 'C408 SkyCourier Cargo - Empty',
      airframeTypeId: 'microsoft-c408-skycourier-cargo',
      strictAirframeMatch: true,
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /microsoft-c408-skycourier-cargo\.json$/,
    );
  });

  it('accepts either C172 glass when the purchased family pack matches', async () => {
    for (const liveTitle of ['C172SP Classic Cargo', 'C172SP G1000 Cargo']) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/asobo-c172sp-cargo.json',
        liveTitle,
        airframeTypeId: 'asobo-c172sp-cargo',
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), /asobo-c172sp-cargo\.json$/);
    }
  });

  it('accepts either Commander 114 glass when the purchased family pack matches', async () => {
    for (const liveTitle of [
      'Black Square Commander 114',
      'Black Square Commander 114TC',
    ]) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/blacksquare-commander-114.json',
        liveTitle,
        airframeTypeId: 'blacksquare-commander-114',
        strictAirframeMatch: true,
      });
      assert.match(
        roles.path.replace(/\\/g, '/'),
        /blacksquare-commander-114\.json$/,
      );
    }
  });

  it('accepts Black Square Caravan under the shared Market SKU', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'Black Square Caravan Professional Cargo Pod',
      airframeTypeId: 'c208-caravan-cargo',
      strictAirframeMatch: true,
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /blacksquare-caravan-cargo-pod\.json$/,
    );
  });

  it('accepts Caravan Professional Gear under the shared Market SKU', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'Black Square Caravan Professional Gear',
      airframeTypeId: 'c208-caravan-cargo',
      strictAirframeMatch: true,
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /blacksquare-caravan-professional-gear\.json$/,
    );
  });

  it('accepts MSFS short title Beechcraft King Air for the 350i pack', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/asobo-beechcraft-king-air-350i.json',
      liveTitle: 'Beechcraft King Air',
      airframeTypeId: 'asobo-beechcraft-king-air-350i',
      strictAirframeMatch: true,
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /asobo-beechcraft-king-air-350i\.json$/,
    );
  });

  it('ignores a mismatched live title when a purchased airframe is set (soft)', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'Black Square Commander 114',
      airframeTypeId: 'c208-caravan-cargo',
      strictAirframeMatch: false,
    });
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /blacksquare-caravan-cargo-pod\.json$/,
    );
    assert.match(roles.via, /mission class/);
  });

  it('accepts Saab 340 Passenger or Cargo under the shared Market SKU', async () => {
    const cases = [
      ['340 Passenger', /carenado-saab-340-passenger\.json$/],
      ['Saab 340 Passenger', /carenado-saab-340-passenger\.json$/],
      ['340 Cargo', /microsoft-saab-340-cargo\.json$/],
      ['340 Cargo - Empty', /microsoft-saab-340-cargo\.json$/],
      ['Saab 340 Cargo', /microsoft-saab-340-cargo\.json$/],
    ] as const;
    for (const [liveTitle, pathRe] of cases) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/carenado-saab-340-passenger.json',
        liveTitle,
        airframeTypeId: 'carenado-saab-340-passenger',
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), pathRe);
    }
  });

  it('picks the matching Bandeirante family pack for each live title', async () => {
    const cases = [
      [
        'NextGenSim EMB-110P Bandeirante',
        /nextgensim-emb-110p-bandeirante\.json$/,
        'NextGen Simulations \\(MSFS\\) - EMB-110P$',
      ],
      [
        'NextGenSim EMB-110P1 Bandeirante',
        /nextgensim-emb-110p1-bandeirante\.json$/,
        'NextGen Simulations \\(MSFS\\) - EMB-110P1$',
      ],
      [
        'NextGenSim EMB-110P1F Bandeirante',
        /nextgensim-emb-110p1f-bandeirante\.json$/,
        'NextGen Simulations \\(MSFS\\) - EMB-110P1F$',
      ],
      [
        'NextGenSim EMB-110P2 Bandeirante',
        /nextgensim-emb-110p2-bandeirante\.json$/,
        'NextGen Simulations \\(MSFS\\) - EMB-110P2$',
      ],
    ] as const;
    for (const [liveTitle, pathRe, match] of cases) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/nextgensim-emb-110p1f-bandeirante.json',
        liveTitle,
        airframeTypeId: 'nextgensim-emb-110p1f-bandeirante',
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), pathRe);
      assert.equal(roles.pack.simbriefAirframeMatch, match);
    }
  });

  it('picks BN2 Cargo Tip Tanks or SpecialOps pack from one Market SKU', async () => {
    const cases = [
      [
        'BN2 Islander - Cargo / Analogue / Tip Tanks',
        /blackbox-bn2-islander-cargo-tip-tanks\.json$/,
      ],
      [
        'BN2 Islander - Cargo / Garmin / Tip Tanks',
        /blackbox-bn2-islander-cargo-tip-tanks\.json$/,
      ],
      [
        'BN2 Islander - SpecialOps / Analogue',
        /blackbox-bn2-islander-specialops-analogue\.json$/,
      ],
    ] as const;
    for (const [liveTitle, pathRe] of cases) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/blackbox-bn2-islander-cargo-tip-tanks.json',
        liveTitle,
        airframeTypeId: 'blackbox-bn2-islander-cargo-tip-tanks',
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), pathRe);
    }
    // Legacy owned SpecialOps typeId aliases to the family SKU.
    const viaAlias = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blackbox-bn2-islander-cargo-tip-tanks.json',
      liveTitle: 'BN2 Islander - SpecialOps / Analogue',
      airframeTypeId: 'blackbox-bn2-islander-specialops-analogue',
      strictAirframeMatch: true,
    });
    assert.match(
      viaAlias.path.replace(/\\/g, '/'),
      /blackbox-bn2-islander-specialops-analogue\.json$/,
    );
  });
});

describe('resolveMissionRolesPack FSLabs A321', () => {
  it('picks the engine row and keeps Fenix on its own pack', async () => {
    const cases = [
      [
        'FSLabs A321-211 - FSL (SX-FSL)',
        'fslabs-a321',
        'profiles/ofp/fslabs-a321-211.json',
        /fslabs-a321-211\.json$/,
        'FSLabs \\(MSFS\\) - A321-211 CFM \\(0 ACT\\)',
      ],
      [
        'FSLabs A321-231 - FSL',
        'fslabs-a321',
        'profiles/ofp/fslabs-a321-211.json',
        /fslabs-a321-231\.json$/,
        'FSLabs \\(MSFS\\) - A321-231 IAE \\(0 ACT\\)',
      ],
      [
        'FSLabs A321-251N - FSL (SN-FSL)',
        'fslabs-a321neo',
        'profiles/ofp/fslabs-a321-251n.json',
        /fslabs-a321-251n\.json$/,
        'FSLabs \\(MSFS\\) - A321-251NX LEAP-32 \\(0 ACT\\)',
      ],
      [
        'FSLabs A321-271N - FSL',
        'fslabs-a321neo',
        'profiles/ofp/fslabs-a321-251n.json',
        /fslabs-a321-271n\.json$/,
        'FSLabs \\(MSFS\\) - A321-271NX PW1133G \\(0 ACT\\)',
      ],
    ] as const;
    for (const [liveTitle, typeId, fallback, pathRe, match] of cases) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: fallback,
        liveTitle,
        airframeTypeId: typeId,
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), pathRe);
      assert.equal(roles.pack.simbriefAirframeMatch, match);
    }
    const fenix = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/fenix-a321.json',
      liveTitle: 'FenixA321 CFM SL TC',
      airframeTypeId: 'fenix-a321',
      strictAirframeMatch: true,
    });
    assert.match(fenix.path.replace(/\\/g, '/'), /fenix-a321\.json$/);
  });
});

describe('resolveMissionRolesPack PMDG 737-600', () => {
  it('picks Dual Class or Single Class on SimBrief B736', async () => {
    const cases = [
      [
        '737-600 PAX TC',
        /pmdg-736-pax\.json$/,
        'PMDG \\(MSFS\\) - Dual Class',
      ],
      [
        '737-600 PAX SC',
        /pmdg-736-pax-sc\.json$/,
        'PMDG \\(MSFS\\) - Single Class',
      ],
    ] as const;
    for (const [liveTitle, pathRe, match] of cases) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/pmdg-736-pax.json',
        liveTitle,
        airframeTypeId: 'pmdg-736-pax-family',
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), pathRe);
      assert.equal(roles.pack.simbriefAirframeMatch, match);
      assert.equal(roles.pack.simbriefIcao, 'B736');
    }
  });
});

describe('resolveMissionRolesPack PMDG 737-700', () => {
  it('picks Dual Class, Single Class, or BBJ from the live title', async () => {
    const cases = [
      [
        '737-700 PAX SSW TC',
        'pmdg-737-pax-family',
        'profiles/ofp/pmdg-737-pax.json',
        /pmdg-737-pax\.json$/,
        'PMDG \\(MSFS\\) - Dual Class',
      ],
      [
        '737-700 PAX BW SC',
        'pmdg-737-pax-family',
        'profiles/ofp/pmdg-737-pax.json',
        /pmdg-737-pax-sc\.json$/,
        'PMDG \\(MSFS\\) - Single Class',
      ],
      [
        '737-700 BBJ SSW',
        'pmdg-737-bbj-family',
        'profiles/ofp/pmdg-737-bbj.json',
        /pmdg-737-bbj\.json$/,
        'PMDG \\(MSFS\\) - 9 Aux Tanks',
      ],
      [
        '737-700BDSF BW',
        'pmdg-737-bdsf-family',
        'profiles/ofp/pmdg-737-bdsf.json',
        /pmdg-737-bdsf\.json$/,
        'PMDG \\(MSFS\\) - BEDEK Special Freighter',
      ],
    ] as const;
    for (const [liveTitle, typeId, fallback, pathRe, match] of cases) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: fallback,
        liveTitle,
        airframeTypeId: typeId,
        strictAirframeMatch: true,
      });
      assert.match(roles.path.replace(/\\/g, '/'), pathRe);
      assert.equal(roles.pack.simbriefAirframeMatch, match);
    }
  });
});

describe('resolveMissionRolesPack FSS E-Jets', () => {
  it('picks Dual Class for passenger glass and Cargo for the freighter', async () => {
    const pax = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/fss-embraer-e195.json',
      liveTitle: 'FSS Embraer E195 AirLink',
      airframeTypeId: 'fss-embraer-e195',
      strictAirframeMatch: true,
    });
    assert.match(pax.path.replace(/\\/g, '/'), /fss-embraer-e195\.json$/);
    assert.equal(
      pax.pack.simbriefAirframeMatch,
      'FlightSim Studio \\(MSFS\\) - Dual Class Configuration',
    );
    const cargo = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/fss-embraer-e190.json',
      liveTitle: 'FSS Embraer E190 Freighter - DHL',
      airframeTypeId: 'fss-embraer-e190',
      strictAirframeMatch: true,
    });
    assert.match(
      cargo.path.replace(/\\/g, '/'),
      /fss-embraer-e190-freighter\.json$/,
    );
    assert.equal(
      cargo.pack.simbriefAirframeMatch,
      'FlightSim Studio \\(MSFS\\) - Cargo Configuration',
    );
  });
});

describe('resolveDispatchSimBriefParams', () => {
  it('uses P2 pack match when live title is EMB-110P2 under family SKU', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_turboprop',
      airframeTypeId: 'nextgensim-emb-110p1f-bandeirante',
      rolesPackRelPath: 'profiles/ofp/nextgensim-emb-110p1f-bandeirante.json',
      liveTitle: 'NextGenSim EMB-110P2 Bandeirante',
    });
    assert.equal(params.simbriefIcao, 'E110');
    assert.equal(
      params.simbriefAirframeMatch,
      'NextGen Simulations \\(MSFS\\) - EMB-110P2$',
    );
  });

  it('falls back to default family pack match without live title', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_turboprop',
      airframeTypeId: 'nextgensim-emb-110p1f-bandeirante',
      rolesPackRelPath: 'profiles/ofp/nextgensim-emb-110p1f-bandeirante.json',
    });
    assert.equal(
      params.simbriefAirframeMatch,
      'NextGen Simulations \\(MSFS\\) - EMB-110P1F$',
    );
  });

  it('keeps Caravan SimBrief ICAO when live title is a different owned airframe', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_turboprop',
      airframeTypeId: 'c208-caravan-cargo',
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'Black Square Commander 114',
    });
    assert.equal(params.simbriefIcao, 'C208');
    // The purchased SKU label wins; a mismatched live title must not leak in.
    assert.doesNotMatch(params.titleHint, /Commander/i);
  });

  it('uses Aerostar AEST even when mission still has class Bonanza roles pack', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_ga',
      airframeTypeId: 'a2a-piper-aerostar-600',
      // Stale Demand/empty stamp: light_ga class default.
      rolesPackRelPath: 'profiles/ofp/blacksquare-bonanza-professional.json',
    });
    assert.equal(params.simbriefIcao, 'AEST');
    assert.match(params.titleHint, /Aerostar/i);
  });

  it('picks the Just Flight F100 SimBrief door variant from the live title', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'narrow_freighter',
      airframeTypeId: 'justflight-f100',
      rolesPackRelPath: 'profiles/ofp/justflight-fokker-f100.json',
      liveTitle:
        'Just Flight F100 | Integral Airstairs | Small Cargo Door | L2 Door | Just Flight',
    });
    assert.equal(params.simbriefIcao, 'F100');
    assert.equal(
      params.simbriefAirframeMatch,
      'Just Flight \\(MSFS\\) - 98 Pax, L2 Door, Integral Stairs, Small Cargo',
    );
  });

  it('uses TFDi MD-11F PW live title for SimBrief engine disambiguation', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'wide_freighter',
      airframeTypeId: 'tfdi-md11f-family',
      rolesPackRelPath: 'profiles/ofp/tfdi-md11f.json',
      liveTitle: 'TFDi Design MD-11F PW4462',
    });
    assert.equal(params.simbriefIcao, 'MD1F');
    assert.equal(
      params.simbriefAirframeMatch,
      'TFDi Design \\(MSFS\\) - MD-11F',
    );
    assert.equal(params.titleHint, 'TFDi Design MD-11F PW4462');
  });

  it('uses TFDi MD-11F GE live title for SimBrief engine disambiguation', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'wide_freighter',
      airframeTypeId: 'tfdi-md11f-family',
      rolesPackRelPath: 'profiles/ofp/tfdi-md11f.json',
      liveTitle: 'TFDi Design MD-11F GE',
    });
    assert.equal(params.simbriefIcao, 'MD1F');
    assert.equal(params.titleHint, 'TFDi Design MD-11F GE');
  });

  it('Bonanza piston SKU: A36TC live title opens SimBrief BT36 not BE36', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_ga',
      airframeTypeId: 'blacksquare-bonanza-professional',
      rolesPackRelPath: 'profiles/ofp/blacksquare-bonanza-professional.json',
      liveTitle: 'Black Square A36TC Bonanza Professional',
    });
    assert.equal(params.simbriefIcao, 'BT36');
  });

  it('Bonanza piston SKU: live B36TP keeps catalog BE36 (separate Market SKU)', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_ga',
      airframeTypeId: 'blacksquare-bonanza-professional',
      rolesPackRelPath: 'profiles/ofp/blacksquare-bonanza-professional.json',
      liveTitle: 'Black Square B36TP Bonanza Professional',
    });
    assert.equal(params.simbriefIcao, 'BE36');
  });

  it('Bonanza B36TP SKU keeps SimBrief B36T', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_turboprop',
      airframeTypeId: 'blacksquare-b36tp-bonanza-professional',
      rolesPackRelPath: 'profiles/ofp/blacksquare-b36tp-bonanza-professional.json',
      liveTitle: 'Black Square B36TP Bonanza Professional',
    });
    assert.equal(params.simbriefIcao, 'B36T');
  });

  it('Duke piston SKU: Grand Duke live title opens SimBrief BE6G not BE60', async () => {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId: 'light_ga',
      airframeTypeId: 'blacksquare-b60-duke',
      rolesPackRelPath: 'profiles/ofp/blacksquare-b60-duke.json',
      liveTitle: 'Black Square Grand Duke N18VK',
    });
    assert.equal(params.simbriefIcao, 'BE6G');
  });

  it('iFly 737 MAX: live seat layout picks SimBrief LBS airframe row', async () => {
    const max8 = await resolveDispatchSimBriefParams({
      aircraftClassId: 'narrow_freighter',
      airframeTypeId: 'asobo-737-max-8-passengers',
      rolesPackRelPath: 'profiles/ofp/asobo-737-max-8-passengers.json',
      liveTitle: 'iFly 737-MAX8 (178Seats)',
    });
    assert.equal(max8.simbriefIcao, 'B38M');
    assert.equal(
      max8.simbriefAirframeMatch,
      'iFly \\(MSFS\\) - 737 MAX 8 - 178 Seats \\(LBS\\)',
    );

    const max8200 = await resolveDispatchSimBriefParams({
      aircraftClassId: 'narrow_freighter',
      airframeTypeId: 'asobo-737-max-8-passengers',
      rolesPackRelPath: 'profiles/ofp/asobo-737-max-8-passengers.json',
      liveTitle: 'iFly 737-MAX8200',
    });
    assert.equal(max8200.simbriefIcao, 'B38M');
    assert.equal(
      max8200.simbriefAirframeMatch,
      'iFly \\(MSFS\\) - 737 MAX 8200 - 197 Seats \\(LBS\\)',
    );
  });
});
