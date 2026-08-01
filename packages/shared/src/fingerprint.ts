import { createHash } from 'node:crypto';
import type { AircraftIdentity, AircraftStructure, FingerprintInput } from './types/aircraft-profile.js';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function semverMajor(version?: string): string {
  if (!version) return '0';
  const match = version.match(/^(\d+)/);
  return match?.[1] ?? '0';
}

/**
 * Strip trailing ATC registration / tail number and common livery/cabin suffixes
 * so live titles like "FSReborn Phenom 300E Manchester Interior" match a stable
 * catalog title ("FSReborn Phenom 300E").
 */
export function normalizeAircraftTitle(title: string): string {
  let t = title.trim().replace(/\s+/g, ' ');
  // "Cessna C680: HB-SOV" — colon-separated registration
  t = t.replace(/:\s*[A-Z0-9-]{2,10}$/i, '');
  // US N-numbers: N123, N1234, N12345, N123AB, N12AB
  t = t.replace(/\s+N[0-9]{1,5}[A-Z]{0,2}$/i, '');
  // Dash registrations: G-ABCD, PR-ABC, VH-ABC, C-GABC, HB-SOV, …
  t = t.replace(/\s+[A-Z]{1,2}-[A-Z0-9]{2,5}$/i, '');
  // Cabin packs often append "<Name> Interior" (e.g. "Manchester Interior").
  // Only strip alphabetic name tokens (1–2 words) before Interior — never model tokens like "300E".
  t = t.replace(/\s+(?:[A-Za-z][\w\-]*\s+){1,2}Interior$/i, '');
  // Trailing "Livery 1" / "- Livery 2" (common payware paint titles)
  t = t.replace(/\s*-?\s*livery\s*\d+$/i, '');
  // Trailing "livery" / "paint" tokens
  t = t.replace(/\s+(?:livery|paint|repaint)$/i, '');
  // Leftover punctuation after registration strip ("Cessna C680:")
  t = t.replace(/[:\-–—|/]+$/g, '');
  return t.trim();
}

const TITLE_PUBLISHER_HINTS: Array<{ re: RegExp; publisher: string }> = [
  { re: /\ba2a\b/i, publisher: 'a2a' },
  { re: /\bblack\s*box(?:\s*simulation)?\b/i, publisher: 'blackbox' },
  // Black Box Simulation BN-2 — live titles are often just "BN2 Islander - …"
  // without the publisher prefix.
  { re: /\bbn-?2\b.*\bislander\b|\bislander\b.*\bbn-?2\b|\bbn2\s+islander\b/i, publisher: 'blackbox' },
  { re: /\bblack\s*square\b/i, publisher: 'blacksquare' },
  { re: /\bfs\s*reborn\b|\bfsreborn\b/i, publisher: 'fsreborn' },
  { re: /\bnext\s*gen\s*sim\b|\bnextgensim\b/i, publisher: 'nextgensim' },
  { re: /\bflight\s*fx\b|\bflightfx\b/i, publisher: 'flightfx' },
  { re: /\bpmdg\b/i, publisher: 'pmdg' },
  { re: /\bfenix\b/i, publisher: 'fenix' },
  { re: /\binibuilds\b/i, publisher: 'inibuilds' },
  { re: /\bworking\s*title\b/i, publisher: 'workingtitle' },
  { re: /\basobo\b/i, publisher: 'asobo' },
];

/** Known catalog publisher slugs (title hints + common MSFS vendors). */
export const KNOWN_PUBLISHERS: readonly string[] = [
  ...new Set([
    ...TITLE_PUBLISHER_HINTS.map((h) => h.publisher),
    'asobo',
    'flightfx',
    'hype',
    'miltech',
    'orbx',
  ]),
].sort((a, b) => a.localeCompare(b));

/**
 * Infer catalog publisher slug. Explicit override wins; otherwise title hints;
 * finally `fallback` (default asobo — MSFS often reports payware under Asobo packages).
 */
export function inferPublisher(
  title: string,
  explicit?: string | null,
  fallback = 'asobo',
): string {
  const trimmed = explicit?.trim();
  if (trimmed && trimmed.toLowerCase() !== 'asobo') {
    return trimmed.toLowerCase().replace(/\s+/g, '');
  }
  // Allow explicit asobo only when title does not clearly indicate another publisher.
  for (const hint of TITLE_PUBLISHER_HINTS) {
    if (hint.re.test(title)) {
      return hint.publisher;
    }
  }
  if (trimmed) {
    return trimmed.toLowerCase().replace(/\s+/g, '');
  }
  return fallback;
}

/** Identity fields that participate in fingerprint v2 (stable across registration / publisher quirks). */
export function canonicalizeIdentityForFingerprint(identity: AircraftIdentity): AircraftIdentity {
  const title = normalizeAircraftTitle(identity.title);
  return {
    ...identity,
    title,
    publisher: inferPublisher(title, identity.publisher),
  };
}

function hashStructure(structure: AircraftStructure): string {
  // Stations: index only — live sampler uses placeholder maxLoad/arm that must not diverge from profiles.
  // Tanks: index + rounded capacity (name ignored so FUELSYSTEM:n and classic LEFT_MAIN can align).
  const payload = JSON.stringify({
    tanks: structure.tankSchema
      .map((t) => ({
        index: t.index,
        capacity: Math.round(t.capacity),
        unit: t.unit ?? 'gallons',
      }))
      .sort((a, b) => a.index - b.index),
    stations: structure.stationSchema.map((s) => s.index).sort((a, b) => a - b),
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function computeFingerprintV2(input: FingerprintInput): {
  fingerprint: string;
  structuralHash: string;
} {
  const identity = canonicalizeIdentityForFingerprint(input.identity);
  const structuralHash = hashStructure(input.structure);

  const canonical = [
    normalize(identity.publisher),
    normalize(identity.title),
    normalize(identity.baseContainer ?? identity.packageName ?? ''),
    semverMajor(identity.packageVersion),
    structuralHash,
  ].join('|');

  const fingerprint = createHash('sha256').update(canonical).digest('hex');

  return { fingerprint, structuralHash };
}

export function buildFingerprintRequest(
  clientId: string,
  simVersion: string,
  identity: AircraftIdentity,
  structure: AircraftStructure,
) {
  const { fingerprint } = computeFingerprintV2({ identity, structure });

  return {
    clientId,
    simVersion,
    identity,
    structure,
    fingerprint,
  };
}

/** True when live/catalog title should resolve to profile match.title (registration-safe). */
export function titlesMatchForCatalog(liveTitle: string, profileTitle: string): boolean {
  const live = normalize(normalizeAircraftTitle(liveTitle));
  const profile = normalize(normalizeAircraftTitle(profileTitle));
  if (!live || !profile) return false;
  return live === profile || live.includes(profile) || profile.includes(live);
}
