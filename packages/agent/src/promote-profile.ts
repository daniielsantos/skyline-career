import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { AircraftProfile, FuelTankProfile } from '@msfs-compat/shared';
import { normalizeAircraftTitle } from '@msfs-compat/shared';

export function cleanIcaoCode(options: {
  icao?: string | null;
  atcModel?: string | null;
  title?: string;
}): string {
  // Prefer an already-clean designator (wizard-confirmed / profile value).
  const explicit = sanitizeIcaoToken(options.icao ?? '');
  if (
    explicit &&
    /^[A-Z0-9]{2,6}$/i.test(explicit) &&
    !/ATCCOM/i.test(explicit) &&
    explicit.toUpperCase() !== 'ZZZZ'
  ) {
    return explicit.toUpperCase();
  }

  const title = options.title ?? '';
  // Well-known type mappings when ATC MODEL is a vendor string.
  if (/phenom\s*300/i.test(title) || /phenom\s*300/i.test(options.atcModel ?? '')) {
    return 'E55P';
  }

  const candidates = [options.icao, options.atcModel].filter(Boolean) as string[];
  for (const raw of candidates) {
    const cleaned = sanitizeIcaoToken(raw);
    const model = cleaned.match(/AC_MODEL[_ .\-]?([A-Z0-9]{2,6})/i);
    if (model?.[1]) return model[1].toUpperCase();
    if (/^[A-Z0-9]{2,6}$/i.test(cleaned) && !/ATCCOM/i.test(cleaned)) {
      return cleaned.toUpperCase();
    }
  }
  const fromTitle = title.match(/\b([A-Z]{1,2}\d{1,3}[A-Z]?)\b/i);
  return fromTitle?.[1]?.toUpperCase() ?? 'ZZZZ';
}

/** Strip vendor noise from ATC/ICAO tokens (`$$:`, trailing `+`, etc.). */
function sanitizeIcaoToken(raw: string): string {
  return raw
    .replace(/^\$\$:/, '')
    .replace(/\++$/g, '')
    .trim();
}

/** Normalize a user-entered ICAO type designator for catalog / SimBrief. */
export function normalizeConfirmedIcao(raw: string, fallback = 'ZZZZ'): string {
  const cleaned = sanitizeIcaoToken(raw).toUpperCase();
  if (/^[A-Z0-9]{2,6}$/.test(cleaned)) return cleaned;
  return fallback;
}

export function notesFileStem(profile: AircraftProfile): string {
  return profile.profileId || profile.profileKey.replace(/\//g, '-');
}

export async function ensureAuxTanks(
  profile: AircraftProfile,
  capacities: { left?: number; right?: number },
): Promise<AircraftProfile> {
  const tanks = [...profile.fuel.tanks];
  const add = (id: string, name: string, capacity: number, quantityVar: string) => {
    if (tanks.some((t) => t.id === id)) return;
    const tank: FuelTankProfile = {
      id,
      name,
      capacity,
      readVar: quantityVar,
      readUnit: 'gallons',
      writeVar: quantityVar,
      writeUnit: 'gallons',
    };
    tanks.push(tank);
    // Insert writes before trailing delay
    const delayIdx = profile.fuel.writePlan.findIndex((s) => s.op === 'delay');
    const step = {
      op: 'simvar_set' as const,
      var: quantityVar,
      unit: 'gallons',
      valueExpr: `{${id}}`,
    };
    if (delayIdx >= 0) profile.fuel.writePlan.splice(delayIdx, 0, step);
    else profile.fuel.writePlan.push(step);
    profile.fuel.verify.checks.push({
      var: quantityVar,
      unit: 'gallons',
      tolerancePct: 2,
      valueExpr: `{${id}}`,
    });
  };

  if (capacities.left && capacities.left >= 5) {
    add('LEFT_AUX', 'Left Aux / Aft', capacities.left, 'FUEL TANK LEFT AUX QUANTITY');
  }
  if (capacities.right && capacities.right >= 5) {
    add('RIGHT_AUX', 'Right Aux / Aft', capacities.right, 'FUEL TANK RIGHT AUX QUANTITY');
  }
  profile.fuel.tanks = tanks;
  return profile;
}

export async function promoteDraftProfile(options: {
  draftPath: string;
  examplesDir: string;
  notesDir: string;
  repoRoot: string;
  identityTitle?: string;
  /** Preferred catalog title (already stripped of livery). */
  matchTitle?: string;
  atcModel?: string | null;
  icao?: string | null;
  discoveryNotes?: string[];
  runSeed?: boolean;
}): Promise<{ examplePath: string; notesPath: string; profile: AircraftProfile }> {
  const profile = JSON.parse(await readFile(options.draftPath, 'utf8')) as AircraftProfile;

  profile.semver = '1.0.0';
  const title = normalizeAircraftTitle(
    options.matchTitle ?? profile.match.title ?? profile.displayName ?? profile.profileId,
  );
  profile.match.title = title;
  profile.match.icao = options.icao
    ? normalizeConfirmedIcao(options.icao, cleanIcaoCode({ icao: options.icao, atcModel: options.atcModel, title }))
    : cleanIcaoCode({
        icao: profile.match.icao,
        atcModel: options.atcModel,
        title,
      });
  profile.displayName = `${title} (MSFS 2024)`;
  const stem = notesFileStem(profile);
  profile.notes = [
    `Homologated via wizard: ${title}.`,
    `ICAO type designator (catalog/SimBrief): ${profile.match.icao}.`,
    ...(options.discoveryNotes ?? []),
    `See profiles/notes/${stem}.md`,
  ];

  await mkdir(options.examplesDir, { recursive: true });
  await mkdir(options.notesDir, { recursive: true });

  const examplePath = join(options.examplesDir, basename(options.draftPath));
  await writeFile(examplePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  await unlink(options.draftPath);

  const notesPath = join(options.notesDir, `${stem}.md`);
  await writeFile(notesPath, buildNotesMarkdown(profile, options, basename(options.draftPath)), 'utf8');

  await runNodeScript(options.repoRoot, 'scripts/backfill-fingerprints.mjs');
  const updated = JSON.parse(await readFile(examplePath, 'utf8')) as AircraftProfile;

  if (options.runSeed !== false) {
    try {
      await runNodeScript(options.repoRoot, 'scripts/db-seed-profiles.mjs');
    } catch (err) {
      console.warn(
        `[promote] db:seed skipped/failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { examplePath, notesPath, profile: updated };
}

function buildNotesMarkdown(
  profile: AircraftProfile,
  options: { identityTitle?: string; discoveryNotes?: string[] },
  exampleFile: string,
): string {
  const tanks = profile.fuel.tanks
    .map((t) => `| \`${t.readVar}\` | ${t.capacity ?? '?'} | ${t.id} |`)
    .join('\n');
  const extra = (options.discoveryNotes ?? []).map((n) => `- ${n}`).join('\n');

  return `# ${profile.match.title} — discovery

**In-sim title (example):** \`${options.identityTitle ?? profile.match.title}\`  
**Match title:** \`${profile.match.title}\`  
**ICAO (SimBrief type):** \`${profile.match.icao ?? ''}\`  
**Publisher:** \`${profile.match.publisher}\`  
**Stations:** ${profile.payload.stations.length}  
**Profile:** \`${profile.profileKey}@${profile.semver}\`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
${tanks}

## Notes

${extra || '- Homologated via interactive wizard.'}

## Homologated

- \`profiles/examples/${exampleFile}\`
`;
}

function runNodeScript(repoRoot: string, relativeScript: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(repoRoot, relativeScript)], {
      cwd: repoRoot,
      stdio: 'inherit',
      windowsHide: true,
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${relativeScript} exited ${code}`));
    });
    child.on('error', reject);
  });
}
