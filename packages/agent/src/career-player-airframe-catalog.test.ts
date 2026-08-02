import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  inferCareerClassFromIcao,
  registerCareerPlayerAirframe,
  setCareerPlayerAirframeEnabled,
  updateCareerPlayerAirframeBurn,
} from './career-player-airframe-catalog.js';
import type { OfpRolesPackFile } from './ofp-compliance/scaffold-roles.js';

describe('career player airframe registration', () => {
  it('infers current economic classes', () => {
    assert.equal(inferCareerClassFromIcao('C172'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('BE60'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('C404'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('C208'), 'light_turboprop');
    assert.equal(inferCareerClassFromIcao('LJ35'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('C25B'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('B738'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('MD1F'), 'wide_freighter');
    assert.equal(inferCareerClassFromIcao('ZZZZ'), 'light_ga');
  });

  it('upserts a promoted roles pack into the shared market catalog', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'skyline-airframe-'));
    try {
      const catalogDir = join(
        repoRoot,
        'packages',
        'shared',
        'src',
        'data',
      );
      const rolesDir = join(repoRoot, 'profiles', 'ofp');
      await mkdir(catalogDir, { recursive: true });
      await mkdir(rolesDir, { recursive: true });
      await writeFile(
        join(catalogDir, 'career-player-airframes.json'),
        '[]\n',
        'utf8',
      );
      const rolesPath = join(rolesDir, 'test-c172.json');
      const pack = {
        source: 'simbrief',
        icao: 'C172',
        ofpId: 'test-c172',
        loadMethod: 'direct-injection',
        injectCapable: true,
        matchTitles: ['C172SP Test Cargo'],
        simbriefIcao: 'C172',
        simbriefAirframeMatch: 'Default',
      } as OfpRolesPackFile;

      const registered = await registerCareerPlayerAirframe({
        repoRoot,
        rolesPackPath: rolesPath,
        pack,
        aircraftClassId: 'light_ga',
      });
      assert.equal(registered.label, 'Cessna 172SP Test Cargo');
      assert.equal(
        registered.rolesPackRelPath,
        'profiles/ofp/test-c172.json',
      );
      const rows = JSON.parse(
        await readFile(
          join(catalogDir, 'career-player-airframes.json'),
          'utf8',
        ),
      ) as Array<{ typeId: string; enabled?: boolean }>;
      assert.deepEqual(rows.map((row) => row.typeId), ['test-c172']);

      const familyPack = {
        ...pack,
        ofpId: 'asobo-c172sp-cargo',
        matchTitles: ['C172SP Classic Cargo'],
      } as OfpRolesPackFile;
      const family = await registerCareerPlayerAirframe({
        repoRoot,
        rolesPackPath: join(rolesDir, 'asobo-c172sp-cargo.json'),
        pack: familyPack,
        typeId: 'asobo-c172sp-cargo',
        aircraftClassId: 'light_ga',
        title: 'C172SP Classic Cargo',
      });
      assert.equal(family.label, 'Cessna 172SP Cargo');
      const afterFamily = JSON.parse(
        await readFile(
          join(catalogDir, 'career-player-airframes.json'),
          'utf8',
        ),
      ) as Array<{ typeId: string; label: string }>;
      assert.ok(
        afterFamily.some(
          (row) =>
            row.typeId === 'asobo-c172sp-cargo' &&
            row.label === 'Cessna 172SP Cargo',
        ),
      );

      const disabled = await setCareerPlayerAirframeEnabled({
        repoRoot,
        typeId: 'test-c172',
        enabled: false,
      });
      assert.equal(disabled.enabled, false);
      const afterDisable = JSON.parse(
        await readFile(
          join(catalogDir, 'career-player-airframes.json'),
          'utf8',
        ),
      ) as Array<{ typeId: string; enabled?: boolean }>;
      assert.equal(
        afterDisable.find((row) => row.typeId === 'test-c172')?.enabled,
        false,
      );

      await setCareerPlayerAirframeEnabled({
        repoRoot,
        typeId: 'test-c172',
        enabled: true,
      });
      const afterEnable = JSON.parse(
        await readFile(
          join(catalogDir, 'career-player-airframes.json'),
          'utf8',
        ),
      ) as Array<{ typeId: string; enabled?: boolean }>;
      assert.equal(
        afterEnable.find((row) => row.typeId === 'test-c172')?.enabled,
        undefined,
      );

      await registerCareerPlayerAirframe({
        repoRoot,
        rolesPackPath: rolesPath,
        pack,
        aircraftClassId: 'light_ga',
      });
      await setCareerPlayerAirframeEnabled({
        repoRoot,
        typeId: 'test-c172',
        enabled: false,
      });
      await registerCareerPlayerAirframe({
        repoRoot,
        rolesPackPath: rolesPath,
        pack,
        aircraftClassId: 'light_ga',
      });
      const afterReregister = JSON.parse(
        await readFile(
          join(catalogDir, 'career-player-airframes.json'),
          'utf8',
        ),
      ) as Array<{ typeId: string; enabled?: boolean }>;
      assert.equal(
        afterReregister.find((row) => row.typeId === 'test-c172')?.enabled,
        undefined,
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('patches cruise burn on an existing catalog row', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'skyline-burn-'));
    try {
      const catalogDir = join(
        repoRoot,
        'packages',
        'shared',
        'src',
        'data',
      );
      await mkdir(catalogDir, { recursive: true });
      await writeFile(
        join(catalogDir, 'career-player-airframes.json'),
        JSON.stringify(
          [
            {
              typeId: 'carenado-c404-titan',
              aircraftClassId: 'light_ga',
              label: 'Cessna 404 Titan',
              rolesPackRelPath: 'profiles/ofp/carenado-c404.json',
              simbriefIcao: 'C404',
              simbriefAirframeMatch: 'Default',
              fuelBurnKgPerNm: 0.35,
            },
          ],
          null,
          2,
        ) + '\n',
        'utf8',
      );
      const updated = await updateCareerPlayerAirframeBurn({
        repoRoot,
        typeId: 'carenado-c404-titan',
        cruiseFuelFlowKgPerHour: 82.4,
        fuelBurnKgPerNm: 0.412,
        cruiseSpeedKt: 200,
      });
      assert.equal(updated.cruiseFuelFlowKgPerHour, 82.4);
      assert.equal(updated.fuelBurnKgPerNm, 0.412);
      assert.equal(updated.cruiseSpeedKt, 200);
      const saved = JSON.parse(
        await readFile(join(catalogDir, 'career-player-airframes.json'), 'utf8'),
      ) as Array<{
        typeId: string;
        cruiseFuelFlowKgPerHour?: number;
        fuelBurnKgPerNm?: number;
        cruiseSpeedKt?: number;
      }>;
      assert.equal(saved[0]?.cruiseFuelFlowKgPerHour, 82.4);
      assert.equal(saved[0]?.fuelBurnKgPerNm, 0.412);
      assert.equal(saved[0]?.cruiseSpeedKt, 200);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
