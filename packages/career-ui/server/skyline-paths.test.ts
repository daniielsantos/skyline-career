/**
 * Tests for packaged vs. repo career path resolution / seeding.
 */
import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, after } from 'node:test';
import {
  MSFS_HUB_OVERRIDES_FILENAME,
  MSFS_HUB_OVERRIDES_LEGACY_FILENAME,
  resolveCareerRoot,
} from './skyline-paths.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('skyline-paths', () => {
  const dirs: string[] = [];

  after(async () => {
    delete process.env.SKYLINE_CAREER_DATA;
    delete process.env.SKYLINE_CAREER_CONTENT;
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('seeds hub overrides into data root once (no bush_PLN)', async () => {
    const seed = await mkdtemp(join(tmpdir(), 'skyline-seed-'));
    const data = await mkdtemp(join(tmpdir(), 'skyline-data-'));
    dirs.push(seed, data);

    await writeFile(
      join(seed, MSFS_HUB_OVERRIDES_FILENAME),
      '{"O67":{"name":"x","lat":1,"lon":2,"source":"msfs_facility","validatedAt":"2020-01-01"}}\n',
      'utf8',
    );

    process.env.SKYLINE_CAREER_CONTENT = seed;
    process.env.SKYLINE_CAREER_DATA = data;

    const root = await resolveCareerRoot();
    assert.equal(root, data);
    assert.equal(await exists(join(data, 'bush_PLN')), false);
    assert.equal(
      await readFile(join(data, MSFS_HUB_OVERRIDES_FILENAME), 'utf8'),
      '{"O67":{"name":"x","lat":1,"lon":2,"source":"msfs_facility","validatedAt":"2020-01-01"}}\n',
    );

    await writeFile(
      join(data, MSFS_HUB_OVERRIDES_FILENAME),
      '{"changed":true}\n',
      'utf8',
    );
    await resolveCareerRoot();
    assert.equal(
      await readFile(join(data, MSFS_HUB_OVERRIDES_FILENAME), 'utf8'),
      '{"changed":true}\n',
    );
  });

  it('migrates legacy override name and removes bush_PLN', async () => {
    const seed = await mkdtemp(join(tmpdir(), 'skyline-seed-'));
    const data = await mkdtemp(join(tmpdir(), 'skyline-data-'));
    dirs.push(seed, data);

    await mkdir(join(data, 'bush_PLN'), { recursive: true });
    await writeFile(join(data, 'bush_PLN', 'Trip.PLN'), '<PLN/>\n', 'utf8');
    await writeFile(
      join(data, MSFS_HUB_OVERRIDES_LEGACY_FILENAME),
      '{"legacy":true}\n',
      'utf8',
    );

    process.env.SKYLINE_CAREER_CONTENT = seed;
    process.env.SKYLINE_CAREER_DATA = data;

    await resolveCareerRoot();
    assert.equal(await exists(join(data, 'bush_PLN')), false);
    assert.equal(await exists(join(data, MSFS_HUB_OVERRIDES_LEGACY_FILENAME)), false);
    assert.equal(
      await readFile(join(data, MSFS_HUB_OVERRIDES_FILENAME), 'utf8'),
      '{"legacy":true}\n',
    );
  });
});
