/**
 * Locate MSFS flight_model.cfg under Community / Official packages.
 * Resolves InstalledPackagesPath from UserCfg.opt so paths work on any PC.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { AskFn } from './prompt.js';

const PACKAGE_ROOT_NAMES = [
  'Community2024',
  'Community',
  'Official2024',
  'Official2020',
  'Official',
] as const;

export type FlightModelCandidate = {
  path: string;
  packageName: string;
  airplaneFolder: string;
  rootKind: string;
  score: number;
};

function envPath(...parts: string[]): string {
  return join(...parts);
}

/** Candidate UserCfg.opt locations for MSFS 2024 (Steam + Store). */
export function listMsfsUserCfgCandidates(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const local = env.LOCALAPPDATA;
  const roaming = env.APPDATA ?? (homedir() ? join(homedir(), 'AppData', 'Roaming') : undefined);
  const out: string[] = [];
  if (roaming) {
    out.push(envPath(roaming, 'Microsoft Flight Simulator 2024', 'UserCfg.opt'));
  }
  if (local) {
    out.push(
      envPath(
        local,
        'Packages',
        'Microsoft.Limitless_8wekyb3d8bbwe',
        'LocalCache',
        'UserCfg.opt',
      ),
    );
  }
  return out;
}

export function parseInstalledPackagesPath(userCfgText: string): string | undefined {
  const sameLine = /InstalledPackagesPath\s+"([^"]+)"/i.exec(userCfgText);
  if (sameLine?.[1]) return sameLine[1].trim();
  const nextLine = /InstalledPackagesPath\s*[\r\n]+\s*"([^"]+)"/i.exec(userCfgText);
  return nextLine?.[1]?.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveInstalledPackagesPath(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ packagesRoot: string; userCfgPath: string } | undefined> {
  for (const cfgPath of listMsfsUserCfgCandidates(env)) {
    if (!(await pathExists(cfgPath))) continue;
    const text = await readFile(cfgPath, 'utf8');
    const packagesRoot = parseInstalledPackagesPath(text);
    if (packagesRoot && (await pathExists(packagesRoot))) {
      return { packagesRoot, userCfgPath: cfgPath };
    }
  }
  return undefined;
}

/** Tokens used to rank package / airplane folder names against the live title. */
export function titleSearchTokens(title: string): string[] {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const raw = normalized.split(/\s+/).filter((t) => t.length >= 2);
  const stop = new Set([
    'the',
    'and',
    'for',
    'msfs',
    'aircraft',
    'airplane',
    'professional',
    'pro',
    'default',
    'asobo',
  ]);
  const tokens = raw.filter((t) => !stop.has(t) && !/^[nN]\d/.test(t));
  // Common vendor shorthand seen in Community folder names.
  if (tokens.includes('black') && tokens.includes('square')) {
    tokens.push('bksq', 'blacksquare');
  }
  if (tokens.includes('bonanza')) tokens.push('bonanzapro', 'bonanza');
  if (tokens.includes('caravan')) tokens.push('caravanpro', 'caravan');
  return [...new Set(tokens)];
}

export function scorePathAgainstTokens(pathOrName: string, tokens: string[]): number {
  const hay = pathOrName.toLowerCase().replace(/\\/g, '/');
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length >= 5 ? 3 : 2;
  }
  // Prefer non-turbo / non-turbine folders when title does not mention them.
  if (!tokens.some((t) => t.includes('turbo') || t.includes('turbine'))) {
    if (/turbo|turbine|tc\b/.test(hay)) score -= 4;
  }
  if (/simobjects\/airplanes\//i.test(hay)) score += 1;
  return score;
}

async function listImmediateDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

async function collectFlightModelsUnderPackage(
  packageDir: string,
  rootKind: string,
  tokens: string[],
): Promise<FlightModelCandidate[]> {
  const airplanesRoot = join(packageDir, 'SimObjects', 'Airplanes');
  if (!(await pathExists(airplanesRoot))) {
    // Some packages nest SimObjects one level deeper — shallow walk.
    const nested: FlightModelCandidate[] = [];
    for (const child of await listImmediateDirs(packageDir)) {
      const nestedAirplanes = join(child, 'SimObjects', 'Airplanes');
      if (await pathExists(nestedAirplanes)) {
        nested.push(
          ...(await collectFlightModelsUnderPackage(child, rootKind, tokens)),
        );
      }
    }
    return nested;
  }

  const packageName = basename(packageDir);
  const out: FlightModelCandidate[] = [];
  for (const airplaneDir of await listImmediateDirs(airplanesRoot)) {
    const cfg = join(airplaneDir, 'flight_model.cfg');
    if (!(await pathExists(cfg))) continue;
    const airplaneFolder = basename(airplaneDir);
    const score =
      scorePathAgainstTokens(packageName, tokens) +
      scorePathAgainstTokens(airplaneFolder, tokens) +
      scorePathAgainstTokens(cfg, tokens);
    out.push({
      path: cfg,
      packageName,
      airplaneFolder,
      rootKind,
      score,
    });
  }
  return out;
}

/**
 * Search Community/Official package trees for flight_model.cfg ranked by aircraft title.
 */
export async function findFlightModelCandidates(
  packagesRoot: string,
  aircraftTitle: string,
  opts: { minScore?: number; maxPackagesToScan?: number } = {},
): Promise<FlightModelCandidate[]> {
  const tokens = titleSearchTokens(aircraftTitle);
  const minScore = opts.minScore ?? 1;
  const maxPackagesToScan = opts.maxPackagesToScan ?? 40;
  const found: FlightModelCandidate[] = [];

  for (const rootName of PACKAGE_ROOT_NAMES) {
    const root = join(packagesRoot, rootName);
    if (!(await pathExists(root))) continue;
    const packageDirs = await listImmediateDirs(root);
    const ranked = packageDirs
      .map((dir) => ({
        dir,
        score: scorePathAgainstTokens(basename(dir), tokens),
      }))
      .sort((a, b) => b.score - a.score);

    const toScan = [
      ...ranked.filter((r) => r.score >= minScore),
      // If nothing matched tokens, still scan a capped set so empty Community isn't silent forever.
      ...(ranked.every((r) => r.score < minScore) ? ranked.slice(0, 8) : []),
    ].slice(0, maxPackagesToScan);

    const seen = new Set<string>();
    for (const item of toScan) {
      if (seen.has(item.dir)) continue;
      seen.add(item.dir);
      found.push(
        ...(await collectFlightModelsUnderPackage(item.dir, rootName, tokens)),
      );
    }
  }

  found.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  // Deduplicate identical paths.
  const uniq = new Map<string, FlightModelCandidate>();
  for (const c of found) {
    const prev = uniq.get(c.path);
    if (!prev || c.score > prev.score) uniq.set(c.path, c);
  }
  return [...uniq.values()];
}

export async function promptFlightModelPath(
  ask: AskFn,
  aircraftTitle: string,
): Promise<string | undefined> {
  console.log('  Searching MSFS Community/Official for flight_model.cfg…');
  const resolved = await resolveInstalledPackagesPath();
  if (!resolved) {
    console.log('  Could not resolve InstalledPackagesPath from UserCfg.opt.');
    console.log('  Tip: Steam → %APPDATA%\\Microsoft Flight Simulator 2024\\UserCfg.opt');
    const manual = await ask('flight_model.cfg path (blank to skip)');
    return manual.trim().replace(/^"(.*)"$/, '$1') || undefined;
  }

  printInstalled(resolved);
  let candidates = await findFlightModelCandidates(
    resolved.packagesRoot,
    aircraftTitle,
  );

  if (candidates.length === 0) {
    const keyword = (
      await ask('No matches. Optional search keyword (blank to skip search)', '')
    ).trim();
    if (keyword) {
      candidates = await findFlightModelCandidates(
        resolved.packagesRoot,
        `${aircraftTitle} ${keyword}`,
      );
    }
  }

  if (candidates.length === 0) {
    console.log('  No flight_model.cfg found under Community/Official.');
    console.log(
      '  For streamed Marketplace aircraft, enable DevMode VFS Projector and paste a path, or skip.',
    );
    const manual = await ask('flight_model.cfg path (blank to skip)');
    return manual.trim().replace(/^"(.*)"$/, '$1') || undefined;
  }

  const top = candidates.slice(0, 12);
  console.log('  Candidates (best match first):');
  top.forEach((c, i) => {
    console.log(
      `    ${String(i + 1).padStart(2)}. [${c.rootKind}] ${c.airplaneFolder}  (score ${c.score})`,
    );
    console.log(`        ${c.path}`);
  });

  const choice = (
    await ask(
      'Choose number, paste a path, or blank to skip',
      top[0] ? '1' : '',
    )
  ).trim();
  if (!choice) return undefined;

  const asNum = Number(choice);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= top.length) {
    return top[asNum - 1]!.path;
  }
  return choice.replace(/^"(.*)"$/, '$1');
}

function printInstalled(resolved: {
  packagesRoot: string;
  userCfgPath: string;
}): void {
  console.log(`  UserCfg: ${resolved.userCfgPath}`);
  console.log(`  Packages: ${resolved.packagesRoot}`);
}

/** Exported for tests — airplane folder name from a cfg path. */
export function airplaneFolderFromCfgPath(cfgPath: string): string {
  return basename(dirname(cfgPath));
}
