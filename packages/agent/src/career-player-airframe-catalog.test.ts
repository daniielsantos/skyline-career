import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  inferCareerClassFromIcao,
  listFamilyMatchTitles,
  registerCareerPlayerAirframe,
  removeCareerPlayerAirframeFamily,
  setCareerPlayerAirframeEnabled,
  setCareerPlayerAirframeLabel,
  suggestShortMarketLabel,
  updateCareerPlayerAirframeBurn,
  deriveCareerMarketWeights,
  cargoMaxLoadLbFromStations,
  stationCargoCeilingIsPlaceholder,
} from './career-player-airframe-catalog.js';
import type { OfpRolesPackFile } from './ofp-compliance/scaffold-roles.js';

describe('career player airframe registration', () => {
  it('infers current economic classes', () => {
    assert.equal(inferCareerClassFromIcao('C172'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('BE60'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('BE6G'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('C404'), 'light_ga');
    assert.equal(inferCareerClassFromIcao('C208'), 'light_turboprop');
    assert.equal(inferCareerClassFromIcao('B36T'), 'light_turboprop');
    assert.equal(inferCareerClassFromIcao('B60T'), 'light_turboprop');
    assert.equal(inferCareerClassFromIcao('DC6'), 'medium_piston');
    assert.equal(inferCareerClassFromIcao('LJ35'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('C25B'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('C680'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('HDJT'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('HA420'), 'light_jet');
    assert.equal(inferCareerClassFromIcao('B738'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('B38M'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('MD82'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('MD83'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('MD88'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('F28'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('F70'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('F100'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('A319'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('A20N'), 'narrow_freighter');
    assert.equal(inferCareerClassFromIcao('MD1F'), 'wide_freighter');
    assert.equal(inferCareerClassFromIcao('B77F'), 'wide_freighter');
    assert.equal(inferCareerClassFromIcao('B77L'), 'wide_freighter');
    assert.equal(inferCareerClassFromIcao('B772'), 'wide_freighter');
    assert.equal(inferCareerClassFromIcao('B77W'), 'wide_freighter');
    assert.equal(inferCareerClassFromIcao('ZZZZ'), 'light_ga');
  });

  it('lists unique matchTitles across family packs', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'skyline-family-titles-'));
    try {
      const ofpDir = join(repoRoot, 'profiles', 'ofp');
      await mkdir(ofpDir, { recursive: true });
      await writeFile(
        join(ofpDir, 'lj-cargo.json'),
        JSON.stringify({
          matchTitles: ['LEARJET 35A CARGO', 'LEARJET 35A CARGO LONG RANGE'],
        }) + '\n',
        'utf8',
      );
      await writeFile(
        join(ofpDir, 'lj-pax.json'),
        JSON.stringify({
          matchTitles: [
            'LEARJET 35A PASSENGER',
            'LEARJET 35A CARGO',
          ],
        }) + '\n',
        'utf8',
      );
      const titles = await listFamilyMatchTitles({
        repoRoot,
        row: {
          typeId: 'flysimware-learjet-35a-cargo',
          aircraftClassId: 'light_jet',
          label: 'Learjet 35A',
          rolesPackRelPath: 'profiles/ofp/lj-cargo.json',
          familyRolesPackRelPaths: [
            'profiles/ofp/lj-cargo.json',
            'profiles/ofp/lj-pax.json',
          ],
          simbriefIcao: 'LJ35',
          simbriefAirframeMatch: 'Default',
        },
      });
      assert.deepEqual(titles, [
        'LEARJET 35A CARGO',
        'LEARJET 35A CARGO LONG RANGE',
        'LEARJET 35A PASSENGER',
      ]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('suggests short Market board labels', () => {
    assert.equal(
      suggestShortMarketLabel('LEARJET 35A CARGO LONG RANGE'),
      'Learjet 35A',
    );
    assert.equal(
      suggestShortMarketLabel('A2A Piper Aerostar 600'),
      'Piper Aerostar 600',
    );
    assert.equal(
      suggestShortMarketLabel('iniBuilds F406 Caravan II (Cargo)'),
      'F406 Caravan II',
    );
    assert.equal(
      suggestShortMarketLabel('Cessna 172SP G1000 Passengers'),
      'Cessna 172SP',
    );
  });

  it('renames Market label on an existing catalog row', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'skyline-rename-'));
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
              typeId: 'flysimware-learjet-35a-cargo',
              aircraftClassId: 'light_jet',
              label: 'LEARJET 35A CARGO LONG RANGE',
              rolesPackRelPath: 'profiles/ofp/flysimware-learjet-35a-cargo.json',
              simbriefIcao: 'LJ35',
              simbriefAirframeMatch: 'Default',
            },
          ],
          null,
          2,
        ) + '\n',
        'utf8',
      );
      const updated = await setCareerPlayerAirframeLabel({
        repoRoot,
        typeId: 'flysimware-learjet-35a-cargo',
        label: 'Learjet 35A',
      });
      assert.equal(updated.label, 'Learjet 35A');
      const saved = JSON.parse(
        await readFile(join(catalogDir, 'career-player-airframes.json'), 'utf8'),
      ) as Array<{ typeId: string; label: string }>;
      assert.equal(saved[0]?.label, 'Learjet 35A');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('derives Market weights from live empty/MTOW and sticky cargo', () => {
    assert.deepEqual(
      deriveCareerMarketWeights({
        emptyWeightLb: 7500,
        mtowLb: 13250,
        cargoMaxLoadLb: 2500,
        fuelCapacityGal: 454.4,
        lbPerGal: 6.7,
      }),
      {
        oewKg: 3402,
        mtowKg: 6010,
        maxCargoKg: 1134,
        fuelCapacityKg: 1381,
      },
    );
    assert.equal(
      cargoMaxLoadLbFromStations(
        [
          { index: 1, maxLoad: 500 },
          { index: 2, maxLoad: 500 },
          { index: 3, maxLoad: 500 },
          { index: 7, maxLoad: 500 },
        ],
        [3, 7],
      ),
      1000,
    );
  });

  it('detects draft placeholder station cargo ceilings', () => {
    assert.equal(
      stationCargoCeilingIsPlaceholder(
        [
          { index: 1, maxLoad: 500 },
          { index: 2, maxLoad: 500 },
          { index: 3, maxLoad: 500 },
          { index: 4, maxLoad: 500 },
        ],
        { crewStations: [1, 2], baggageStations: [3, 4] },
      ),
      true,
    );
    assert.equal(
      stationCargoCeilingIsPlaceholder(
        [
          { index: 1, maxLoad: 500 },
          { index: 2, maxLoad: 500 },
          { index: 3, maxLoad: 1200 },
          { index: 4, maxLoad: 500 },
        ],
        { crewStations: [1, 2], baggageStations: [3, 4] },
      ),
      false,
    );
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
        oewKg: 740,
        mtowKg: 1157,
        maxCargoKg: 220,
        fuelCapacityKg: 152,
      });
      assert.equal(registered.label, 'Cessna 172SP Test Cargo');
      assert.equal(registered.oewKg, 740);
      assert.equal(registered.maxCargoKg, 220);
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
      assert.equal(family.label, 'Cessna 172SP');
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
            row.label === 'Cessna 172SP',
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

  it('removes Market family catalog row and homologation files', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'skyline-remove-'));
    try {
      const catalogDir = join(
        repoRoot,
        'packages',
        'shared',
        'src',
        'data',
      );
      const ofpDir = join(repoRoot, 'profiles', 'ofp');
      const examplesDir = join(repoRoot, 'profiles', 'examples');
      const notesDir = join(repoRoot, 'profiles', 'notes');
      await mkdir(catalogDir, { recursive: true });
      await mkdir(ofpDir, { recursive: true });
      await mkdir(examplesDir, { recursive: true });
      await mkdir(notesDir, { recursive: true });
      await writeFile(
        join(catalogDir, 'career-player-airframes.json'),
        JSON.stringify(
          [
            {
              typeId: 'nextgensim-emb-110p1f-bandeirante',
              aircraftClassId: 'light_turboprop',
              label: 'NextGenSim EMB-110P1F Bandeirante',
              rolesPackRelPath:
                'profiles/ofp/nextgensim-emb-110p1f-bandeirante.json',
              familyRolesPackRelPaths: [
                'profiles/ofp/nextgensim-emb-110p-bandeirante.json',
                'profiles/ofp/nextgensim-emb-110p1f-bandeirante.json',
              ],
              simbriefIcao: 'E110',
              simbriefAirframeMatch: 'Default',
            },
            {
              typeId: 'keep-me',
              aircraftClassId: 'light_ga',
              label: 'Keep Me',
              rolesPackRelPath: 'profiles/ofp/keep-me.json',
              simbriefIcao: 'C172',
              simbriefAirframeMatch: 'Default',
            },
          ],
          null,
          2,
        ) + '\n',
        'utf8',
      );
      for (const stem of [
        'nextgensim-emb-110p1f-bandeirante',
        'nextgensim-emb-110p-bandeirante',
      ]) {
        await writeFile(join(ofpDir, `${stem}.json`), '{}\n', 'utf8');
        await writeFile(join(examplesDir, `${stem}.json`), '{}\n', 'utf8');
        await writeFile(join(notesDir, `${stem}.md`), '# note\n', 'utf8');
      }

      const result = await removeCareerPlayerAirframeFamily({
        repoRoot,
        typeId: 'nextgensim-emb-110p1f-bandeirante',
      });
      assert.equal(result.typeId, 'nextgensim-emb-110p1f-bandeirante');
      assert.ok(result.deletedPaths.length >= 6);
      assert.ok(
        result.deletedPaths.some((p) =>
          p.includes('nextgensim-emb-110p1f-bandeirante.json'),
        ),
      );
      assert.ok(
        result.deletedPaths.some((p) =>
          p.includes('nextgensim-emb-110p-bandeirante.json'),
        ),
      );

      const saved = JSON.parse(
        await readFile(join(catalogDir, 'career-player-airframes.json'), 'utf8'),
      ) as Array<{ typeId: string }>;
      assert.deepEqual(
        saved.map((r) => r.typeId),
        ['keep-me'],
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('removes sibling example profiles matched by pack matchTitles', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'skyline-remove-sib-'));
    try {
      const catalogDir = join(repoRoot, 'packages', 'shared', 'src', 'data');
      const ofpDir = join(repoRoot, 'profiles', 'ofp');
      const examplesDir = join(repoRoot, 'profiles', 'examples');
      await mkdir(catalogDir, { recursive: true });
      await mkdir(ofpDir, { recursive: true });
      await mkdir(examplesDir, { recursive: true });
      await writeFile(
        join(catalogDir, 'career-player-airframes.json'),
        JSON.stringify(
          [
            {
              typeId: 'blacksquare-commander-114',
              aircraftClassId: 'light_ga',
              label: 'Commander 114',
              rolesPackRelPath: 'profiles/ofp/blacksquare-commander-114.json',
              simbriefIcao: 'C182',
              simbriefAirframeMatch: 'Default',
            },
          ],
          null,
          2,
        ) + '\n',
        'utf8',
      );
      await writeFile(
        join(ofpDir, 'blacksquare-commander-114.json'),
        JSON.stringify(
          {
            ofpId: 'blacksquare-commander-114',
            matchTitles: [
              'Black Square Commander 114',
              'Black Square Commander 114TC',
            ],
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      await writeFile(
        join(examplesDir, 'blacksquare-commander-114.json'),
        JSON.stringify(
          {
            profileId: 'blacksquare-commander-114',
            profileKey: 'blacksquare/commander-114',
            match: { title: 'Black Square Commander 114' },
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      await writeFile(
        join(examplesDir, 'blacksquare-commander-114tc.json'),
        JSON.stringify(
          {
            profileId: 'blacksquare-commander-114tc',
            profileKey: 'blacksquare/commander-114tc',
            match: { title: 'Black Square Commander 114TC' },
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      await writeFile(
        join(examplesDir, 'unrelated-keep.json'),
        JSON.stringify(
          {
            profileId: 'unrelated-keep',
            profileKey: 'other/keep',
            match: { title: 'Unrelated Keep' },
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      const result = await removeCareerPlayerAirframeFamily({
        repoRoot,
        typeId: 'blacksquare-commander-114',
      });
      assert.ok(
        result.deletedPaths.some((p) =>
          p.includes('blacksquare-commander-114tc.json'),
        ),
      );
      assert.ok(
        result.deletedPaths.some((p) =>
          p.includes('blacksquare-commander-114.json'),
        ),
      );
      await readFile(join(examplesDir, 'unrelated-keep.json'), 'utf8');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
