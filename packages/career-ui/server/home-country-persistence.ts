import type { CareerStoreKind } from '@msfs-compat/shared';

export function homeCountryPersistence(
  kind: CareerStoreKind,
  worldFixed: boolean,
): {
  persistHubSelection: 'company' | 'blob';
  syncWorldHomeCountry: boolean;
} {
  const sharedWorld = worldFixed || kind === 'postgres';
  return sharedWorld
    ? { persistHubSelection: 'company', syncWorldHomeCountry: false }
    : { persistHubSelection: 'blob', syncWorldHomeCountry: true };
}
