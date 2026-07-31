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
});
