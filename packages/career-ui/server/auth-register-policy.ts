/**
 * Register / claim policy for CAREER_AUTH hosts (lab defaults stay open).
 */

function envFlagTrue(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function envFlagFalse(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

/** When CAREER_AUTH_REGISTER=0, POST /api/auth/register → 403. Default: open. */
export function isAuthRegisterEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (envFlagFalse(env.CAREER_AUTH_REGISTER)) return false;
  return true;
}

/**
 * Optional shared invite. When CAREER_AUTH_INVITE is non-empty, register body
 * must include matching inviteCode.
 */
export function authInviteCodeRequired(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const code = (env.CAREER_AUTH_INVITE ?? '').trim();
  return code || null;
}

export function authInviteCodeMatches(
  provided: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const required = authInviteCodeRequired(env);
  if (!required) return true;
  return (provided ?? '').trim() === required;
}

/**
 * claimCompanyId on register is lab-migration only.
 * Requires CAREER_AUTH_ALLOW_CLAIM=1.
 */
export function isAuthClaimCompanyAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlagTrue(env.CAREER_AUTH_ALLOW_CLAIM);
}
