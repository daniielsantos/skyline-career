import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

describe('resolveMissionRolesPack', () => {
  it('prefers Asobo C208B Cargo pack over Caravan class fallback', async () => {
    const roles = await resolveMissionRolesPack({
      repoRoot,
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      liveTitle: 'C208B Cargo N208AS',
    });
    assert.match(roles.path.replace(/\\/g, '/'), /asobo-c208b-cargo\.json$/);
    assert.equal(roles.pack.ofpId, 'asobo-c208b-cargo');
    assert.deepEqual(roles.pack.payload?.stationRoles?.crewStations, [1, 2]);
    assert.ok((roles.pack.payload?.stationRoles?.baggageStations?.length ?? 0) >= 8);
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

  it('accepts Asobo or Black Square Caravan under the shared Market SKU', async () => {
    for (const liveTitle of [
      'C208B Cargo',
      'Black Square Caravan Professional Cargo Pod',
    ]) {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
        liveTitle,
        airframeTypeId: 'c208-caravan-cargo',
        strictAirframeMatch: true,
      });
      assert.ok(
        /asobo-c208b-cargo|blacksquare-caravan-cargo-pod/.test(
          roles.path.replace(/\\/g, '/'),
        ),
      );
    }
  });
});
