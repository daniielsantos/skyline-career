import { useState } from 'react';
import type { CareerProfileMeta } from './api';
import { BrandMark } from './BrandMark';
import { BusySpinner } from './Busy';

export function ProfileGate(props: {
  profiles: CareerProfileMeta[];
  lastActiveId: string | null;
  busy: boolean;
  /** Shown while busy (default: Working…). */
  busyLabel?: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [newName, setNewName] = useState('');

  return (
    <section className="panel profile-gate" aria-label="Career profiles">
      <div className="profile-gate-hero">
        <BrandMark
          className="profile-gate-brand"
          subtitle="Career"
          variant="hero"
        />
        <h1>Select a profile</h1>
      </div>

      <div className="profile-gate-section">
        <p className="profile-gate-section-label">Saved profiles</p>
        <ul className="profile-gate-list">
          {props.profiles.length === 0 ? (
            <li className="profile-gate-empty muted">No profiles yet — create one below.</li>
          ) : (
            props.profiles.map((p) => {
              const isLast = p.id === props.lastActiveId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`profile-gate-play${isLast ? ' is-last' : ''}`}
                    disabled={props.busy}
                    onClick={() => props.onSelect(p.id)}
                  >
                    <span className="profile-gate-play-main">
                      <strong>{p.name}</strong>
                      {isLast ? (
                        <span className="profile-gate-last">Last played</span>
                      ) : null}
                    </span>
                    <span className="profile-gate-play-hint" aria-hidden>
                      Continue →
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <form
        className="profile-gate-create"
        onSubmit={(e) => {
          e.preventDefault();
          props.onCreate(newName);
          setNewName('');
        }}
      >
        <p className="profile-gate-section-label">New profile</p>
        <label className="pilot-field profile-gate-field">
          Pilot name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Pilot name"
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
          <BusySpinner />
          <span>{props.busyLabel ?? 'Working…'}</span>
        </div>
      ) : null}
    </section>
  );
}

/** Rename / delete the loaded save — Company tab, not the profile gate. */
export function CareerProfileManage(props: {
  name: string;
  canDelete: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.name);

  if (editing) {
    return (
      <form
        className="profile-manage-rename"
        onSubmit={(e) => {
          e.preventDefault();
          props.onRename(value);
          setEditing(false);
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          disabled={props.busy}
          minLength={2}
          required
          aria-label="Profile name"
        />
        <button type="submit" className="action" disabled={props.busy || value.trim().length < 2}>
          Save
        </button>
        <button
          type="button"
          className="action ghost"
          disabled={props.busy}
          onClick={() => {
            setValue(props.name);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="profile-manage">
      <p className="profile-manage-name">{props.name}</p>
      <div className="profile-manage-actions">
        <button
          type="button"
          className="action ghost"
          disabled={props.busy}
          onClick={() => {
            setValue(props.name);
            setEditing(true);
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className="action ghost danger"
          disabled={props.busy || !props.canDelete}
          title={props.canDelete ? 'Delete this save' : 'Delete unavailable'}
          onClick={() => props.onDelete()}
        >
          Delete
        </button>
      </div>
    </div>
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
      </div>
      <div className="profile-gate-loading-body">
        <BusySpinner size="lg" />
        <div className="profile-gate-loading-bars" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
