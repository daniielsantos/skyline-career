import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  listMsfsBushHubOverrides,
  setRuntimeMsfsBushHubOverrides,
  type CareerEconomyWorld,
} from '@msfs-compat/shared';
import {
  buildMsfsBushHubOverrideFromInput,
  homologateBushHub,
  resolveHomologateCoords,
} from './bush-hub-homologate.ts';

describe('bush hub homologate (Facilities)', () => {
  const dirs: string[] = [];

  after(async () => {
    setRuntimeMsfsBushHubOverrides({});
    await Promise.all(
      dirs.map((d) => rm(d, { recursive: true, force: true }).catch(() => {})),
    );
  });

  it('defaults source to msfs_facility when building override', () => {
    const { override } = buildMsfsBushHubOverrideFromInput({
      icao: 'O67',
      name: 'Manzanar Airport',
      lat: 36.7372,
      lon: -118.145,
    });
    assert.equal(override.source, 'msfs_facility');
    assert.equal(override.name, 'Manzanar Airport');
  });

  it('accepts network career hubs (not only bushTripOnly)', () => {
    const { icao, override } = buildMsfsBushHubOverrideFromInput({
      icao: 'KIYK',
      name: 'Inyokern',
      lat: 35.6588,
      lon: -117.8296,
      source: 'msfs_facility',
    });
    assert.equal(icao, 'KIYK');
    assert.equal(override.source, 'msfs_facility');
  });

  it('resolveHomologateCoords uses facility fetcher when lat/lon omitted', async () => {
    const resolved = await resolveHomologateCoords(
      { icao: 'O67' },
      {
        fetchFacility: async (icao) => ({
          icao,
          name: 'Manzanar Airport',
          lat: 36.7372,
          lon: -118.145,
          altMeters: 1166,
        }),
      },
    );
    assert.equal(resolved.source, 'msfs_facility');
    assert.equal(resolved.lat, 36.7372);
    assert.equal(resolved.lon, -118.145);
    assert.equal(resolved.name, 'Manzanar Airport');
  });

  it('homologate without lat/lon via facility mock writes override file', async () => {
    setRuntimeMsfsBushHubOverrides({});
    const careerDir = await mkdtemp(join(tmpdir(), 'bush-hub-'));
    dirs.push(careerDir);

    const resolved = await resolveHomologateCoords(
      { icao: 'O67' },
      {
        fetchFacility: async () => ({
          icao: 'O67',
          name: 'Manzanar Airport',
          lat: 36.7372,
          lon: -118.145,
          runways: [
            {
              ident: '15',
              identReciprocal: '33',
              headingTrueDeg: 160,
              lengthM: 1100,
              widthM: 18,
              lat: 36.7372,
              lon: -118.145,
              surface: 'dirt' as const,
            },
          ],
        }),
      },
    );

    const world = {
      airports: [
        {
          icao: 'O67',
          name: 'Independence',
          lat: 36.8,
          lon: -118.2,
          bushTripOnly: true,
        },
      ],
    } as CareerEconomyWorld;

    const result = await homologateBushHub(careerDir, world, resolved);
    assert.equal(result.override.source, 'msfs_facility');
    assert.equal(result.airport?.name, 'Manzanar Airport');
    assert.equal(result.airport?.lat, 36.7372);
    assert.equal(result.override.runways?.[0]?.ident, '15');

    const disk = JSON.parse(
      await readFile(join(careerDir, 'msfs-bush-hub-overrides.json'), 'utf8'),
    ) as Record<string, { source: string; lat: number; runways?: unknown[] }>;
    assert.equal(disk.O67?.source, 'msfs_facility');
    assert.equal(disk.O67?.lat, 36.7372);
    assert.equal(disk.O67?.runways?.length, 1);
    assert.equal(listMsfsBushHubOverrides().O67?.source, 'msfs_facility');

    setRuntimeMsfsBushHubOverrides({});
  });
});
