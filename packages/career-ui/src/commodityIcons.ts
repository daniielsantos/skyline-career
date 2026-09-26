/**
 * Commodity sticker art under career-ui/public/commodities/.
 * Filenames: general, supplies, electronics, perishables, machinery,
 * jet-a (fuel), mro-parts, passengers (charter pool).
 *
 * Bump {@link COMMODITY_ICON_CACHE_TAG} whenever PNGs change — the desktop
 * static server caches non-HTML assets for 24h (`max-age=86400`), so without
 * a query tag Electron keeps serving the previous stickers.
 */
export const COMMODITY_ICON_CACHE_TAG = '2026-09-26f';

const COMMODITY_ICON_FILES: Record<string, string> = {
  general: 'general.png',
  supplies: 'supplies.png',
  electronics: 'electronics.png',
  perishables: 'perishables.png',
  machinery: 'machinery.png',
  fuel: 'jet-a.png',
  mro_parts: 'mro-parts.png',
  passengers: 'passengers.png',
};

export function commodityIconUrl(
  commodityId: string | null | undefined,
): string | undefined {
  const id = commodityId?.trim().toLowerCase();
  if (!id) return undefined;
  const file = COMMODITY_ICON_FILES[id];
  return file
    ? `/commodities/${file}?v=${COMMODITY_ICON_CACHE_TAG}`
    : undefined;
}
