/**
 * Locate MSFS flight_model.cfg under Community / Official packages,
 * and optionally under DevMode VFSProjection (streamed/official cfgs).
 * Resolves InstalledPackagesPath from UserCfg.opt so paths work on any PC.
 */
import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { AskFn } from './prompt.js';
import {
  findAircraftCfgNearFlightModel,
  isValidUiFuelBurnRateLbPerHour,
  parseAircraftCfgUiText,
} from './parse-aircraft-cfg-ui.js';

const PACKAGE_ROOT_NAMES = [
  'Community2024',
  'Community',
  'Official2024',
  'Official2020',
  'Official',
] as const;

/** RootKind for DevMode VFS Projector mounts (sim running). */
export const VFS_PROJECTION_ROOT_KIND = 'VFSProjection';

export type FlightModelCandidate = {
  path: string;
  packageName: string;
  airplaneFolder: string;
  rootKind: string;
  score: number;
};

/** One pickable row after collapsing identical file contents. */
export type FlightModelCandidateGroup = {
  primary: FlightModelCandidate;
  /** SHA-256 of file bytes (short prefix used in UI). */
  contentHash: string;
  byteLength: number;
  /** Other candidates with the exact same bytes. */
  duplicates: FlightModelCandidate[];
  /** Tiny / MODULAR_MERGE-only cfg with no WEIGHT_AND_BALANCE. */
  stub: boolean;
  /** VFS padlock / Access Denied — path exists but content unread. */
  locked?: boolean;
  /** Human hint of what the cfg actually declares (W&B, stations, tanks). */
  summary?: string;
  /** Best nearby aircraft.cfg (modular common/ preferred). */
  aircraftCfgPath?: string;
  /** Range/burn from that aircraft.cfg, when readable. */
  catalogPerfSummary?: string;
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

/**
 * Candidate VFSProjection roots (DevMode → Tools → Virtual File System → Start).
 * Scoped later to simobjects/airplanes — never walk the whole VFS tree.
 */
export function listMsfsVfsProjectionCandidates(
  env: NodeJS.ProcessEnv = process.env,
  packagesRoot?: string,
): string[] {
  const out: string[] = [];
  const push = (p: string) => {
    const abs = resolve(p);
    if (!out.includes(abs)) out.push(abs);
  };
  if (packagesRoot) {
    push(join(packagesRoot, '..', 'VFSProjection'));
  }
  const roaming =
    env.APPDATA ??
    (homedir() ? join(homedir(), 'AppData', 'Roaming') : undefined);
  if (roaming) {
    push(join(roaming, 'Microsoft Flight Simulator 2024', 'VFSProjection'));
  }
  const local = env.LOCALAPPDATA;
  if (local) {
    push(
      join(
        local,
        'Packages',
        'Microsoft.Limitless_8wekyb3d8bbwe',
        'LocalCache',
        'VFSProjection',
      ),
    );
  }
  return out;
}

/** First existing VFSProjection folder, or undefined when Projector is off. */
export async function resolveMsfsVfsProjectionPath(
  env: NodeJS.ProcessEnv = process.env,
  packagesRoot?: string,
): Promise<string | undefined> {
  for (const candidate of listMsfsVfsProjectionCandidates(env, packagesRoot)) {
    if (await pathExists(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Community package-folder prefixes keyed by catalog publisher slug.
 * Used to avoid scanning rival vendors (e.g. blackbox when homologating blacksquare).
 */
export const PUBLISHER_PACKAGE_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  blacksquare: ['bksq-', 'blacksquare'],
  blackbox: ['blackbox', 'bbs_'],
  a2a: ['a2a-'],
  pmdg: ['pmdg-'],
  fenix: ['fnx-', 'fenix'],
  inibuilds: ['inibuilds-'],
  nextgensim: ['nextgensim-', 'ngs-'],
  flightfx: ['flightfx-', 'ffx-'],
  workingtitle: ['workingtitle-', 'wt-'],
  orbx: ['orbx-'],
  hype: ['hype-', 'hypeperformance'],
  miltech: ['miltech'],
  fsreborn: ['fsreborn'],
  carenado: ['carenado', 'microsoft-', 'microsoft_'],
  asobo: ['asobo-', 'asobo_', 'microsoft-', 'microsoft_'],
  microsoft: ['microsoft-', 'microsoft_', 'asobo-', 'asobo_', 'carenado'],
  aerosoft: ['aerosoft-'],
  justflight: ['justflight', 'just-flight', 'jf-'],
  flysimware: ['flysimware', 'fsw-'],
  sws: ['sws-', 'sws_'],
};

/** Tokens that only identify a vendor — not enough to keep an airplane folder. */
const VENDOR_ONLY_TOKENS = new Set([
  'bksq',
  'blacksquare',
  'blackbox',
  'blackboxsimulation',
  'bbs',
  'a2a',
  'pmdg',
  'fenix',
  'carenado',
  'asobo',
  'inibuilds',
  'nextgensim',
  'flightfx',
  'workingtitle',
  'orbx',
  'hype',
  'miltech',
  'fsreborn',
  'tfdi',
  'aerosoft',
  'microsoft',
  'justflight',
  'flysimware',
  'sws',
]);

export function packageMatchesPublisher(
  packageName: string,
  publisher: string | undefined,
): boolean {
  if (!publisher || publisher === 'other') return true;
  const hints = PUBLISHER_PACKAGE_PREFIXES[publisher.toLowerCase()];
  if (!hints?.length) return true;
  const hay = packageName.toLowerCase();
  return hints.some((h) => hay.includes(h.toLowerCase()));
}

/** Model/airframe tokens (excludes vendor shorthand) — used to drop sibling airframes. */
export function modelSearchTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !VENDOR_ONLY_TOKENS.has(t));
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
  // Glue model designators split by punctuation: "PC-24" → pc24, "C-408" → c408.
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i]!;
    const b = raw[i + 1]!;
    if (/^[a-z]+$/i.test(a) && /^\d{1,4}$/.test(b)) tokens.push(`${a}${b}`);
    if (/^\d{1,4}$/.test(a) && /^[a-z]+$/i.test(b)) tokens.push(`${a}${b}`);
  }
  // Common vendor shorthand seen in Community folder names.
  if (tokens.includes('black') && tokens.includes('square')) {
    tokens.push('bksq', 'blacksquare');
  }
  if (tokens.includes('black') && tokens.includes('box')) {
    tokens.push('blackbox', 'blackboxsimulation', 'bbs');
  }
  if (tokens.includes('bonanza')) tokens.push('bonanzapro', 'bonanza');
  if (tokens.includes('caravan')) tokens.push('caravanpro', 'caravan');
  if (tokens.includes('baron')) tokens.push('baronpro', 'baron');
  if (tokens.includes('duke')) {
    tokens.push('pistonduke', 'stockduke', 'grandduke', 'turbineduke');
  }
  if (tokens.includes('islander') || tokens.includes('bn2') || tokens.includes('bn')) {
    tokens.push('islander', 'bn2', 'bn2islander', 'bbs_bn2', 'bbs-bn2');
  }
  // Analogue panel variants often live under "steam" preset folders.
  if (tokens.includes('analogue') || tokens.includes('analog')) {
    tokens.push('steam');
  }
  // Garmin glass -> Black Box / Working Title style g3000 preset folders.
  if (tokens.includes('garmin') || tokens.includes('g1000') || tokens.includes('g3000')) {
    tokens.push('garmin', 'g3000', 'g1000');
  }
  if (tokens.includes('tip') && tokens.includes('tanks')) {
    tokens.push('tiptank', 'tiptanks');
  }

  // Drop ambiguous fragments that collide across vendors once shorthand exists.
  // "black" alone matches both bksq-* and blackboxsimulation-*.
  const drop = new Set<string>();
  if (tokens.includes('bksq') || tokens.includes('blacksquare')) {
    drop.add('black');
    drop.add('square');
  }
  if (tokens.includes('blackbox') || tokens.includes('bbs')) {
    drop.add('black');
    drop.add('box');
  }
  // Bare "24" from "PC-24" matches every *2024* / *islander24* package — keep pc24 only.
  const hasGluedModel = tokens.some((t) => /^[a-z]+\d+$/i.test(t) || /^\d+[a-z]+$/i.test(t));
  if (hasGluedModel) {
    for (const t of tokens) {
      if (/^\d{2,4}$/.test(t)) drop.add(t);
    }
  }

  return [...new Set(tokens.filter((t) => !drop.has(t)))];
}

export function scorePathAgainstTokens(pathOrName: string, tokens: string[]): number {
  const hay = pathOrName.toLowerCase().replace(/\\/g, '/');
  let score = 0;
  for (const token of tokens) {
    if (!hay.includes(token)) continue;
    // Prefer glued model ids (pc24, c408) over short ambiguous fragments (pc, cargo).
    if (/^[a-z]+\d{2,4}$/i.test(token) || /^\d{2,4}[a-z]+$/i.test(token)) {
      score += 6;
    } else {
      score += token.length >= 5 ? 3 : 2;
    }
  }
  // Prefer non-turbo / non-turbine folders when title does not mention them.
  if (!tokens.some((t) => t.includes('turbo') || t.includes('turbine'))) {
    if (/turbo|turbine|tc\b/.test(hay)) score -= 4;
  }
  // B60 Duke (stock/piston) vs Grand Duke — title usually names one variant.
  const titleHasGrand = tokens.includes('grand');
  const wantsB60 = tokens.includes('b60');
  if (wantsB60 && !titleHasGrand) {
    if (/stockduke|pistonduke/.test(hay)) score += 5;
    if (/grandduke/.test(hay)) score -= 3;
  }
  if (titleHasGrand && /grandduke/.test(hay)) score += 5;
  // Prefer the concrete preset/common cfg over an empty airplane-root stub.
  if (/\/presets\//i.test(hay)) score += 2;
  if (/\/common\/config\//i.test(hay)) score += 1;
  // Attachments usually hold the real WEIGHT_AND_BALANCE / fuel merge parts.
  if (/\/attachments\//i.test(hay)) score += 2;
  // AI traffic shells — never the player aircraft cfg.
  if (/passiveaircraft/i.test(hay)) score -= 30;
  // Prefer cargo preset when the live title says cargo.
  if (tokens.includes('cargo') && /cargo/i.test(hay)) score += 4;
  // When title is PC-24, demote PC-12 / PC-6 siblings that only share the "pc" prefix.
  for (const glued of tokens) {
    const m = /^([a-z]+)(\d{2,4})$/i.exec(glued);
    if (!m) continue;
    const prefix = m[1]!.toLowerCase();
    const wantNum = m[2]!;
    if (hay.includes(glued.toLowerCase())) {
      score += 18;
      continue;
    }
    const sibling = new RegExp(`${prefix}[-_]?(\\d{1,4})(?:\\b|_|-)`, 'i');
    const hit = sibling.exec(hay);
    if (hit && hit[1] !== wantNum) score -= 22;
  }
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

/**
 * Classic layout: Airplanes/<name>/flight_model.cfg
 * MSFS2024 modular: Airplanes/<name>/{common,presets,attachments}/.../flight_model.cfg
 */
async function listFlightModelCfgPaths(
  airplaneDir: string,
  maxDepth = 5,
): Promise<string[]> {
  const out: string[] = [];
  const rootCfg = join(airplaneDir, 'flight_model.cfg');
  if (await pathExists(rootCfg)) out.push(rootCfg);

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'flight_model.cfg') {
        out.push(abs);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(abs, depth + 1);
      }
    }
  }

  for (const bucket of ['common', 'presets', 'attachments'] as const) {
    await walk(join(airplaneDir, bucket), 1);
  }
  return [...new Set(out)];
}

/** Label shown in the wizard — airplane folder, or relative preset/common path. */
export function flightModelDisplayLabel(
  airplaneDir: string,
  cfgPath: string,
): string {
  const airplaneFolder = basename(airplaneDir);
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  const airplaneNorm = norm(airplaneDir).replace(/\/+$/, '');
  const cfgNorm = norm(cfgPath);
  if (!cfgNorm.startsWith(`${airplaneNorm}/`)) return airplaneFolder;
  const rel = cfgPath
    .replace(/\\/g, '/')
    .slice(airplaneDir.replace(/\\/g, '/').length + 1)
    .replace(/\/?flight_model\.cfg$/i, '');
  if (!rel) return airplaneFolder;
  return `${airplaneFolder}/${rel}`;
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
  const packageScore = scorePathAgainstTokens(packageName, tokens);
  const modelTokens = modelSearchTokens(tokens);
  const out: FlightModelCandidate[] = [];
  for (const airplaneDir of await listImmediateDirs(airplanesRoot)) {
    const airplaneFolder = basename(airplaneDir);
    const airplaneScore = scorePathAgainstTokens(airplaneFolder, tokens);
    // Skip airplanes that share no title tokens with the package or folder —
    // avoids dumping unrelated Community packages when the search falls back.
    if (packageScore <= 0 && airplaneScore <= 0) continue;

    // Vendor-only hits (e.g. bksq on Baron while searching Duke) are not enough.
    if (modelTokens.length > 0) {
      const modelPkg = scorePathAgainstTokens(packageName, modelTokens);
      const modelPlane = scorePathAgainstTokens(airplaneFolder, modelTokens);
      if (modelPkg <= 0 && modelPlane <= 0) continue;
    }

    for (const cfg of await listFlightModelCfgPaths(airplaneDir)) {
      const score =
        packageScore +
        airplaneScore +
        scorePathAgainstTokens(cfg, tokens);
      out.push({
        path: cfg,
        packageName,
        airplaneFolder: flightModelDisplayLabel(airplaneDir, cfg),
        rootKind,
        score,
      });
    }
  }
  return out;
}

/**
 * Scan DevMode VFSProjection/simobjects/airplanes only.
 * Padlocked / Access Denied files still appear as paths; grouping skips unreadable ones.
 * Scores are slightly demoted so Community/Official wins when content matches both.
 */
async function collectFlightModelsFromVfsProjection(
  vfsRoot: string,
  tokens: string[],
  opts: {
    publisher?: string;
    minScore?: number;
    maxAirplanesToScan?: number;
  } = {},
): Promise<FlightModelCandidate[]> {
  const airplanesRootCandidates = [
    join(vfsRoot, 'simobjects', 'airplanes'),
    join(vfsRoot, 'SimObjects', 'Airplanes'),
  ];
  let airplanesRoot: string | undefined;
  for (const candidate of airplanesRootCandidates) {
    if (await pathExists(candidate)) {
      airplanesRoot = candidate;
      break;
    }
  }
  if (!airplanesRoot) return [];

  const minScore = opts.minScore ?? 1;
  const maxAirplanesToScan = opts.maxAirplanesToScan ?? 40;
  const publisher = opts.publisher?.trim().toLowerCase() || undefined;
  const modelTokens = modelSearchTokens(tokens);

  const airplaneDirs = await listImmediateDirs(airplanesRoot);
  const ranked = airplaneDirs
    .map((dir) => {
      const name = basename(dir);
      return {
        dir,
        name,
        score: scorePathAgainstTokens(name, tokens),
        vendorOk: packageMatchesPublisher(name, publisher),
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const vendorHits = publisher ? ranked.filter((r) => r.vendorOk) : ranked;
  const pool = vendorHits.length > 0 ? vendorHits : ranked;
  const toScan = [
    ...pool.filter((r) => r.score >= minScore),
    ...(pool.every((r) => r.score < minScore) ? pool.slice(0, 8) : []),
  ].slice(0, maxAirplanesToScan);

  const out: FlightModelCandidate[] = [];
  const seen = new Set<string>();
  for (const item of toScan) {
    if (seen.has(item.dir)) continue;
    seen.add(item.dir);

    if (modelTokens.length > 0) {
      if (scorePathAgainstTokens(item.name, modelTokens) <= 0) continue;
    }

    for (const cfg of await listFlightModelCfgPaths(item.dir)) {
      const score =
        item.score +
        scorePathAgainstTokens(cfg, tokens) -
        // Prefer on-disk Community/Official when both surfaces exist.
        1;
      out.push({
        path: cfg,
        packageName: item.name,
        airplaneFolder: flightModelDisplayLabel(item.dir, cfg),
        rootKind: VFS_PROJECTION_ROOT_KIND,
        score,
      });
    }
  }
  return out;
}

export type FindFlightModelOptions = {
  minScore?: number;
  maxPackagesToScan?: number;
  /** Catalog publisher slug (e.g. blacksquare) — restricts package folders when possible. */
  publisher?: string;
  /**
   * DevMode VFSProjection root.
   * Omit or `false` = skip. Pass an absolute path to scan simobjects/airplanes
   * (homologate resolves this when the Projector mount is live).
   */
  vfsProjectionRoot?: string | false;
};

/**
 * Search Community/Official package trees (and optional VFSProjection) for flight_model.cfg.
 */
export async function findFlightModelCandidates(
  packagesRoot: string,
  aircraftTitle: string,
  opts: FindFlightModelOptions = {},
): Promise<FlightModelCandidate[]> {
  const tokens = titleSearchTokens(aircraftTitle);
  const minScore = opts.minScore ?? 1;
  const maxPackagesToScan = opts.maxPackagesToScan ?? 40;
  const publisher = opts.publisher?.trim().toLowerCase() || undefined;
  const found: FlightModelCandidate[] = [];

  for (const rootName of PACKAGE_ROOT_NAMES) {
    const root = join(packagesRoot, rootName);
    if (!(await pathExists(root))) continue;
    const packageDirs = await listImmediateDirs(root);
    const ranked = packageDirs
      .map((dir) => ({
        dir,
        score: scorePathAgainstTokens(basename(dir), tokens),
        vendorOk: packageMatchesPublisher(basename(dir), publisher),
      }))
      .sort((a, b) => b.score - a.score);

    const vendorHits = publisher
      ? ranked.filter((r) => r.vendorOk)
      : ranked;
    // Prefer publisher-scoped packages when any exist; otherwise fall back.
    const pool = vendorHits.length > 0 ? vendorHits : ranked;

    const toScan = [
      ...pool.filter((r) => r.score >= minScore),
      // If nothing matched tokens, still scan a capped set so empty Community isn't silent forever.
      ...(pool.every((r) => r.score < minScore) ? pool.slice(0, 8) : []),
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

  if (typeof opts.vfsProjectionRoot === 'string' && opts.vfsProjectionRoot) {
    found.push(
      ...(await collectFlightModelsFromVfsProjection(
        opts.vfsProjectionRoot,
        tokens,
        {
          publisher,
          minScore,
          maxAirplanesToScan: maxPackagesToScan,
        },
      )),
    );
  }

  found.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  // Deduplicate identical paths.
  const uniq = new Map<string, FlightModelCandidate>();
  for (const c of found) {
    const prev = uniq.get(c.path);
    if (!prev || c.score > prev.score) uniq.set(c.path, c);
  }
  // Drop token-only noise (e.g. unrelated packages from the fallback scan).
  return [...uniq.values()].filter((c) => c.score >= 3);
}

export function isModularFlightModelStub(text: string, byteLength: number): boolean {
  // Real merge parts can be small but still carry station arms / CG limits.
  if (/\[WEIGHT_AND_BALANCE\]/i.test(text) || /\[FUEL_SYSTEM\]/i.test(text)) {
    return false;
  }
  if (byteLength <= 200) return true;
  return /\[MODULAR_MERGE\]/i.test(text);
}

/** Last meaningful path segment — `.../f_cargo_steam_tiptank/config` → the preset name. */
function shortPresetLabel(airplaneFolder: string): string {
  const parts = airplaneFolder
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && !/^(config|common|presets|attachments|bbs)$/i.test(p));
  return parts[parts.length - 1] ?? airplaneFolder;
}

function num(text: string, key: string): number | undefined {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*(-?[\\d.]+)`, 'im').exec(text);
  const v = m?.[1] !== undefined ? Number(m[1]) : undefined;
  return Number.isFinite(v) ? v : undefined;
}

/** Percent points from an MSFS CG limit (0.17 → 17, already-17 stays 17). */
function macPercent(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 1 ? value : value * 100;
}

/**
 * One-line hint of what a modular cfg part actually declares, so the picker
 * shows the payload/fuel identity instead of only the folder name.
 */
export function summarizeFlightModelCfg(text: string): string | undefined {
  const bits: string[] = [];

  const mtow = num(text, 'max_gross_weight');
  const empty = num(text, 'empty_weight');
  if (mtow !== undefined || empty !== undefined) {
    const parts: string[] = [];
    if (mtow !== undefined) parts.push(`MTOW ${mtow} lb`);
    if (empty !== undefined) parts.push(`empty ${empty} lb`);
    bits.push(parts.join(' / '));
  }

  const fwd = macPercent(num(text, 'CG_forward_limit'));
  const aft = macPercent(num(text, 'CG_aft_limit'));
  if (fwd !== undefined && aft !== undefined) {
    bits.push(`CG ${fwd.toFixed(1)}–${aft.toFixed(1)}%`);
  }

  const stationLines = [...text.matchAll(/^\s*station_load\.\d+\s*=(.*)$/gim)].map(
    (m) => m[1] ?? '',
  );
  if (stationLines.length > 0) {
    const roles = stationLines
      .map((line) => /TT:MENU\.PAYLOAD\.([A-Z0-9_]+)/i.exec(line)?.[1])
      .filter((r): r is string => Boolean(r))
      .map((r) => r.toUpperCase());
    const unique = [...new Set(roles)];
    const shown = unique.slice(0, 4).join(', ');
    const more = unique.length > 4 ? ` +${unique.length - 4}` : '';
    bits.push(
      unique.length > 0
        ? `${stationLines.length} stations (${shown}${more})`
        : `${stationLines.length} stations`,
    );
  }

  const tanks = [...text.matchAll(/^\s*Tank\.\d+\s*=(.*)$/gim)].map((m) => m[1] ?? '');
  if (tanks.length > 0) {
    let total = 0;
    for (const line of tanks) {
      const cap = /#Capacity:\s*([\d.]+)/i.exec(line)?.[1];
      if (cap) total += Number(cap);
    }
    bits.push(
      total > 0
        ? `${tanks.length} tanks (${Math.round(total)} gal)`
        : `${tanks.length} tanks`,
    );
  }

  return bits.length > 0 ? bits.join(' · ') : undefined;
}

/** Live SimConnect W&B used to re-rank flight_model.cfg candidates. */
export type LiveFlightModelHints = {
  mtowLb?: number;
  emptyWeightLb?: number;
  stationCount?: number;
};

function stationLoadCount(text: string): number {
  return [...text.matchAll(/^\s*station_load\.\d+\s*=/gim)].length;
}

/**
 * Boost cfgs whose declared MTOW / empty / station count match the live aircraft.
 * Far-off GA decoys (e.g. 2550 lb vs 18300 lb live) are demoted.
 */
export function scoreCfgAgainstLiveHints(
  text: string,
  hints: LiveFlightModelHints | undefined,
): number {
  if (!hints) return 0;
  let score = 0;

  const mtow = num(text, 'max_gross_weight');
  if (
    hints.mtowLb != null &&
    hints.mtowLb > 0 &&
    mtow != null &&
    mtow > 0
  ) {
    const ratio = Math.abs(mtow - hints.mtowLb) / hints.mtowLb;
    if (ratio <= 0.05) score += 40;
    else if (ratio <= 0.1) score += 28;
    else if (ratio <= 0.2) score += 16;
    else if (ratio <= 0.35) score += 6;
    else if (ratio >= 0.7) score -= 18;
  }

  const empty = num(text, 'empty_weight');
  if (
    hints.emptyWeightLb != null &&
    hints.emptyWeightLb > 0 &&
    empty != null &&
    empty > 0
  ) {
    const ratio = Math.abs(empty - hints.emptyWeightLb) / hints.emptyWeightLb;
    if (ratio <= 0.08) score += 12;
    else if (ratio <= 0.15) score += 6;
    else if (ratio >= 0.7) score -= 8;
  }

  const stations = stationLoadCount(text);
  if (
    hints.stationCount != null &&
    hints.stationCount > 0 &&
    stations > 0
  ) {
    const delta = Math.abs(stations - hints.stationCount);
    if (delta === 0) score += 20;
    else if (delta === 1) score += 12;
    else if (delta === 2) score += 6;
    else if (delta >= 5) score -= 10;
  }

  return score;
}

/**
 * Collapse candidates that share identical bytes. Modular packages often ship
 * the same MODULAR_MERGE stub under every preset — showing all 16 is noise.
 * Stub groups are demoted so attachment/common cfgs with real W&B rise.
 * Nearby aircraft.cfg (range/burn) is resolved and boosts ranking.
 * Optional live MTOW/stations hints override path-token noise.
 */
export async function groupFlightModelCandidatesByContent(
  candidates: FlightModelCandidate[],
  liveHints?: LiveFlightModelHints,
): Promise<FlightModelCandidateGroup[]> {
  const byHash = new Map<
    string,
    {
      hash: string;
      byteLength: number;
      stub: boolean;
      locked: boolean;
      summary?: string;
      text: string;
      items: FlightModelCandidate[];
    }
  >();

  for (const candidate of candidates) {
    let bytes: Buffer;
    try {
      bytes = await readFile(candidate.path);
    } catch {
      // VFS padlocks: path is discoverable but content unread — still list it.
      const lockedKey = `locked:${candidate.path.toLowerCase()}`;
      const existing = byHash.get(lockedKey);
      if (existing) {
        existing.items.push(candidate);
      } else {
        byHash.set(lockedKey, {
          hash: lockedKey,
          byteLength: 0,
          stub: false,
          locked: true,
          summary: 'locked (Access Denied — likely the real streamed aircraft)',
          text: '',
          items: [candidate],
        });
      }
      continue;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    const text = bytes.toString('utf8');
    const stub = isModularFlightModelStub(text, bytes.length);
    const existing = byHash.get(hash);
    if (existing) {
      existing.items.push(candidate);
    } else {
      byHash.set(hash, {
        hash,
        byteLength: bytes.length,
        stub,
        locked: false,
        summary: summarizeFlightModelCfg(text),
        text,
        items: [candidate],
      });
    }
  }

  const groups: FlightModelCandidateGroup[] = [];
  for (const entry of byHash.values()) {
    const items = [...entry.items].sort(
      (a, b) => b.score - a.score || a.path.localeCompare(b.path),
    );
    const primary: FlightModelCandidate = { ...items[0]! };
    // Demote empty preset stubs so cargo/pax attachments surface in the top list.
    if (entry.stub) {
      primary.score = Math.max(0, primary.score - 12);
    }
    // Locked exact-model paths still beat readable decoys (passive AI / siblings).
    if (entry.locked) {
      primary.score += 8;
    } else {
      primary.score += scoreCfgAgainstLiveHints(entry.text, liveHints);
    }

    let aircraftCfgPath: string | undefined;
    let catalogPerfSummary: string | undefined;
    if (!entry.locked) {
      try {
        aircraftCfgPath = await findAircraftCfgNearFlightModel(primary.path);
        if (aircraftCfgPath) {
          const ui = parseAircraftCfgUiText(await readFile(aircraftCfgPath, 'utf8'));
          const bits: string[] = [];
          if (ui.maxRangeNm != null && ui.maxRangeNm > 0) {
            bits.push(`range ${ui.maxRangeNm} nm`);
            primary.score += 8;
          }
          if (isValidUiFuelBurnRateLbPerHour(ui.uiFuelBurnRateLbPerHour)) {
            bits.push(`burn ${ui.uiFuelBurnRateLbPerHour} lb/h`);
            primary.score += 3;
          } else if (ui.uiFuelBurnRateRaw != null) {
            bits.push(`burn cfg=${ui.uiFuelBurnRateRaw}`);
          }
          if (bits.length > 0) {
            catalogPerfSummary = bits.join(' · ');
          }
          // Prefer common/config flight_model when it pairs with the UI aircraft.cfg.
          if (/[\\/]common[\\/]config[\\/]flight_model\.cfg$/i.test(primary.path)) {
            primary.score += 4;
          }
        }
      } catch {
        /* Access Denied on VFS padlocks — leave unset */
      }
    }

    groups.push({
      primary,
      contentHash: entry.hash,
      byteLength: entry.byteLength,
      duplicates: items.slice(1),
      stub: entry.stub,
      locked: entry.locked || undefined,
      summary: entry.summary,
      aircraftCfgPath,
      catalogPerfSummary,
    });
  }

  groups.sort(
    (a, b) =>
      b.primary.score - a.primary.score ||
      a.primary.path.localeCompare(b.primary.path),
  );
  return groups;
}

export async function promptFlightModelPath(
  ask: AskFn,
  aircraftTitle: string,
  opts: { publisher?: string; liveHints?: LiveFlightModelHints } = {},
): Promise<string | undefined> {
  console.log('  Searching MSFS Community/Official/VFS for flight_model.cfg (+ nearby aircraft.cfg)…');
  const resolved = await resolveInstalledPackagesPath();
  if (!resolved) {
    console.log('  Could not resolve InstalledPackagesPath from UserCfg.opt.');
    console.log('  Tip: Steam → %APPDATA%\\Microsoft Flight Simulator 2024\\UserCfg.opt');
    const manual = await ask('flight_model.cfg path (blank to skip)');
    return manual.trim().replace(/^"(.*)"$/, '$1') || undefined;
  }

  printInstalled(resolved);
  const vfsRoot = await resolveMsfsVfsProjectionPath(
    process.env,
    resolved.packagesRoot,
  );
  if (vfsRoot) {
    console.log(`  VFSProjection: ${vfsRoot} (simobjects/airplanes)`);
  } else {
    console.log(
      '  VFSProjection: not mounted (DevMode → Tools → Virtual File System → Start)',
    );
  }

  const searchOpts: FindFlightModelOptions = {
    publisher: opts.publisher,
    vfsProjectionRoot: vfsRoot,
  };
  if (opts.publisher) {
    console.log(`  Filtering packages for publisher: ${opts.publisher}`);
  }
  if (
    opts.liveHints?.mtowLb != null ||
    opts.liveHints?.stationCount != null ||
    opts.liveHints?.emptyWeightLb != null
  ) {
    const bits: string[] = [];
    if (opts.liveHints.mtowLb != null) bits.push(`MTOW ${Math.round(opts.liveHints.mtowLb)} lb`);
    if (opts.liveHints.emptyWeightLb != null) {
      bits.push(`empty ${Math.round(opts.liveHints.emptyWeightLb)} lb`);
    }
    if (opts.liveHints.stationCount != null) {
      bits.push(`${opts.liveHints.stationCount} stations`);
    }
    console.log(`  Ranking by live W&B: ${bits.join(' · ')}`);
  }
  let candidates = await findFlightModelCandidates(
    resolved.packagesRoot,
    aircraftTitle,
    searchOpts,
  );

  if (candidates.length === 0) {
    const keyword = (
      await ask('No matches. Optional search keyword (blank to skip search)', '')
    ).trim();
    if (keyword) {
      candidates = await findFlightModelCandidates(
        resolved.packagesRoot,
        `${aircraftTitle} ${keyword}`,
        searchOpts,
      );
    }
  }

  if (candidates.length === 0) {
    console.log(
      '  No flight_model.cfg found under Community/Official' +
        (vfsRoot ? '/VFSProjection' : '') +
        '.',
    );
    if (!vfsRoot) {
      console.log(
        '  Tip: for streamed/official aircraft, enable DevMode VFS Projector and re-run, or paste a path.',
      );
    }
    const manual = await ask('flight_model.cfg path (blank to skip)');
    return manual.trim().replace(/^"(.*)"$/, '$1') || undefined;
  }

  const groups = await groupFlightModelCandidatesByContent(
    candidates,
    opts.liveHints,
  );
  // Show the full shortlist — omitting rows hid the real (often locked) aircraft.
  const top = groups.slice(0, 50);
  console.log(
    groups.length < candidates.length
      ? `  Candidates (best match first; ${candidates.length} files → ${groups.length} unique contents):`
      : '  Candidates (best match first):',
  );
  console.log(
    '  Range/burn come from aircraft.cfg (shown when found beside the flight_model).',
  );
  top.forEach((g, i) => {
    const c = g.primary;
    const tags: string[] = [];
    if (g.locked) tags.push('locked');
    if (g.stub) tags.push(`${g.byteLength} B stub`);
    if (g.duplicates.length > 0) {
      tags.push(`identical x${g.duplicates.length + 1}`);
    }
    const tagStr = tags.length > 0 ? `  [${tags.join(' · ')}]` : '';
    console.log(
      `    ${String(i + 1).padStart(2)}. [${c.rootKind}] ${shortPresetLabel(c.airplaneFolder)}  (score ${c.score})${tagStr}`,
    );
    if (g.summary) {
      console.log(`        ↳ flight_model: ${g.summary}`);
    }
    if (g.catalogPerfSummary) {
      console.log(`        ↳ aircraft.cfg: ${g.catalogPerfSummary}`);
    } else if (g.locked) {
      console.log('        ↳ aircraft.cfg: locked with flight_model');
    } else if (g.aircraftCfgPath) {
      console.log('        ↳ aircraft.cfg: (no ui_max_range / burn)');
    } else {
      console.log('        ↳ aircraft.cfg: not found / locked');
    }
    console.log(`        flight_model: ${c.path}`);
    if (g.aircraftCfgPath) {
      console.log(`        aircraft.cfg: ${g.aircraftCfgPath}`);
    }
    if (g.duplicates.length > 0) {
      const also = g.duplicates
        .slice(0, 6)
        .map((d) => shortPresetLabel(d.airplaneFolder));
      const more =
        g.duplicates.length > also.length
          ? ` +${g.duplicates.length - also.length}`
          : '';
      console.log(`        also identical: ${also.join(', ')}${more}`);
    }
    if (i < top.length - 1) console.log('');
  });
  if (groups.length > top.length) {
    console.log(`    … ${groups.length - top.length} more unique content(s) omitted`);
  }
  console.log(
    '  Tip: prefer the player airframe (not passiveaircraft AI). [locked] = streamed VFS cfg — still selectable; unread W&B falls back to live SimVars.',
  );

  // No numeric default — Enter must skip, not silently pick #1 (often a decoy).
  const choice = (
    await ask('Choose number, paste a path, or press Enter to skip')
  ).trim();
  if (!choice) return undefined;

  const asNum = Number(choice);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= top.length) {
    return top[asNum - 1]!.primary.path;
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
