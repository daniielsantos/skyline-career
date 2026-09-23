import { useEffect, useState } from 'react';
import type { VaCompanyNetworkNode, VaDirectoryEntry } from './api';
import { formatVaCutsPair, VA_CUTS_TOOLTIP } from './va-cuts-copy';
import { VaCompanyNetwork } from './VaCompanyNetwork';
import type { CompanyNetworkNode } from './company-network';

type Props = {
  airline: VaDirectoryEntry;
  network: VaCompanyNetworkNode[];
  alreadyInVa: boolean;
  busy: boolean;
  onBack: () => void;
  onRequestJoin: () => void;
};

function asNetworkNodes(nodes: VaCompanyNetworkNode[]): CompanyNetworkNode[] {
  return nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    subtitle: n.subtitle,
    portId: n.portId,
    hubIcaos: n.hubIcaos,
    primaryHubIcao: n.primaryHubIcao,
    lat: n.lat,
    lon: n.lon,
    level: n.level,
    freeKg: n.freeKg,
    capacityKg: n.capacityKg,
  }));
}

/**
 * Public Airlines profile — HQ + Port FBOs + WHs on the company network map.
 * Join CTA only; not the Crew desk.
 */
export function VaAirlineProfilePanel(props: Props) {
  const { airline } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodes = asNetworkNodes(props.network);

  useEffect(() => {
    setSelectedId(null);
  }, [airline.companyId]);

  const isOwnerHere = airline.myRole === 'owner';
  const isMemberHere =
    airline.myRole === 'pilot' || airline.myRole === 'dispatcher';
  const canRequest =
    !props.alreadyInVa &&
    !isOwnerHere &&
    !isMemberHere &&
    airline.recruiting &&
    airline.seatsOpen > 0 &&
    airline.myRequestStatus !== 'pending' &&
    airline.myRequestStatus !== 'accepted';

  const portCount = nodes.filter((n) => n.kind === 'fbo').length;
  const whCount = nodes.filter((n) => n.kind === 'wh').length;

  return (
    <section className="va-airline-profile" aria-label="Airline profile">
      <div className="va-airline-profile-toolbar">
        <button
          type="button"
          className="action ghost"
          onClick={props.onBack}
        >
          ← Airlines
        </button>
        {canRequest ? (
          <button
            type="button"
            className="accept"
            disabled={props.busy}
            onClick={props.onRequestJoin}
          >
            Request join
          </button>
        ) : airline.myRequestStatus === 'pending' ? (
          <span className="va-directory-pending">Request pending</span>
        ) : isOwnerHere || isMemberHere ? (
          <span className="badge va-directory-yours">
            {isOwnerHere ? 'Yours' : 'Joined'}
          </span>
        ) : null}
      </div>

      <header className="va-airline-profile-head">
        <h2 className="va-airline-profile-name">{airline.displayName}</h2>
        <div className="va-directory-card-stats va-airline-profile-stats">
          <div>
            <span className="va-stat-label">HQ</span>
            <span className="va-stat-value">
              {airline.homeHubIcao || '—'}
            </span>
          </div>
          <div>
            <span className="va-stat-label">Pilots</span>
            <span className="va-stat-value">
              {airline.memberCount}/{airline.memberCap}
            </span>
          </div>
          <div>
            <span className="va-stat-label">Fleet</span>
            <span className="va-stat-value">
              {airline.aircraftCount ?? 0}
            </span>
          </div>
          <div>
            <span className="va-stat-label">Ports</span>
            <span className="va-stat-value">{portCount}</span>
          </div>
          <div>
            <span className="va-stat-label">WH</span>
            <span className="va-stat-value">{whCount}</span>
          </div>
          <div>
            <span className="va-stat-label">Hiring</span>
            <span
              className={`va-stat-value${airline.recruiting ? ' is-open' : ' is-closed'}`}
            >
              {airline.recruiting ? 'Open' : 'Closed'}
            </span>
          </div>
          <div className="va-stat-cuts" title={VA_CUTS_TOOLTIP}>
            <span className="va-stat-label">Cuts</span>
            <span className="va-stat-value">
              {formatVaCutsPair(
                airline.memberRouteCutPct,
                airline.memberAirlineCutPct,
              )}
            </span>
          </div>
          {airline.orgPerks && airline.orgPerks.tier > 0 ? (
            <div>
              <span className="va-stat-label">Perks</span>
              <span className="va-stat-value">{airline.orgPerks.tierName}</span>
            </div>
          ) : null}
        </div>
      </header>

      {nodes.length === 0 ? (
        <p className="muted va-airline-profile-empty">
          No mapped footprint yet — HQ coords missing.
        </p>
      ) : (
        <VaCompanyNetwork
          className="va-airline-profile-network"
          nodes={nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showMap
        />
      )}
    </section>
  );
}
