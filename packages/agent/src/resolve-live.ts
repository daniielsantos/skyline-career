import type { AircraftIdentity, AircraftStructure } from '@msfs-compat/shared';
import {
  computeFingerprintV2,
  inferPublisher,
  profileAcceptsLiveTitle,
  structureFromProfile,
} from '@msfs-compat/shared';
import { CatalogClient } from './catalog-client.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { ProfileCache } from './profile-cache.js';
import type { LoadedProfile } from './profile-registry.js';
import { resolveProfile, type ResolveResult } from './profile-resolver.js';
import { sampleAircraftStructure } from './sample-structure.js';

export interface LiveResolveOptions {
  bridge: NamedPipeSimBridge;
  localCatalog: LoadedProfile[];
  cache: ProfileCache;
  catalogUrl?: string;
  clientId?: string;
  simVersion?: string;
  publisher?: string;
  register?: boolean;
  /**
   * Career inject: match the homologated local profile by title and skip
   * sampleAircraftStructure + catalog HTTP. Those probes (8× FUELSYSTEM
   * capacity at 15s each) froze reinject on "Reading live aircraft…".
   */
  skipStructureSample?: boolean;
}

export interface LiveResolveResult extends ResolveResult {
  fingerprint: string;
  structuralHash: string;
  identity: AircraftIdentity;
  structure: AircraftStructure;
  source: 'catalog' | 'cache' | 'local' | 'none';
  catalog?: {
    reachable: boolean;
    register?: unknown;
    resolve?: unknown;
    error?: string;
  };
}

export async function resolveLiveAircraft(options: LiveResolveOptions): Promise<LiveResolveResult> {
  const {
    bridge,
    localCatalog,
    cache,
    clientId = process.env.MSFS_COMPAT_CLIENT_ID ?? 'local-dev',
    simVersion = process.env.MSFS_COMPAT_SIM_VERSION ?? '1.0.0.0',
    publisher: publisherOption,
    register = true,
  } = options;

  const liveIdentity = await bridge.getAircraftIdentity();
  const publisher = inferPublisher(
    liveIdentity.title,
    publisherOption ?? process.env.MSFS_COMPAT_PUBLISHER,
  );
  const identity: AircraftIdentity = {
    title: liveIdentity.title,
    publisher,
    atcModel: liveIdentity.atcModel,
    atcType: liveIdentity.atcType,
    icao: liveIdentity.icao ?? liveIdentity.atcModel,
  };

  if (options.skipStructureSample) {
    const local = resolveProfile(identity, localCatalog);
    if (local.matched && local.profile) {
      const structure = structureFromProfile(local.profile);
      const { fingerprint, structuralHash } = computeFingerprintV2({
        identity,
        structure,
      });
      return {
        ...local,
        fingerprint,
        structuralHash,
        identity,
        structure,
        source: 'local',
        catalog: { reachable: false },
      };
    }
  }

  const { structure } = await sampleAircraftStructure(bridge);
  const { fingerprint, structuralHash } = computeFingerprintV2({ identity, structure });

  const catalogMeta: LiveResolveResult['catalog'] = { reachable: false };
  const client = new CatalogClient({ baseUrl: options.catalogUrl });

  try {
    catalogMeta.reachable = await client.health();
    if (catalogMeta.reachable) {
      if (register) {
        catalogMeta.register = await client.registerFingerprint({
          clientId,
          simVersion,
          identity,
          structure,
        });
      }

      const needsHomologation =
        catalogMeta.register &&
        typeof catalogMeta.register === 'object' &&
        (catalogMeta.register as { homologationRequired?: boolean })
          .homologationRequired === true;

      // Structural fingerprint may hit a sibling variant (cargo vs passenger).
      // Only resolve a catalog profile when register accepted the live title.
      if (!needsHomologation) {
        try {
          const resolved = await client.resolveProfile({ fingerprint, simVersion, clientId });
          catalogMeta.resolve = resolved;

          let cached = await cache.findByKey(resolved.profileKey, resolved.semver);
          if (!cached || cached.documentHash !== resolved.documentHash) {
            const envelope = await client.getDocument(resolved.profileKey, resolved.semver);
            cached = await cache.writeEnvelope(envelope);
          }

          if (profileAcceptsLiveTitle(cached.profile, identity.title)) {
            return {
              matched: true,
              confidence: resolved.confidenceScore ?? 1,
              reason: 'catalog_fingerprint',
              profile: cached.profile,
              path: cached.path,
              candidates: [
                {
                  profileKey: resolved.profileKey,
                  title: cached.profile.match.title ?? resolved.profileKey,
                  icao: cached.profile.match.icao,
                  score: resolved.confidenceScore ?? 1,
                  path: cached.path,
                },
              ],
              fingerprint,
              structuralHash,
              identity,
              structure,
              source: 'catalog',
              catalog: catalogMeta,
            };
          }
        } catch (err) {
          catalogMeta.error = err instanceof Error ? err.message : String(err);
        }
      }
    }
  } catch (err) {
    catalogMeta.reachable = false;
    catalogMeta.error = err instanceof Error ? err.message : String(err);
  }

  const fromCache = await cache.findByFingerprint(fingerprint);
  if (fromCache && profileAcceptsLiveTitle(fromCache.profile, identity.title)) {
    return {
      matched: true,
      confidence: 1,
      reason: 'cache_fingerprint',
      profile: fromCache.profile,
      path: fromCache.path,
      candidates: [
        {
          profileKey: fromCache.profile.profileKey,
          title: fromCache.profile.match.title ?? fromCache.profile.profileKey,
          icao: fromCache.profile.match.icao,
          score: 1,
          path: fromCache.path,
        },
      ],
      fingerprint,
      structuralHash,
      identity,
      structure,
      source: 'cache',
      catalog: catalogMeta,
    };
  }

  // local catalog already includes examples/cache; fingerprint scoring uses options.fingerprint
  const local = resolveProfile(identity, localCatalog, { fingerprint });
  return {
    ...local,
    fingerprint,
    structuralHash,
    identity,
    structure,
    source: local.matched ? 'local' : 'none',
    catalog: catalogMeta,
  };
}
