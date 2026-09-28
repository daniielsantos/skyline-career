import type { CareerRunway } from './api';

export function destRunwayEnds(
  runway: Pick<CareerRunway, 'ident' | 'identReciprocal'>,
): string {
  const recip = runway.identReciprocal?.trim();
  return recip ? `${runway.ident}/${recip}` : runway.ident;
}

export function formatDestRunwayFacts(
  runway: Pick<CareerRunway, 'lengthM' | 'widthM' | 'surface' | 'lighted'>,
): string {
  const len =
    runway.lengthM >= 1000
      ? `${(runway.lengthM / 1000).toFixed(runway.lengthM >= 10_000 ? 1 : 2)} km`
      : `${Math.round(runway.lengthM)} m`;
  const light =
    runway.lighted === true ? 'lighted' : runway.lighted === false ? 'unlit' : '';
  return [len, `${Math.round(runway.widthM)} m wide`, runway.surface, light]
    .filter(Boolean)
    .join(' · ');
}

export function runwaysLongestFirst(rows: readonly CareerRunway[]): CareerRunway[] {
  return rows.slice().sort((a, b) => b.lengthM - a.lengthM);
}
