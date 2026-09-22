import { useMemo } from 'react';
import { PortsMap, type PortsMapFbo, type PortsMapPort } from './PortsMap';
import {
  type CompanyNetworkNode,
  findNetworkNode,
} from './company-network';
import { formatMass, type WeightSystem } from './weight-units';

type Props = {
  nodes: CompanyNetworkNode[];
  /** null = All network */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Compact map of company assets (Hauls). Ports already has a full map. */
  showMap?: boolean;
  className?: string;
  disabled?: boolean;
  weightSystem?: WeightSystem;
};

function nodeRoomLine(
  n: CompanyNetworkNode,
  weightSystem: WeightSystem,
): string {
  if (n.freeKg != null && n.capacityKg != null) {
    const room = `${formatMass(n.freeKg, weightSystem)} free / ${formatMass(
      n.capacityKg,
      weightSystem,
    )}`;
    return n.kind === 'fbo'
      ? `Port FBO P${n.level ?? 1} · ${room}`
      : `Warehouse · ${room}`;
  }
  return n.subtitle;
}

function NetworkChipIcon(props: { kind: 'fbo' | 'wh' }) {
  if (props.kind === 'fbo') {
    return (
      <svg
        className="va-company-network-chip-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="3"
          y="10"
          width="18"
          height="10"
          rx="1.5"
          fill="currentColor"
          opacity="0.22"
        />
        <path
          d="M4 10V7.5L12 3l8 4.5V10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8 20v-5h3v5M13 20v-3.5h3V20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="8" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      className="va-company-network-chip-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.5"
        y="6"
        width="17"
        height="13"
        rx="1.5"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M3.5 10.5h17M12 6v13M7.5 6v13M16.5 6v13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 19.5h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Interactive company logistics footprint — Port FBOs + remote WHs.
 * Members pick a node to filter desk work / Scout to that origin.
 */
export function VaCompanyNetwork(props: Props) {
  const {
    nodes,
    selectedId,
    onSelect,
    showMap = false,
    disabled,
    weightSystem = 'metric',
  } = props;
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

  // Only remote WH nodes — FBO already drawn as port (was stacking both).
  const mapWh: PortsMapFbo[] = useMemo(() => {
    return nodes
      .filter((n) => n.kind === 'wh')
      .map((n) => ({
        id: n.id,
        icao: n.primaryHubIcao,
        lat: n.lat,
        lon: n.lon,
        name: n.title,
        tier: 1,
      }));
  }, [nodes]);

  if (nodes.length === 0) return null;

  const multi = nodes.length > 1;
  const detail = selected
    ? nodeRoomLine(selected, weightSystem)
    : multi
      ? `${nodes.filter((n) => n.kind === 'fbo').length} Port FBO${
          nodes.filter((n) => n.kind === 'fbo').length === 1 ? '' : 's'
        } · ${nodes.filter((n) => n.kind === 'wh').length} remote WH${
          nodes.filter((n) => n.kind === 'wh').length === 1 ? '' : 's'
        } · select a node to filter desk work`
      : nodes[0]
        ? nodeRoomLine(nodes[0], weightSystem)
        : '';

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
              title={nodeRoomLine(n, weightSystem)}
              onClick={() =>
                onSelect(multi && selectedId === n.id ? null : n.id)
              }
            >
              <NetworkChipIcon kind={n.kind} />
              <span className="va-company-network-chip-text">
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
              </span>
            </button>
          );
        })}
      </div>
      {detail ? (
        <p className="va-company-network-detail muted" role="status">
          {detail}
        </p>
      ) : null}
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
