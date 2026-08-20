import { marketCountryLabel } from './market-country-label';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type AircraftMarketCountryOption = {
  countryId: string;
  count: number;
  isHome?: boolean;
};

function optionLabel(
  opt: AircraftMarketCountryOption,
  homeCountryId: string,
): string {
  if (opt.countryId === 'WORLD') {
    const count = opt.count > 0 ? ` · ${opt.count}` : '';
    return `Worldwide${count}`;
  }
  const name = marketCountryLabel(opt.countryId);
  const home =
    opt.isHome || opt.countryId === homeCountryId ? ' · home' : '';
  const count = opt.count > 0 ? ` · ${opt.count}` : '';
  return `${name}${home}${count}`;
}

function optionMatches(
  opt: AircraftMarketCountryOption,
  homeCountryId: string,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const id = opt.countryId.toLowerCase();
  if (id.includes(q)) return true;
  const name = marketCountryLabel(opt.countryId).toLowerCase();
  if (name.includes(q)) return true;
  if (opt.countryId === 'WORLD') {
    if ('worldwide'.includes(q) || q.includes('world')) return true;
  }
  if (opt.isHome || opt.countryId === homeCountryId) {
    if ('home'.includes(q) || q === 'home') return true;
  }
  const label = optionLabel(opt, homeCountryId).toLowerCase();
  return label.includes(q);
}

type MenuBox = { top: number; left: number; width: number; maxHeight: number };

export function AircraftMarketCountryCombobox(props: {
  options: AircraftMarketCountryOption[];
  homeCountryId: string;
  value: string;
  onChange: (countryId: string) => void;
  disabled?: boolean;
  maxResults?: number;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const home = props.homeCountryId.trim().toUpperCase();
  const committedLabel = useMemo(() => {
    const id = props.value.trim().toUpperCase();
    const opt =
      props.options.find((row) => row.countryId === id) ??
      (id && id !== 'WORLD' && id === home
        ? { countryId: id, count: 0, isHome: true }
        : undefined);
    if (opt) return optionLabel(opt, home);
    if (id === 'WORLD') return optionLabel({ countryId: 'WORLD', count: 0 }, home);
    if (id) return marketCountryLabel(id);
    return '';
  }, [props.options, props.value, home]);

  const [query, setQuery] = useState(committedLabel);
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<MenuBox | null>(null);
  const maxResults = props.maxResults ?? 14;

  useEffect(() => {
    if (!open) setQuery(committedLabel);
  }, [committedLabel, open]);

  const matches = useMemo(() => {
    const filtered = props.options.filter((opt) =>
      optionMatches(opt, home, query),
    );
    return filtered.slice(0, maxResults);
  }, [props.options, home, query, maxResults]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return '';
    const byId = props.options.find(
      (opt) => opt.countryId.toLowerCase() === q,
    );
    if (byId) return byId.countryId;
    const byLabel = props.options.find(
      (opt) => optionLabel(opt, home).toLowerCase() === q,
    );
    if (byLabel) return byLabel.countryId;
    const byName = props.options.find(
      (opt) => marketCountryLabel(opt.countryId).toLowerCase() === q,
    );
    return byName?.countryId ?? '';
  }, [props.options, home, query]);

  const showMenu =
    open && !props.disabled && (matches.length > 0 || Boolean(query.trim()));

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
      Math.min(280, preferBelow ? spaceBelow : spaceAbove),
    );
    setMenuBox({
      top: preferBelow
        ? rect.bottom + gap
        : Math.max(8, rect.top - gap - maxHeight),
      left: rect.left,
      width: Math.max(rect.width, 220),
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

  function commitCountry(countryId: string) {
    const next = countryId.trim().toUpperCase();
    props.onChange(next);
    setOpen(false);
  }

  function onQueryChange(raw: string) {
    setQuery(raw);
    setOpen(true);
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
            className="ferry-hub-menu aircraft-market-country-menu"
            style={{
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              maxHeight: menuBox.maxHeight,
            }}
          >
            {matches.length > 0 ? (
              <ul id={listId} className="ferry-hub-suggestions" role="listbox">
                {matches.map((opt) => (
                  <li key={opt.countryId} role="option">
                    <button
                      type="button"
                      className={
                        opt.countryId === props.value
                          ? 'ferry-hub-option is-active'
                          : 'ferry-hub-option'
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commitCountry(opt.countryId)}
                    >
                      <strong>{optionLabel(opt, home)}</strong>
                      {opt.countryId !== 'WORLD' ? (
                        <span>{opt.countryId}</span>
                      ) : (
                        <span>All dealer stock · every country</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ferry-hub-empty">
                No countries match “{query.trim()}”
              </p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="ferry-hub-combobox aircraft-market-country-combobox is-plain">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Dealer country or worldwide"
        autoComplete="off"
        spellCheck={false}
        placeholder="Country or Worldwide…"
        value={open ? query : committedLabel}
        disabled={props.disabled}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => {
          setQuery(committedLabel);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQuery(committedLabel);
              return;
            }
            setOpen(false);
            e.currentTarget.blur();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (exactMatch) {
              commitCountry(exactMatch);
            } else if (matches.length === 1) {
              commitCountry(matches[0]!.countryId);
            }
          }
        }}
      />
      {menu}
    </div>
  );
}
