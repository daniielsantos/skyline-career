import type { AircraftProfile } from '@msfs-compat/shared';
import { isPlaceholderFingerprint } from '@msfs-compat/shared';
import type { LoadedProfile } from './profile-registry.js';

export interface AircraftIdentityLike {
  title: string;
  atcModel?: string;
  atcType?: string;
  atcId?: string;
  icao?: string;
  publisher?: string;
}

export interface ResolveResult {
  matched: boolean;
  confidence: number;
  reason: string;
  profile?: AircraftProfile;
  path?: string;
  candidates: Array<{
    profileKey: string;
    title: string;
    icao?: string;
    score: number;
    path: string;
  }>;
}

function norm(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreProfile(
  identity: AircraftIdentityLike,
  profile: AircraftProfile,
  fingerprint?: string,
): {
  score: number;
  reason: string;
} {
  if (
    fingerprint &&
    !isPlaceholderFingerprint(fingerprint) &&
    profile.match.fingerprint === fingerprint &&
    !isPlaceholderFingerprint(profile.match.fingerprint)
  ) {
    return { score: 1.0, reason: 'exact_fingerprint' };
  }

  const title = norm(identity.title);
  const profileTitle = norm(profile.match.title);
  const icao = norm(identity.icao ?? identity.atcModel);
  const profileIcao = norm(profile.match.icao);

  if (title && profileTitle && title === profileTitle) {
    return { score: 1.0, reason: 'exact_title' };
  }

  if (title && profileTitle && (title.includes(profileTitle) || profileTitle.includes(title))) {
    return { score: 0.85, reason: 'partial_title' };
  }

  if (icao && profileIcao && icao === profileIcao) {
    const titleTokens = title.split(/[\s\-_]+/).filter(Boolean);
    const profileTokens = profileTitle.split(/[\s\-_]+/).filter(Boolean);
    const shared = titleTokens.some((t) => profileTokens.includes(t) || profileIcao.includes(t));
    return {
      score: shared ? 0.75 : 0.55,
      reason: shared ? 'icao_with_title_token' : 'icao_only',
    };
  }

  return { score: 0, reason: 'no_match' };
}

/**
 * Resolve the best local profile for a live aircraft identity.
 * Exact fingerprint wins; then title; then partial title; then ICAO.
 */
export function resolveProfile(
  identity: AircraftIdentityLike,
  catalog: LoadedProfile[],
  options: { minConfidence?: number; fingerprint?: string } = {},
): ResolveResult {
  const minConfidence = options.minConfidence ?? 0.7;
  const fingerprint = options.fingerprint;

  const ranked = catalog
    .map((entry) => {
      const { score, reason } = scoreProfile(identity, entry.profile, fingerprint);
      return { entry, score, reason };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const candidates = ranked.map((r) => ({
    profileKey: r.entry.profile.profileKey,
    title: r.entry.profile.match.title ?? r.entry.profile.displayName ?? r.entry.profile.profileId,
    icao: r.entry.profile.match.icao,
    score: r.score,
    path: r.entry.path,
  }));

  const best = ranked[0];
  if (!best || best.score < minConfidence) {
    return {
      matched: false,
      confidence: best?.score ?? 0,
      reason: best ? `below_threshold:${best.reason}` : 'no_candidates',
      candidates,
    };
  }

  const close = ranked.filter((r) => Math.abs(r.score - best.score) < 0.05 && r.score >= minConfidence);
  if (close.length > 1 && best.reason === 'icao_only') {
    return {
      matched: false,
      confidence: best.score,
      reason: 'ambiguous_icao',
      candidates,
    };
  }

  return {
    matched: true,
    confidence: best.score,
    reason: best.reason,
    profile: best.entry.profile,
    path: best.entry.path,
    candidates,
  };
}
