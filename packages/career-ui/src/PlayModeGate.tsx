import { useState } from 'react';
import { BrandMark } from './BrandMark';

export type DesktopPlayMode = 'sp' | 'mp';

export type DesktopPlayConfigView = {
  mode: DesktopPlayMode | null;
  savedMode: DesktopPlayMode | null;
  worldApiUrl: string;
  envForced: boolean;
  needsChoice: boolean;
  defaultWorldApiUrl: string;
  /** First-run / empty MP field — public production world. */
  suggestedMpWorldApiUrl?: string;
};

/**
 * First-run / switch gate: Single Player (local) vs Multiplayer (world host).
 */
export function PlayModeGate(props: {
  initialUrl?: string;
  /** Lab / SP fallback (typically http://127.0.0.1:8787). */
  defaultUrl: string;
  /** Prefill + placeholder when choosing Multiplayer. */
  suggestedMpUrl?: string;
  busy?: boolean;
  error?: string | null;
  /** When re-choosing from Settings — show current mode hint. */
  currentMode?: DesktopPlayMode | null;
  onChoose: (opts: {
    mode: DesktopPlayMode;
    worldApiUrl: string;
  }) => void | Promise<void>;
}) {
  const suggestedMp =
    props.suggestedMpUrl?.trim() || 'https://world.playairframe.com';
  const [mode, setMode] = useState<DesktopPlayMode>(
    props.currentMode === 'mp' ? 'mp' : 'sp',
  );
  const [worldUrl, setWorldUrl] = useState(
    () => props.initialUrl?.trim() || suggestedMp,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const busy = Boolean(props.busy || submitting);
  const error = props.error || localError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await props.onChoose({
        mode,
        worldApiUrl: mode === 'mp' ? worldUrl.trim() : props.defaultUrl,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="panel profile-gate play-mode-gate" aria-label="Play mode">
      <div className="profile-gate-hero">
        <BrandMark
          className="profile-gate-brand"
          subtitle="Career"
          variant="hero"
        />
        <h1>How do you want to play?</h1>
      </div>

      <form className="auth-gate-form" onSubmit={(e) => void submit(e)}>
        <div className="settings-choice" role="radiogroup" aria-label="Play mode">
          <button
            type="button"
            className={
              mode === 'sp' ? 'settings-choice-btn active' : 'settings-choice-btn'
            }
            disabled={busy}
            onClick={() => setMode('sp')}
          >
            Single Player
            <small>Local saves on this PC</small>
          </button>
          <button
            type="button"
            className={
              mode === 'mp' ? 'settings-choice-btn active' : 'settings-choice-btn'
            }
            disabled={busy}
            onClick={() => {
              setMode('mp');
              if (!worldUrl.trim() || worldUrl.trim() === props.defaultUrl) {
                setWorldUrl(suggestedMp);
              }
            }}
          >
            Multiplayer
            <small>Join a world host</small>
          </button>
        </div>

        {mode === 'mp' ? (
          <label className="pilot-field profile-gate-field">
            World URL
            <input
              value={worldUrl}
              onChange={(e) => setWorldUrl(e.target.value)}
              disabled={busy}
              placeholder={suggestedMp}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
        ) : (
          <p className="muted play-mode-gate-hint">
            Offline career with profiles on this machine. You can join a world
            later from Settings.
          </p>
        )}

        {error ? (
          <p className="banner error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="action primary" disabled={busy}>
          {busy ? 'Starting…' : mode === 'mp' ? 'Join world' : 'Play offline'}
        </button>
      </form>
    </section>
  );
}
