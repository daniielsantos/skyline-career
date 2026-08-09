import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const examplesDir = join(root, 'profiles', 'examples');
const schemaPath = join(root, 'profiles', 'schema', 'aircraft-profile.schema.json');

const REQUIRED_TOP_LEVEL = [
  'schemaVersion',
  'profileId',
  'profileKey',
  'semver',
  'match',
  'capabilities',
  'gating',
  'fuel',
  'payload',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Skyline inject profiles need non-empty write plans; EFB/native-simbrief may be empty. */
function requiresInjectWritePlans(profile) {
  if (profile.injectCapable === false) return false;
  if (profile.loadMethod === 'native-simbrief') return false;
  // Monitor-only homologation: tanks are read-only (no writeVar) and write plans stay empty.
  const tanks = Array.isArray(profile.fuel?.tanks) ? profile.fuel.tanks : [];
  const readOnlyFuel =
    tanks.length > 0 && tanks.every((tank) => !tank?.writeVar);
  if (
    readOnlyFuel &&
    Array.isArray(profile.fuel?.writePlan) &&
    profile.fuel.writePlan.length === 0 &&
    Array.isArray(profile.payload?.writePlan) &&
    profile.payload.writePlan.length === 0
  ) {
    return false;
  }
  return true;
}

function validateProfile(profile, fileName) {
  for (const key of REQUIRED_TOP_LEVEL) {
    assert(profile[key] !== undefined, `${fileName}: missing ${key}`);
  }

  assert(profile.schemaVersion === '1.0.0', `${fileName}: unsupported schemaVersion`);
  assert(/^\d+\.\d+\.\d+/.test(profile.semver), `${fileName}: invalid semver`);
  assert(/^[a-f0-9]{64}$/.test(profile.match.fingerprint), `${fileName}: invalid fingerprint`);

  assert(Array.isArray(profile.fuel.tanks) && profile.fuel.tanks.length > 0, `${fileName}: fuel.tanks required`);
  assert(Array.isArray(profile.fuel.writePlan), `${fileName}: fuel.writePlan must be an array`);
  assert(Array.isArray(profile.payload.writePlan), `${fileName}: payload.writePlan must be an array`);
  if (requiresInjectWritePlans(profile)) {
    assert(
      profile.fuel.writePlan.length > 0,
      `${fileName}: fuel.writePlan required (inject profiles)`,
    );
    assert(
      profile.payload.writePlan.length > 0,
      `${fileName}: payload.writePlan required (inject profiles)`,
    );
  }

  return true;
}

const schemaRaw = await readFile(schemaPath, 'utf8');
assert(schemaRaw.includes('AircraftProfile'), 'Schema file missing AircraftProfile title');

const files = (await readdir(examplesDir)).filter((f) => f.endsWith('.json'));
let ok = 0;

for (const file of files) {
  const content = await readFile(join(examplesDir, file), 'utf8');
  const profile = JSON.parse(content);
  validateProfile(profile, file);
  ok += 1;
  console.log(`OK  ${file}`);
}

console.log(`Validated ${ok} profile(s).`);
