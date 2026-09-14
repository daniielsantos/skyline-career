import { useState } from 'react';
import { BrandMark } from './BrandMark';

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
};

type Mode = 'login' | 'register';

/**
 * Minimal local Auth gate (account → company). Shown when host has CAREER_AUTH=1.
 */
export function AuthGate(props: {
  busy?: boolean;
  error?: string | null;
  onLogin: (opts: {
    loginName: string;
    password: string;
  }) => Promise<AuthGateResult>;
  onRegister: (opts: {
    loginName: string;
    displayName: string;
    password: string;
    companyDisplayName?: string;
  }) => Promise<AuthGateResult>;
  onSuccess: (result: AuthGateResult) => void;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
            });
      props.onSuccess(result);
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
            placeholder="alice"
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

        {error ? (
          <p className="banner error auth-gate-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="action accept auth-gate-submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

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
      </form>
    </section>
  );
}
