import {
  type CompanyNetworkNode,
  findNetworkNode,
} from './company-network';
import {
  CompanyNetworkMap,
  type CompanyNetworkCorridorRing,
} from './CompanyNetworkMap';
import { NetworkChipIcon } from './company-network-icons';
import { formatMass, type WeightSystem } from './weight-units';

export type CompanyNetworkHighlightRoute = {
  originIcao: string;
  destIcao: string;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
};

type Props = {
  nodes: CompanyNetworkNode[];
  /** null = All network */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Desk-hold OD to draw on the map (Hauls Open desk selection). */
  highlightRoute?: CompanyNetworkHighlightRoute | null;
  /** Demand corridor reach disk (Ports FBO selection; P3 open = omit). */
  corridorRing?: CompanyNetworkCorridorRing | null;
  /** Compact map of company assets (Hauls). Ports already has a full map. */
  showMap?: boolean;
  /** Hide the All chip (Ports uses explicit Demand / Buy actions). */
  hideAllChip?: boolean;
  className?: string;
  disabled?: boolean;
  weightSystem?: WeightSystem;
};

function nodeRoomLine(
  n: CompanyNetworkNode,
  weightSystem: WeightSystem,
): string {
  if (n.kind === 'hq') return 'Headquarters';
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

/**
 * Interactive company logistics footprint — Port FBOs + company WHs.
 * Members pick a node to filter desk work / Scout to that origin.
 */
export function VaCompanyNetwork(props: Props) {
  const {
    nodes,
    selectedId,
    onSelect,
    showMap = false,
    hideAllChip = false,
    disabled,
    weightSystem = 'metric',
  } = props;
  const selected = findNetworkNode(nodes, selectedId);

  if (nodes.length === 0) return null;

  const multi = nodes.length > 1;
  const whCount = nodes.filter((n) => n.kind === 'wh').length;
  const fboCount = nodes.filter((n) => n.kind === 'fbo').length;
  const hqCount = nodes.filter((n) => n.kind === 'hq').length;
  const detail = selected
    ? nodeRoomLine(selected, weightSystem)
    : multi
      ? [
          hqCount > 0 ? `${hqCount} HQ` : null,
          `${fboCount} Port FBO${fboCount === 1 ? '' : 's'}`,
          `${whCount} WH${whCount === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' · ') + ' · select a node'
      : nodes[0]
        ? nodeRoomLine(nodes[0], weightSystem)
        : '';

  return (
    <div
      className={`va-company-network${props.className ? ` ${props.className}` : ''}`}
    >
      <div className="va-company-network-head">
        <p className="va-company-network-label">Company network</p>
        {multi && !hideAllChip ? (
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
                  {n.kind === 'fbo' ? 'FBO' : n.kind === 'hq' ? 'HQ' : 'WH'}
                </span>
                <span className="va-company-network-chip-title">{n.title}</span>
                <span className="va-company-network-chip-sub muted">
                  {n.kind === 'fbo'
                    ? `P${n.level ?? 1}${
                        n.primaryHubIcao ? ` · ${n.primaryHubIcao}` : ''
                      }`
                    : n.kind === 'hq'
                      ? 'Home'
                      : n.primaryHubIcao}
                </span>
              </span>
              {n.badge ? (
                <span className="va-company-network-chip-badge" aria-label={n.badge}>
                  {n.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {detail ? (
        <p className="va-company-network-detail muted" role="status">
          {detail}
        </p>
      ) : null}
      {showMap && nodes.length > 0 ? (
        <CompanyNetworkMap
          className="va-company-network-map"
          nodes={nodes}
          selectedId={selectedId}
          highlightRoute={props.highlightRoute ?? null}
          corridorRing={props.corridorRing ?? null}
          onSelectNode={(id) => onSelect(id)}
        />
      ) : null}
    </div>
  );
}
