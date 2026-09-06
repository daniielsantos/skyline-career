/**
 * Browser-safe product flags. Keep in sync with `@msfs-compat/shared`
 * (`BUSH_TRIPS_BOARD_ENABLED`, `PLAYER_LEASE_OUT_ENABLED`) — Vite client
 * must not import that package.
 */
export const BUSH_TRIPS_BOARD_ENABLED = false;
/** Port FBO Phase 0 — Hangar “List for lease” / NPC rent of owned airframes. */
export const PLAYER_LEASE_OUT_ENABLED = false;
/** Airport Base Phase 4 — bonded hold destination shopping off (API 410). */
export const FBO_REROUTE_ENABLED = false;
/** Airport Base Phase 5 — new Market→bonded holds off (API 410). */
export const FBO_BONDED_HOLD_ENABLED = false;
/** Company crew wall-clock freight — off (snowball vs lease-out). */
export const COMPANY_CREW_ENABLED = false;
