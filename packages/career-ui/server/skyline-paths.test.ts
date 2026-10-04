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

  it('fills a frozen override with a newer facility strip', async () => {
    const seed = await mkdtemp(join(tmpdir(), 'skyline-seed-'));
    const data = await mkdtemp(join(tmpdir(), 'skyline-data-'));
    dirs.push(seed, data);

    await writeFile(
      join(seed, MSFS_HUB_OVERRIDES_FILENAME),
      JSON.stringify({
        MGGT: {
          name: 'La Aurora Intl',
          lat: 14.58327,
          lon: -90.52747,
          source: 'msfs_facility',
          validatedAt: '2026-10-03',
          runways: [
            {
              ident: '20',
              identReciprocal: '2',
              headingTrueDeg: 197.2,
              lengthM: 2984,
              widthM: 60.7,
              lat: 14.58328,
              lon: -90.52744,
            },
          ],
        },
        KEEP: {
          name: 'newer local',
          lat: 1,
          lon: 2,
          source: 'msfs_facility',
          validatedAt: '2026-10-04',
          runways: [{ ident: '09', headingTrueDeg: 90, lengthM: 2000, widthM: 30, lat: 1, lon: 2 }],
        },
      }),
      'utf8',
    );
    await writeFile(
      join(data, MSFS_HUB_OVERRIDES_FILENAME),
      JSON.stringify({
        MGGT: {
          name: 'Guatemala City La Aurora',
          lat: 14.58,
          lon: -90.52,
          source: 'msfs_facility',
          validatedAt: '2026-09-05',
        },
        KEEP: {
          name: 'newer local',
          lat: 1,
          lon: 2,
          source: 'parked_sample',
          validatedAt: '2026-10-04',
          runways: [{ ident: '09', headingTrueDeg: 90, lengthM: 1800, widthM: 30, lat: 1, lon: 2 }],
        },
      }),
      'utf8',
    );

    process.env.SKYLINE_CAREER_CONTENT = seed;
    process.env.SKYLINE_CAREER_DATA = data;
    await resolveCareerRoot();

    const saved = JSON.parse(
      await readFile(join(data, MSFS_HUB_OVERRIDES_FILENAME), 'utf8'),
    ) as {
      MGGT: { runways: Array<{ ident: string; lengthM: number }> };
      KEEP: { runways: Array<{ lengthM: number }>; source: string };
    };
    assert.equal(saved.MGGT.runways[0]?.ident, '20');
    assert.equal(saved.MGGT.runways[0]?.lengthM, 2984);
    assert.equal(saved.KEEP.runways[0]?.lengthM, 1800);
    assert.equal(saved.KEEP.source, 'parked_sample');
  });
});
