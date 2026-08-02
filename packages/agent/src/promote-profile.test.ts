import assert from 'node:assert/strict';
import test from 'node:test';
import type { AircraftProfile } from '@msfs-compat/shared';
import { pickHomologationOverwriteTarget, type ExistingExampleProfile } from './promote-profile.js';

function stub(
  file: string,
  profileKey: string,
  publisher: string,
  fingerprint?: string,
): ExistingExampleProfile {
  return {
    path: `/tmp/${file}`,
    file,
    profile: {
      profileKey,
      profileId: profileKey.replace(/\//g, '-'),
      match: { title: 'C400 Corvalis', publisher, fingerprint, icao: 'BE36' },
    } as AircraftProfile,
  };
}

const FP_ASOBO = 'a'.repeat(64);
const FP_CARE = 'b'.repeat(64);

test('pickHomologationOverwriteTarget prefers live fingerprint', () => {
  const asobo = stub('asobo-c400.json', 'asobo/c400-corvalis', 'asobo', FP_ASOBO);
  const carenado = stub('carenado-c400.json', 'carenado/c400-corvalis', 'carenado', FP_CARE);
  const picked = pickHomologationOverwriteTarget(
    [carenado, asobo],
    {
      profileKey: 'carenado/c400-corvalis',
      match: { title: 'C400 Corvalis', publisher: 'carenado' },
    } as AircraftProfile,
    FP_ASOBO,
  );
  assert.equal(picked?.profile.profileKey, 'asobo/c400-corvalis');
});

test('pickHomologationOverwriteTarget falls back to profileKey then publisher', () => {
  const asobo = stub('asobo-c400.json', 'asobo/c400-corvalis', 'asobo', FP_ASOBO);
  const carenado = stub('carenado-c400.json', 'carenado/c400-corvalis', 'carenado', FP_CARE);
  assert.equal(
    pickHomologationOverwriteTarget(
      [asobo, carenado],
      {
        profileKey: 'carenado/c400-corvalis',
        match: { title: 'C400 Corvalis', publisher: 'carenado' },
      } as AircraftProfile,
    )?.profile.profileKey,
    'carenado/c400-corvalis',
  );
  assert.equal(
    pickHomologationOverwriteTarget(
      [asobo],
      {
        profileKey: 'other/c400-corvalis',
        match: { title: 'C400 Corvalis', publisher: 'asobo' },
      } as AircraftProfile,
    )?.profile.profileKey,
    'asobo/c400-corvalis',
  );
});
