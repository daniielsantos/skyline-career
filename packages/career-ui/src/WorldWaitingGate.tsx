import { BrandMark } from './BrandMark';

/** Shown on CAREER_WORLD_FIXED clients while the host world SQLite is not open yet. */
export function WorldWaitingGate(props: {
  message?: string;
}) {
  return (
    <section className="panel profile-gate auth-gate" aria-label="Waiting for world">
      <div className="profile-gate-hero">
        <BrandMark className="profile-gate-brand" variant="hero" />
        <h1>Waiting for world</h1>
        <p className="muted auth-gate-lead">
          {props.message ??
            'The host opens one shared world DB. This screen retries every few seconds after a deploy or restart — you do not need to refresh.'}
        </p>
      </div>
      <div className="profile-gate-busy" role="status" aria-live="polite">
        <span className="profile-gate-spinner profile-gate-spinner-lg" aria-hidden />
        <span>Listening for host…</span>
      </div>
    </section>
  );
}
