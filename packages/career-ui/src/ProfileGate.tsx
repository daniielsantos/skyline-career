import { useState } from 'react';
import type { CareerProfileMeta } from './api';
import { BrandMark } from './BrandMark';

export function ProfileGate(props: {
  profiles: CareerProfileMeta[];
  lastActiveId: string | null;
  busy: boolean;
  /** Shown while busy (default: Working…). */
  busyLabel?: string;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  return (
    <section className="panel profile-gate" aria-label="Career profiles">
      <div className="profile-gate-hero">
        <BrandMark
          className="profile-gate-brand"
          subtitle="Career"
          variant="hero"
        />
        <h1>Choose a profile</h1>
        <p className="muted">
          Each profile has its own wallet, fleet, and missions. Shared hub data
          stays the same for everyone.
        </p>
      </div>

      {props.error ? (
        <p className="error" role="alert">
          {props.error}
        </p>
      ) : null}

      <ul className="profile-gate-list">
        {props.profiles.length === 0 ? (
          <li className="muted">No saves yet — create one below.</li>
        ) : (
          props.profiles.map((p) => {
            const isLast = p.id === props.lastActiveId;
            const isRenaming = renamingId === p.id;
            return (
              <li key={p.id} className="profile-gate-row">
                {isRenaming ? (
                  <form
                    className="profile-gate-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      props.onRename(p.id, renameValue);
                      setRenamingId(null);
                    }}
                  >
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                      disabled={props.busy}
                      aria-label="Rename profile"
                    />
                    <button type="submit" className="action" disabled={props.busy}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="action ghost"
                      disabled={props.busy}
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="profile-gate-play"
                      disabled={props.busy}
                      onClick={() => props.onSelect(p.id)}
                    >
                      <strong>{p.name}</strong>
                      <span className="muted">
                        {isLast ? 'Last played · ' : ''}
                        updated {new Date(p.updatedAt).toLocaleString()}
                      </span>
                    </button>
                    <div className="profile-gate-row-actions">
                      <button
                        type="button"
                        className="action ghost"
                        disabled={props.busy}
                        onClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="action ghost"
                        disabled={props.busy || props.profiles.length <= 1}
                        title={
                          props.profiles.length <= 1
                            ? 'Cannot delete the last profile'
                            : 'Delete this save'
                        }
                        onClick={() => props.onDelete(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })
        )}
      </ul>

      <form
        className="profile-gate-create"
        onSubmit={(e) => {
          e.preventDefault();
          props.onCreate(newName);
          setNewName('');
        }}
      >
        <label className="pilot-field">
          New profile
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Daniel · US bush"
            disabled={props.busy}
            minLength={2}
            required
          />
        </label>
        <button
          type="submit"
          className="accept"
          disabled={props.busy || newName.trim().length < 2}
        >
          Create profile
        </button>
      </form>

      {props.busy ? (
        <div className="profile-gate-busy" role="status" aria-live="polite">
          <span className="profile-gate-spinner" aria-hidden />
          <span>{props.busyLabel ?? 'Working…'}</span>
        </div>
      ) : null}
    </section>
  );
}

/** Boot splash while `/api/profiles` (and desktop API bring-up) settle. */
export function ProfileGateLoading() {
  return (
    <section
      className="panel profile-gate profile-gate-loading"
      aria-busy="true"
      aria-label="Loading career profiles"
    >
      <div className="profile-gate-hero">
        <BrandMark
          className="profile-gate-brand"
          subtitle="Career"
          variant="hero"
        />
        <h1>Loading</h1>
        <p className="muted">Preparing your profiles…</p>
      </div>
      <div className="profile-gate-loading-body">
        <span className="profile-gate-spinner profile-gate-spinner-lg" aria-hidden />
        <div className="profile-gate-loading-bars" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
