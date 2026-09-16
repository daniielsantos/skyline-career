import type { CareerStoreKind } from '@msfs-compat/shared';

export function hubSelectionPersistence(kind: CareerStoreKind): {
  persist: 'company' | 'blob';
  syncWorldHomeCountry: boolean;
} {
  return kind === 'postgres'
    ? { persist: 'company', syncWorldHomeCountry: false }
    : { persist: 'blob', syncWorldHomeCountry: true };
}
