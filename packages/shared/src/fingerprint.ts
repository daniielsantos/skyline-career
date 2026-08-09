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
  // Payload / config state suffixes (Carenado Saab "340 Cargo - Loaded", etc.)
  t = t.replace(/\s*-?\s*(?:loaded|unloaded|empty)\s*$/i, '');
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
  { re: /\bcarenado\b/i, publisher: 'carenado' },
  // Default / Marketplace Saab 340 — live titles are often just "340 Cargo - …".
  { re: /\bsaab\s*340\b|\b340\s+cargo\b|\bs340b?\b/i, publisher: 'carenado' },
  // C400 Corvalis — live title has no vendor prefix; MSFS may report asobo package.
  { re: /\bc400\b.*\bcorvalis\b|\bcorvalis\b/i, publisher: 'carenado' },
  // C185F Skywagon — same aircraft homologated as carenado; live title is Asobo/Microsoft.
  { re: /\bc185f?\b.*\bskywagon\b|\bskywagon\b/i, publisher: 'carenado' },
  { re: /\bfs\s*reborn\b|\bfsreborn\b/i, publisher: 'fsreborn' },
  { re: /\bnext\s*gen\s*sim\b|\bnextgensim\b/i, publisher: 'nextgensim' },
  { re: /\bflight\s*fx\b|\bflightfx\b/i, publisher: 'flightfx' },
  { re: /\bpmdg\b/i, publisher: 'pmdg' },
  // PMDG DC-6 — live title is often just "DC-6A" / "DC-6" without vendor prefix.
  { re: /\bDC-?6[AB]?\b/i, publisher: 'pmdg' },
  { re: /\bfenix\b/i, publisher: 'fenix' },
  { re: /\binibuilds\b/i, publisher: 'inibuilds' },
  { re: /\bworking\s*title\b/i, publisher: 'workingtitle' },
  { re: /\bjust\s*flight\b/i, publisher: 'justflight' },
  { re: /\btfdi\b/i, publisher: 'tfdi' },
  { re: /\bmaddog\b|\bleonardo\b|\blsh-?maddog/i, publisher: 'leonardo' },
  { re: /\basobo\b/i, publisher: 'asobo' },
];

/** Known catalog publisher slugs (title hints + common MSFS vendors). */
export const KNOWN_PUBLISHERS: readonly string[] = [
  ...new Set([
    ...TITLE_PUBLISHER_HINTS.map((h) => h.publisher),
    'asobo',
    'carenado',
    'flightfx',
    'hype',
    'justflight',
    'leonardo',
    'miltech',
    'orbx',
    'tfdi',
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
  if (live === profile) return true;

  const stop = new Set(['the', 'and', 'for', 'msfs', 'aircraft', 'airplane', 'default']);
  // Vendor / product-line chrome shared across unrelated airframes
  // ("Black Square … Professional" must not alias Caravan ↔ Bonanza).
  const brandNoise = new Set([
    'black',
    'square',
    'professional',
    'just',
    'flight',
    'asobo',
    'microsoft',
    'working',
    'title',
  ]);
  const tokens = (s: string) =>
    s
      // Commas/periods stick to tokens after space→underscore normalize
      // ("combi,_cargopod" must not become the token "combi,").
      .split(/[\s\-_+,./|;:]+/)
      .map((t) => t.trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ''))
      .filter((t) => t.length >= 2 && !stop.has(t));
  const liveTokens = tokens(live);
  const profileTokenList = tokens(profile);
  const profileTokens = new Set(profileTokenList);

  // Distinct airframe family names — Caravan must not title-alias onto Bonanza.
  const familyNames = new Set([
    'bonanza',
    'caravan',
    'duke',
    'baron',
    'commander',
    'kodiak',
    'comanche',
    'aerostar',
    'corvalis',
    'skywagon',
    'islander',
    'bandeirante',
    'otter',
    'tbm',
    'phenom',
    'learjet',
    'citation',
    'saab',
    'king',
  ]);
  const liveFamily = liveTokens.filter((t) => familyNames.has(t));
  const profileFamily = profileTokenList.filter((t) => familyNames.has(t));
  if (liveFamily.length > 0 && profileFamily.length > 0) {
    const profileFamilySet = new Set(profileFamily);
    if (!liveFamily.some((t) => profileFamilySet.has(t))) {
      return false;
    }
  }

  // Cargo vs passenger / pax are distinct Market / OFP variants even when the
  // SimConnect tank/station fingerprint is identical (Learjet 35A, Saab 340, …).
  const cargoRole = new Set(['cargo', 'freight', 'freighter', 'mail']);
  const paxRole = new Set(['passenger', 'passengers', 'pax', 'cabin']);
  const roleOf = (toks: string[]): 'cargo' | 'pax' | null => {
    if (toks.some((t) => cargoRole.has(t))) return 'cargo';
    if (toks.some((t) => paxRole.has(t))) return 'pax';
    return null;
  };
  const liveRole = roleOf(liveTokens);
  const profileRole = roleOf(profileTokenList);
  if (liveRole && profileRole && liveRole !== profileRole) {
    return false;
  }

  // Config / cabin / range suffixes are first-class variants (Learjet "PASSENGER
  // LONG RANGE" must not alias onto plain "PASSENGER"; Kodiak Combi ≠ Commuter).
  const variantTokens = new Set([
    'long',
    'range',
    'short',
    'extended',
    'xr',
    'lr',
    'er',
    'vip',
    'exec',
    'executive',
    'combi',
    'commuter',
    'skydive',
    'summit',
    'amphibian',
    'floats',
    // Landing gear / tires — "Kodiak 100 Combi" must not alias onto
    // "Kodiak 100 Combi, Tundra wheels" (same tank/station hash).
    'tundra',
    'wheels',
    // External cargo pod is a first-class Kodiak (and similar) variant —
    // "Commuter, Tundra" must not alias onto "Commuter, Cargopod, Tundra".
    'cargopod',
    'nocp',
    // Turbocharged / pressurized cabin markers (Bonanza A36TC ≠ A36).
    'tc',
    'turbo',
    'turbocharged',
    // Duke / performance packages — Grand ≠ base B60; Turbine ≠ piston.
    'grand',
    'turbine',
  ]);
  const liveVariants = new Set(liveTokens.filter((t) => variantTokens.has(t)));
  const profileVariants = new Set(
    profileTokenList.filter((t) => variantTokens.has(t)),
  );
  if (liveVariants.size > 0 || profileVariants.size > 0) {
    if (
      liveVariants.size !== profileVariants.size ||
      [...liveVariants].some((t) => !profileVariants.has(t)) ||
      [...profileVariants].some((t) => !liveVariants.has(t))
    ) {
      return false;
    }
  }

  // Model codes like 110p / 110p1f / c208b / a36 / a36tc must agree. Otherwise
  // "EMB-110P" token-overlaps "EMB-110P1F" and falsely aliases variants.
  // Also catches letter+digits airframe codes (A36 vs A36TC, C90, BE36).
  const isModelToken = (t: string) =>
    /^\d{2,4}[a-z0-9]{0,4}$/i.test(t) ||
    /^[a-z]{1,3}\d{2,4}[a-z0-9]{0,4}$/i.test(t);
  const liveModels = liveTokens.filter(isModelToken);
  const profileModels = profileTokenList.filter(isModelToken);
  if (liveModels.length > 0 && profileModels.length > 0) {
    const liveSet = new Set(liveModels);
    const profileSet = new Set(profileModels);
    if (
      liveModels.some((m) => !profileSet.has(m)) ||
      profileModels.some((m) => !liveSet.has(m))
    ) {
      return false;
    }
  }

  // Substring only when the longer side adds no extra meaningful tokens
  // (avoids "… PASSENGER LONG RANGE" ⊇ "… PASSENGER").
  if (live.includes(profile) || profile.includes(live)) {
    const liveExtra = liveTokens.filter((t) => !profileTokens.has(t));
    const profileExtra = profileTokenList.filter((t) => !new Set(liveTokens).has(t));
    if (liveExtra.length === 0 || profileExtra.length === 0) {
      const extras = liveExtra.length > 0 ? liveExtra : profileExtra;
      const benign = new Set(['saab', 'cessna', 'beechcraft', 'piper', 'dassault']);
      if (extras.every((t) => benign.has(t))) return true;
    }
  }

  const shared = liveTokens.filter(
    (t) => profileTokens.has(t) && !brandNoise.has(t),
  );
  // Prefer numeric model tokens (340, 208, 737) — one shared model id + one word is enough.
  const sharedModel = shared.some((t) => isModelToken(t));
  return sharedModel ? shared.length >= 2 : shared.length >= 3;
}

/** Profile match.title / liveTitles accept this in-sim title for resolve. */
export function profileAcceptsLiveTitle(
  profile: {
    match?: { title?: string; liveTitles?: string[] };
    displayName?: string;
    profileId?: string;
  },
  liveTitle: string,
): boolean {
  const candidates = [
    profile.match?.title,
    ...(profile.match?.liveTitles ?? []),
    profile.displayName,
  ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  if (candidates.length === 0) return false;
  return candidates.some((t) => titlesMatchForCatalog(liveTitle, t));
}
