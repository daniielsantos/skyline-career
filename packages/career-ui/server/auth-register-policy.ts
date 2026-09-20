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
 * must include matching inviteCode (staff bypass when access keys are on).
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
 * When CAREER_AUTH_ACCESS_KEYS=1, register requires a one-time product key
 * (unless staff CAREER_AUTH_INVITE matches).
 */
export function isAuthAccessKeysRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlagTrue(env.CAREER_AUTH_ACCESS_KEYS);
}

/** Show invite/product-key field on AuthGate. */
export function isAuthInviteFieldRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(authInviteCodeRequired(env)) || isAuthAccessKeysRequired(env);
}

/**
 * Resolve whether register may proceed and whether to claim a product key.
 * Staff shared invite still works when access keys are on (no claim).
 */
export function resolveRegisterAccessGate(
  provided: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
):
  | { ok: true; accessKeyCode?: string }
  | { ok: false; code: 'invite_required' | 'access_key_required' } {
  const accessKeys = isAuthAccessKeysRequired(env);
  const staffInvite = authInviteCodeRequired(env);
  const trimmed = (provided ?? '').trim();

  if (accessKeys) {
    if (staffInvite && trimmed === staffInvite) {
      return { ok: true };
    }
    if (!trimmed) {
      return { ok: false, code: 'access_key_required' };
    }
    return { ok: true, accessKeyCode: trimmed };
  }

  if (!authInviteCodeMatches(provided, env)) {
    return { ok: false, code: 'invite_required' };
  }
  return { ok: true };
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
