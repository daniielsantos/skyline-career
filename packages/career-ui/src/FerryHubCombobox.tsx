import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type FerryHubOption = {
  icao: string;
  name?: string;
};

function hubMatches(hub: FerryHubOption, rawQuery: string): boolean {
  const q = rawQuery.trim().toUpperCase();
  if (!q) return true;
  if (hub.icao.includes(q)) return true;
  const name = (hub.name ?? '').toUpperCase();
  return name.includes(q);
}

type MenuBox = { top: number; left: number; width: number; maxHeight: number };

/**
 * Filterable ICAO combobox for Hangar ferry (type to narrow 100+ hubs).
 * Suggestions render in a portal with fixed position so hangar-card overflow
 * cannot clip them.
 */
export function FerryHubCombobox(props: {
  hubs: FerryHubOption[];
  excludeIcao: string;
  value: string;
  onChange: (icao: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(props.value);
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<MenuBox | null>(null);

  useEffect(() => {
    setQuery(props.value);
  }, [props.value]);

  const available = useMemo(
    () =>
      props.hubs.filter(
        (hub) => hub.icao && hub.icao !== props.excludeIcao.toUpperCase(),
      ),
    [props.hubs, props.excludeIcao],
  );

  const matches = useMemo(() => {
    const filtered = available.filter((hub) => hubMatches(hub, query));
    return filtered.slice(0, 12);
  }, [available, query]);

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
    const next = raw.toUpperCase();
    setQuery(next);
    setOpen(true);
    const trimmed = next.trim();
    if (!trimmed) {
      props.onChange('');
      return;
    }
    props.onChange(
      available.some((hub) => hub.icao === trimmed) ? trimmed : '',
    );
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
                      {hub.name ? <span>{hub.name}</span> : null}
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
    <div className="ferry-hub-combobox" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Type ICAO or name…"
        value={query}
        disabled={props.disabled}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
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
