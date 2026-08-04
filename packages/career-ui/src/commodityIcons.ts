/**
 * Commodity sticker art under career-ui/public/commodities/.
 * Filenames: general, supplies, electronics, perishables, machinery,
 * jet-a (fuel), mro-parts.
 */

const COMMODITY_ICON_FILES: Record<string, string> = {
  general: 'general.png',
  supplies: 'supplies.png',
  electronics: 'electronics.png',
  perishables: 'perishables.png',
  machinery: 'machinery.png',
  fuel: 'jet-a.png',
  mro_parts: 'mro-parts.png',
};

export function commodityIconUrl(
  commodityId: string | null | undefined,
): string | undefined {
  const id = commodityId?.trim().toLowerCase();
  if (!id) return undefined;
  const file = COMMODITY_ICON_FILES[id];
  return file ? `/commodities/${file}` : undefined;
}
