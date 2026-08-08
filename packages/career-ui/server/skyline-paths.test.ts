/**
 * Tests for packaged vs. repo career path resolution / seeding.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, after } from 'node:test';
import { resolveCareerRoot } from './skyline-paths.ts';

describe('skyline-paths', () => {
  const dirs: string[] = [];

  after(async () => {
    delete process.env.SKYLINE_CAREER_DATA;
    delete process.env.SKYLINE_CAREER_CONTENT;
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('seeds bush_PLN and overrides into data root once', async () => {
    const seed = await mkdtemp(join(tmpdir(), 'skyline-seed-'));
    const data = await mkdtemp(join(tmpdir(), 'skyline-data-'));
    dirs.push(seed, data);

    await mkdir(join(seed, 'bush_PLN'), { recursive: true });
    await writeFile(join(seed, 'bush_PLN', 'Trip.PLN'), '<PLN/>\n', 'utf8');
    await writeFile(
      join(seed, 'msfs-bush-hub-overrides.json'),
      '{"version":1}\n',
      'utf8',
    );

    process.env.SKYLINE_CAREER_CONTENT = seed;
    process.env.SKYLINE_CAREER_DATA = data;

    const root = await resolveCareerRoot();
    assert.equal(root, data);
    assert.equal(
      await readFile(join(data, 'bush_PLN', 'Trip.PLN'), 'utf8'),
      '<PLN/>\n',
    );
    assert.equal(
      await readFile(join(data, 'msfs-bush-hub-overrides.json'), 'utf8'),
      '{"version":1}\n',
    );

    // Second call must not overwrite existing files
    await writeFile(join(data, 'bush_PLN', 'Trip.PLN'), '<CHANGED/>\n', 'utf8');
    await resolveCareerRoot();
    assert.equal(
      await readFile(join(data, 'bush_PLN', 'Trip.PLN'), 'utf8'),
      '<CHANGED/>\n',
    );
  });
});
