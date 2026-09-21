import { useMemo } from 'react';
import { PortsMap, type PortsMapFbo, type PortsMapPort } from './PortsMap';
import {
  type CompanyNetworkNode,
  findNetworkNode,
} from './company-network';

type Props = {
  nodes: CompanyNetworkNode[];
  /** null = All network */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Compact map of company assets (Hauls). Ports already has a full map. */
  showMap?: boolean;
  className?: string;
  disabled?: boolean;
};

/**
 * Interactive company logistics footprint — Port FBOs + remote WHs.
 * Members pick a node to filter desk work / Scout to that origin.
 */
export function VaCompanyNetwork(props: Props) {
  const { nodes, selectedId, onSelect, showMap = false, disabled } = props;
  const selected = findNetworkNode(nodes, selectedId);

  const mapPorts: PortsMapPort[] = useMemo(() => {
    return nodes
      .filter((n) => n.kind === 'fbo' && n.portId)
      .map((n) => ({
        id: n.portId!,
        name: n.title,
        lat: n.lat,
        lon: n.lon,
        pickupHubDetails: n.hubIcaos.map((icao) => ({
          icao,
          lat: n.lat,
          lon: n.lon,
        })),
      }));
  }, [nodes]);

  const mapWh: PortsMapFbo[] = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      icao: n.primaryHubIcao,
      lat: n.lat,
      lon: n.lon,
      name: n.title,
      tier: n.level ?? 1,
    }));
  }, [nodes]);

  if (nodes.length === 0) return null;

  const multi = nodes.length > 1;

  return (
    <div
      className={`va-company-network${props.className ? ` ${props.className}` : ''}`}
    >
      <div className="va-company-network-head">
        <p className="va-company-network-label">Company network</p>
        {multi ? (
          <button
            type="button"
            className={
              selectedId == null
                ? 'fbo-icao-chip active'
                : 'fbo-icao-chip'
            }
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            All
          </button>
        ) : null}
      </div>
      <div
        className="va-company-network-chips"
        role="listbox"
        aria-label="Company Port FBOs and warehouses"
      >
        {nodes.map((n) => {
          const active = selectedId === n.id || (!multi && selectedId == null);
          return (
            <button
              key={n.id}
              type="button"
              role="option"
              aria-selected={active}
              className={
                active
                  ? 'va-company-network-chip is-selected'
                  : 'va-company-network-chip'
              }
              disabled={disabled}
              title={n.subtitle}
              onClick={() =>
                onSelect(multi && selectedId === n.id ? null : n.id)
              }
            >
              <span className="va-company-network-chip-kind">
                {n.kind === 'fbo' ? 'FBO' : 'WH'}
              </span>
              <span className="va-company-network-chip-title">{n.title}</span>
              <span className="va-company-network-chip-sub muted">
                {n.kind === 'fbo'
                  ? `P${n.level ?? 1}${
                      n.primaryHubIcao ? ` · ${n.primaryHubIcao}` : ''
                    }`
                  : n.primaryHubIcao}
              </span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <p className="va-company-network-detail muted" role="status">
          {selected.subtitle}
        </p>
      ) : multi ? (
        <p className="va-company-network-detail muted" role="status">
          {nodes.filter((n) => n.kind === 'fbo').length} Port FBO
          {nodes.filter((n) => n.kind === 'fbo').length === 1 ? '' : 's'}
          {' · '}
          {nodes.filter((n) => n.kind === 'wh').length} remote WH
          {nodes.filter((n) => n.kind === 'wh').length === 1 ? '' : 's'}
          {' · select a node to filter desk work'}
        </p>
      ) : (
        <p className="va-company-network-detail muted" role="status">
          {nodes[0]?.subtitle}
        </p>
      )}
      {showMap && mapPorts.length + mapWh.length > 0 ? (
        <PortsMap
          className="va-company-network-map"
          ports={
            mapPorts.length > 0
              ? mapPorts
              : [
                  {
                    id: nodes[0]!.id,
                    name: nodes[0]!.title,
                    lat: nodes[0]!.lat,
                    lon: nodes[0]!.lon,
                    pickupHubDetails: [
                      {
                        icao: nodes[0]!.primaryHubIcao,
                        lat: nodes[0]!.lat,
                        lon: nodes[0]!.lon,
                      },
                    ],
                  },
                ]
          }
          ownedFbos={mapWh}
          selectedPortId={selected?.portId ?? null}
          highlightedHubIcao={selected?.primaryHubIcao ?? null}
          onSelectPort={(portId) => {
            const hit = nodes.find(
              (n) =>
                n.portId?.toUpperCase() === portId.toUpperCase(),
            );
            if (hit) onSelect(hit.id);
          }}
          onSelectHub={(icao) => {
            const code = icao.trim().toUpperCase();
            const hit = nodes.find((n) => n.hubIcaos.includes(code));
            if (hit) onSelect(hit.id);
          }}
        />
      ) : null}
    </div>
  );
}
