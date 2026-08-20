/** ISO 3166-1 alpha-2 → English display name (browser-safe; do not import @msfs-compat/shared here). */
export function marketCountryLabel(countryId: string): string {
  const id = countryId.trim().toUpperCase();
  if (!id) return '';
  if (id === 'WORLD') return 'Worldwide';
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    const name = dn.of(id);
    if (name && name.toUpperCase() !== id) return name;
  } catch {
    /* Intl unavailable — fall through */
  }
  return id;
}
