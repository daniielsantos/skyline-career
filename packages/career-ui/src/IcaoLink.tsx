import { createContext, useContext, type ReactNode } from 'react';

const AirportNamesContext = createContext<ReadonlyMap<string, string>>(
  new Map(),
);

export function AirportNamesProvider(props: {
  names: ReadonlyMap<string, string>;
  children: ReactNode;
}) {
  return (
    <AirportNamesContext.Provider value={props.names}>
      {props.children}
    </AirportNamesContext.Provider>
  );
}

export function IcaoLink(props: {
  icao: string;
  onOpen: (icao: string) => void;
  disabled?: boolean;
  /** Overrides the hub catalog / board name. */
  name?: string;
}) {
  const names = useContext(AirportNamesContext);
  const code = props.icao.trim().toUpperCase();
  const name = props.name?.trim() || names.get(code);
  const title =
    name && name.toUpperCase() !== code ? name : `Open ${code} terminal`;

  return (
    <button
      type="button"
      className="icao-link"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onOpen(props.icao);
      }}
      title={title}
    >
      {props.icao}
    </button>
  );
}
