/**
 * Crew card art under career-ui/public/crew/.
 * Ids match shared resolveCrewPortraitId (`man_1`…`woman_5`).
 */
export function crewPortraitUrl(
  portraitId: string | null | undefined,
): string | undefined {
  const id = portraitId?.trim();
  if (!id || !/^(man|woman)_[1-5]$/.test(id)) return undefined;
  return `/crew/${id}.png`;
}
