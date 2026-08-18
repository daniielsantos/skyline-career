import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type FerryHubOption = {
  icao: string;
  name?: string;
  region?: string;
  detail?: string;
};

function hubMatches(hub: FerryHubOption, rawQuery: string): boolean {
  const q = rawQuery.trim().toUpperCase();
  if (!q) return true;
  if (hub.icao.includes(q)) return true;
  const name = (hub.name ?? '').toUpperCase();
  if (name.includes(q)) return true;
  const region = (hub.region ?? '').toUpperCase();
  if (region.includes(q)) return true;
  const detail = (hub.detail ?? '').toUpperCase();
  return detail.includes(q);
}

type MenuBox = { top: number; left: number; width: number; maxHeight: number };

/**
 * Filterable ICAO combobox for Hangar ferry (type to narrow 100+ hubs).
 * Suggestions render in a portal with fixed position so hangar-card overflow
 * cannot clip them.
 */
export function FerryHubCombobox(props: {
  hubs: FerryHubOption[];
  excludeIcao?: string;
  value: string;
  onChange: (icao: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  maxResults?: number;
  /** Keep typed case (city / country search). Ferry stays uppercase via CSS. */
  plainText?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(props.value);
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<MenuBox | null>(null);
  const exclude = (props.excludeIcao ?? '').toUpperCase();
  const maxResults = props.maxResults ?? 12;

  useEffect(() => {
    setQuery((current) => {
      const committed = (props.value ?? '').trim().toUpperCase();
      if (committed) return committed;
      const q = current.trim().toUpperCase();
      if (!q) return '';
      // Parent cleared (or never committed): keep in-progress filter text.
      return current;
    });
  }, [props.value]);

  const available = useMemo(
    () =>
      props.hubs.filter(
        (hub) => hub.icao && hub.icao !== exclude,
      ),
    [props.hubs, exclude],
  );

  const matches = useMemo(() => {
    const filtered = available.filter((hub) => hubMatches(hub, query));
    return filtered.slice(0, maxResults);
  }, [available, query, maxResults]);

  const exactIcao = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return '';
    return available.some((hub) => hub.icao === q) ? q : '';
  }, [available, query]);

  const showMenu =
    open &&
    !props.disabled &&
    (matches.length > 0 || Boolean(query.trim()));

  function updateMenuBox() {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const preferBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(
      120,
      Math.min(224, preferBelow ? spaceBelow : spaceAbove),
    );
    setMenuBox({
      top: preferBelow
        ? rect.bottom + gap
        : Math.max(8, rect.top - gap - maxHeight),
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }

  useLayoutEffect(() => {
    if (!showMenu) {
      setMenuBox(null);
      return;
    }
    updateMenuBox();
    function onReposition() {
      updateMenuBox();
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [showMenu, matches.length, query]);

  function commitIcao(icao: string) {
    const next = icao.trim().toUpperCase();
    setQuery(next);
    props.onChange(next);
    setOpen(false);
  }

  function onQueryChange(raw: string) {
    const next = props.plainText ? raw : raw.toUpperCase();
    setQuery(next);
    setOpen(true);
    const trimmed = next.trim().toUpperCase();
    if (!trimmed) {
      props.onChange('');
      return;
    }
    // Commit only exact ICAOs. Partial filter must not push '' in a way that
    // re-syncs and wipes the query — parent clear is ok if we keep local text.
    if (available.some((hub) => hub.icao === trimmed)) {
      props.onChange(trimmed);
      setOpen(false);
    } else {
      props.onChange('');
    }
  }

  useEffect(() => {
    function onDocPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, []);

  const menu =
    showMenu && menuBox
      ? createPortal(
          <div
            ref={menuRef}
            className="ferry-hub-menu"
            style={{
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              maxHeight: menuBox.maxHeight,
            }}
          >
            {matches.length > 0 ? (
              <ul id={listId} className="ferry-hub-suggestions" role="listbox">
                {matches.map((hub) => (
                  <li key={hub.icao} role="option">
                    <button
                      type="button"
                      className={
                        hub.icao === exactIcao
                          ? 'ferry-hub-option is-active'
                          : 'ferry-hub-option'
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commitIcao(hub.icao)}
                    >
                      <strong>{hub.icao}</strong>
                      {hub.name || hub.detail ? (
                        <span>
                          {[hub.name, hub.detail].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ferry-hub-empty">
                No hubs match “{query.trim()}”
              </p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`ferry-hub-combobox${props.plainText ? ' is-plain' : ''}`}
      ref={rootRef}
    >
      <input
        id={props.id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={props.placeholder ?? 'Type ICAO or name…'}
        value={query}
        disabled={props.disabled}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            setOpen(false);
            e.currentTarget.blur();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (exactIcao) {
              commitIcao(exactIcao);
            } else if (matches.length === 1) {
              commitIcao(matches[0]!.icao);
            }
          }
        }}
      />
      {menu}
    </div>
  );
}
