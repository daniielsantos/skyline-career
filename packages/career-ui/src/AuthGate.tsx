import { useState } from 'react';
import { BrandMark } from './BrandMark';
import {
  getRememberAuth,
  getRememberedLoginName,
} from './career-auth-client';

export type AuthGateAccount = {
  id: string;
  loginName: string;
  displayName: string;
};

export type AuthGateCompany = {
  id: string;
  displayName: string;
};

export type AuthGateResult = {
  token: string;
  account: AuthGateAccount;
  companies: AuthGateCompany[];
  /** Persist Bearer across app restarts (not the password). */
  rememberMe: boolean;
};

type Mode = 'login' | 'register';

/**
 * Minimal local Auth gate (account → company). Shown when host has CAREER_AUTH=1.
 */
export function AuthGate(props: {
  busy?: boolean;
  error?: string | null;
  /** When false, hide Create account (CAREER_AUTH_REGISTER=0). Default true. */
  registerEnabled?: boolean;
  /** When true, show invite field on register (CAREER_AUTH_INVITE set). */
  inviteRequired?: boolean;
  onLogin: (opts: {
    loginName: string;
    password: string;
  }) => Promise<Omit<AuthGateResult, 'rememberMe'>>;
  onRegister: (opts: {
    loginName: string;
    displayName: string;
    password: string;
    companyDisplayName?: string;
    inviteCode?: string;
  }) => Promise<Omit<AuthGateResult, 'rememberMe'>>;
  onSuccess: (result: AuthGateResult) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [loginName, setLoginName] = useState(
    () => getRememberedLoginName() ?? '',
  );
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [rememberMe, setRememberMe] = useState(() => getRememberAuth());
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const registerEnabled = props.registerEnabled !== false;
  const inviteRequired = props.inviteRequired === true;
  const busy = props.busy || submitting;
  const error = props.error || localError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      const result =
        mode === 'login'
          ? await props.onLogin({ loginName, password })
          : await props.onRegister({
              loginName,
              displayName: displayName || loginName,
              password,
              companyDisplayName: companyName || displayName || loginName,
              ...(inviteRequired || inviteCode.trim()
                ? { inviteCode: inviteCode.trim() }
                : {}),
            });
      await props.onSuccess({ ...result, rememberMe });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel profile-gate auth-gate" aria-label="Sign in">
      <div className="profile-gate-hero">
        <BrandMark className="profile-gate-brand" variant="hero" />
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      </div>

      <form className="auth-gate-form" onSubmit={submit}>
        <label className="pilot-field profile-gate-field">
          Login
          <input
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            autoComplete="username"
            disabled={busy}
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            required
          />
        </label>

        {mode === 'register' ? (
          <>
            <label className="pilot-field profile-gate-field">
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={busy}
                minLength={2}
                maxLength={48}
                required
                placeholder="Alice"
              />
            </label>
            <label className="pilot-field profile-gate-field">
              <span className="auth-gate-field-head">
                Company name
                <span className="auth-gate-optional">optional</span>
              </span>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={busy}
                maxLength={48}
                placeholder="Defaults to display name"
              />
            </label>
            {inviteRequired ? (
              <label className="pilot-field profile-gate-field">
                Invite code
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  required
                  placeholder="World invite"
                />
              </label>
            ) : null}
          </>
        ) : null}

        <label className="pilot-field profile-gate-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            disabled={busy}
            minLength={6}
            required
          />
        </label>

        <label className="auth-gate-remember">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={busy}
          />
          <span>Remember me on this device (keeps you signed in)</span>
        </label>

        {error ? (
          <p className="banner error auth-gate-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="action accept auth-gate-submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {registerEnabled ? (
          <button
            type="button"
            className="action ghost auth-gate-switch"
            disabled={busy}
            onClick={() => {
              setLocalError(null);
              setMode(mode === 'login' ? 'register' : 'login');
            }}
          >
            {mode === 'login' ? 'Need an account? Create one' : 'Have an account? Sign in'}
          </button>
        ) : null}
      </form>
    </section>
  );
}
