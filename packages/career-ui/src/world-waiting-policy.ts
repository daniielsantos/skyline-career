/**
 * Mid-deploy / host blip: keep Listening for host instead of dumping MP
 * clients onto the SP ProfileGate (“World” + Signed in).
 */

export type DesktopPlayMode = 'sp' | 'mp' | null | undefined;

/**
 * When health returns without `worldFixed` while WorldWaiting is active
 * (or at boot), stay on WorldWaiting if we know this session is MP.
 * Explicit desktop SP always leaves Listening so ProfileGate can run.
 */
export function shouldKeepWorldWaitingOnUnfixedHealth(opts: {
  playMode: DesktopPlayMode;
  sawWorldFixed: boolean;
}): boolean {
  if (opts.playMode === 'sp') return false;
  if (opts.playMode === 'mp') return true;
  if (opts.sawWorldFixed) return true;
  return false;
}
