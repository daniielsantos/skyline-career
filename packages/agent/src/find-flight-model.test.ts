import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  airplaneFolderFromCfgPath,
  findFlightModelCandidates,
  parseInstalledPackagesPath,
  scorePathAgainstTokens,
  titleSearchTokens,
} from './find-flight-model.js';

describe('parseInstalledPackagesPath', () => {
  it('reads same-line and next-line InstalledPackagesPath', () => {
    assert.equal(
      parseInstalledPackagesPath('InstalledPackagesPath "D:\\MSFS2024\\Packages"'),
      'D:\\MSFS2024\\Packages',
    );
    assert.equal(
      parseInstalledPackagesPath('InstalledPackagesPath\n  "E:/Packages"\n'),
      'E:/Packages',
    );
    assert.equal(parseInstalledPackagesPath('nope'), undefined);
  });
});

describe('titleSearchTokens / scorePathAgainstTokens', () => {
  it('adds Black Square shorthand and prefers non-TC folders', () => {
    const tokens = titleSearchTokens('Black Square Bonanza A36');
    assert.ok(tokens.includes('bksq'));
    assert.ok(tokens.includes('bonanza'));

    const pro = scorePathAgainstTokens('bksq-aircraft-bonanzapro', tokens);
    const tc = scorePathAgainstTokens('bksq-aircraft-bonanzatc', tokens);
    assert.ok(pro > tc);
  });
});

describe('findFlightModelCandidates', () => {
  it('finds cfg under Community2024 ranked by title tokens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-'));
    const planeDir = join(
      root,
      'Community2024',
      'bksq-aircraft-bonanzapro',
      'SimObjects',
      'Airplanes',
      'bksq-aircraft-bonanzapro',
    );
    await mkdir(planeDir, { recursive: true });
    const cfg = join(planeDir, 'flight_model.cfg');
    await writeFile(cfg, '[WEIGHT_AND_BALANCE]\nCG_forward_limit = 0.1\n', 'utf8');

    const decoyDir = join(
      root,
      'Community2024',
      'asobo-aircraft-c172sp-asobo',
      'SimObjects',
      'Airplanes',
      'Asobo_C172sp_Asobo',
    );
    await mkdir(decoyDir, { recursive: true });
    await writeFile(
      join(decoyDir, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(
      root,
      'Black Square Bonanza A36 Professional',
    );
    assert.ok(found.length >= 1);
    assert.equal(found[0]!.airplaneFolder, 'bksq-aircraft-bonanzapro');
    assert.equal(found[0]!.rootKind, 'Community2024');
    assert.equal(airplaneFolderFromCfgPath(found[0]!.path), 'bksq-aircraft-bonanzapro');
  });
});
