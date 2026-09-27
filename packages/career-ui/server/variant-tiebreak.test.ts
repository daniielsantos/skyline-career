import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  structureFromProfile,
  type AircraftProfile,
} from '@msfs-compat/shared';
import { getRepoRoot } from './skyline-paths.ts';
import { decideFamilyVariant, resolveDispatchTitle } from './variant-tiebreak.ts';

async function profileStructure(rel: string) {
  const raw = await readFile(join(getRepoRoot(), rel), 'utf8');
  return structureFromProfile(JSON.parse(raw) as AircraftProfile);
}

describe('decideFamilyVariant', () => {
  it('asks among iFly glasses that share the Max 8 hash', async () => {
    const liveStructure = await profileStructure(
      'profiles/examples/ifly-ifly-737-max8200.json',
    );
    const decision = await decideFamilyVariant({
      repoRoot: getRepoRoot(),
      airframeTypeId: 'asobo-737-max-8-passengers',
      liveStructure,
    });
    assert.equal(decision.kind, 'choose');
    if (decision.kind !== 'choose') return;
    assert.deepEqual(
      decision.choices.map((choice) => choice.canonicalTitle).sort(),
      [
        'iFly 737-MAX8 (166Seats)',
        'iFly 737-MAX8 (178Seats)',
        'iFly 737-MAX8 (189Seats)',
        'iFly 737-MAX8200',
      ],
    );
  });

  it('accepts Asobo Cargo and Super Cargomaster without a question', async () => {
    const liveStructure = await profileStructure(
      'profiles/examples/asobo-c208b-cargo.json',
    );
    const decision = await decideFamilyVariant({
      repoRoot: getRepoRoot(),
      airframeTypeId: 'c208-caravan-cargo',
      liveStructure,
    });
    assert.equal(decision.kind, 'auto');
    if (decision.kind !== 'auto') return;
    assert.deepEqual(
      decision.choices.map((choice) => choice.canonicalTitle).sort(),
      [
        'Black Square Caravan Professional Super Cargomaster',
        'C208B Cargo',
      ],
    );
  });

  it('rejects a layout outside the purchased family', async () => {
    const liveStructure = await profileStructure(
      'profiles/examples/ifly-ifly-737-max8200.json',
    );
    const decision = await decideFamilyVariant({
      repoRoot: getRepoRoot(),
      airframeTypeId: 'c208-caravan-cargo',
      liveStructure,
    });
    assert.equal(decision.kind, 'none');
  });
});

describe('resolveDispatchTitle', () => {
  const repoRoot = getRepoRoot();
  const rolesPackRelPath = 'profiles/ofp/asobo-737-max-8-passengers.json';

  it('keeps a title that already matches the purchased family', async () => {
    const resolved = await resolveDispatchTitle({
      repoRoot,
      airframeTypeId: 'asobo-737-max-8-passengers',
      rolesPackRelPath,
      liveTitle: 'iFly 737-MAX8200',
      sampleStructure: async () => {
        throw new Error('structure should not be sampled');
      },
    });
    assert.equal(resolved.kind, 'title');
    if (resolved.kind !== 'title') return;
    assert.equal(resolved.title, 'iFly 737-MAX8200');
    assert.equal(resolved.saveVariant, null);
  });

  it('asks once for a livery title, then accepts the chosen glass', async () => {
    const liveStructure = await profileStructure(
      'profiles/examples/ifly-ifly-737-max8200.json',
    );
    const first = await resolveDispatchTitle({
      repoRoot,
      airframeTypeId: 'asobo-737-max-8-passengers',
      rolesPackRelPath,
      liveTitle: 'HUES RYANAIR (MALTA AIR) 9H-VUM 2026 B737-8200',
      sampleStructure: async () => liveStructure,
    });
    assert.equal(first.kind, 'choose');
    const second = await resolveDispatchTitle({
      repoRoot,
      airframeTypeId: 'asobo-737-max-8-passengers',
      rolesPackRelPath,
      liveTitle: 'HUES RYANAIR (MALTA AIR) 9H-VUM 2026 B737-8200',
      hintedTitle: 'iFly 737-MAX8200',
      sampleStructure: async () => liveStructure,
    });
    assert.equal(second.kind, 'title');
    if (second.kind !== 'title') return;
    assert.equal(second.title, 'iFly 737-MAX8200');
    assert.equal(second.saveVariant, 'iFly 737-MAX8200');
  });
});
