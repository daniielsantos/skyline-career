import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
import { resolveDispatchSimBriefParams } from './dispatch-helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('resolveMissionRolesPack', () => {
  it('falls back to Caravan class pack when Asobo C208B pack is absent', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'C208B Cargo N208AS',
    });
    // asobo-c208b-cargo.json is not in profiles/ofp — title does not resolve;
    // class fallback keeps the Black Square Caravan pack.
    assert.match(
      roles.path.replace(/\\/g, '/'),
      /blacksquare-caravan-cargo-pod\.json$/,
    );
    assert.match(roles.via, /mission class/);
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
    assert.match(params.titleHint, /Caravan/i);
  });
});
