import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  createCareerProfile,
  deleteCareerProfile,
  ensureCareerProfilesLayout,
  readProfilesFile,
  setActiveCareerProfile,
} from './career-profiles.ts';

describe('career profiles', () => {
  it('migrates root sqlite into saves/<id> once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'career-prof-'));
    await writeFile(join(root, 'skyline.sqlite'), 'fake-db');
    const file = await ensureCareerProfilesLayout(root);
    assert.equal(file.profiles.length, 1);
    assert.equal(file.profiles[0]!.name, 'Pilot 1');
    assert.equal(file.activeId, null);
    await access(join(root, 'saves', file.profiles[0]!.id, 'skyline.sqlite'));
    await assert.rejects(() => access(join(root, 'skyline.sqlite')));
  });

  it('creates and activates a second profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'career-prof2-'));
    await ensureCareerProfilesLayout(root);
    const meta = await createCareerProfile(root, 'Bush only');
    assert.equal(meta.name, 'Bush only');
    const activated = await setActiveCareerProfile(root, meta.id);
    assert.equal(activated.activeId, meta.id);
    const again = await readProfilesFile(root);
    assert.ok(again.profiles.some((p) => p.name === 'Bush only'));
  });

  it('deletes last-played profile by clearing activeId', async () => {
    const root = await mkdtemp(join(tmpdir(), 'career-prof-del-'));
    await ensureCareerProfilesLayout(root);
    const a = await createCareerProfile(root, 'Alpha');
    const b = await createCareerProfile(root, 'Bravo');
    await setActiveCareerProfile(root, a.id);
    const after = await deleteCareerProfile(root, a.id);
    assert.equal(after.activeId, null);
    assert.equal(after.profiles.length, 1);
    assert.equal(after.profiles[0]!.id, b.id);
  });
});
