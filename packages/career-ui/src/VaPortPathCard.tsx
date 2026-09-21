import { useCallback, useEffect, useState } from 'react';
import { fetchPorts, type PortsSnapshot } from './api';
import { formatBoardMoney } from './board-money';

function formatMassKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

type PathStep = {
  id: string;
  done: boolean;
  label: string;
};

type Props = {
  companyId: string;
  homeHubIcao: string;
  walletUsd: number;
  /** Owner sees claim CTA; members see shared progress only. */
  isOwner: boolean;
  busy?: boolean;
  onGoPorts?: () => void;
};

/**
 * Company ladder: WH → T3 → Port FBO claim → desk/Hauls.
 * Reads Ports snapshot while My VA has the company tenant pinned.
 */
export function VaPortPathCard(props: Props) {
  const [loaded, setLoaded] = useState(false);
  const [steps, setSteps] = useState<PathStep[]>([]);
  const [headline, setHeadline] = useState<string>('');
  const [detail, setDetail] = useState<string>('');
  const [claimReady, setClaimReady] = useState(false);
  const [hasFbo, setHasFbo] = useState(false);
  const [portName, setPortName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const hub = props.homeHubIcao.trim().toUpperCase();
    if (!hub || !props.companyId) {
      setLoaded(true);
      setSteps([]);
      setHeadline('Set a home hub on Company to unlock the Port FBO path.');
      setDetail('');
      setClaimReady(false);
      setHasFbo(false);
      setPortName(null);
      return;
    }
    try {
      const snap: PortsSnapshot = await fetchPorts();
      const owned = snap.ports.find(
        (p) =>
          p.concession?.status === 'yours' ||
          (p.concession?.companyId &&
            p.concession.companyId === props.companyId),
      );
      if (owned) {
        const level = owned.concession?.level ?? 1;
        setHasFbo(true);
        setClaimReady(false);
        setPortName(owned.name);
        setHeadline(
          `Port FBO P${level} · ${owned.name} — desk buy/Scout on Ports; post Internal Hauls for the board.`,
        );
        setDetail(
          props.isOwner
            ? 'Members inherit buy/ETA at this port. Create paid bridges so Hauls has work.'
            : 'Company Port FBO is live — you inherit buy discount/ETA here; fly Freights VA or Accept Hauls.',
        );
        setSteps([
          { id: 'fbo', done: true, label: `Port FBO · ${owned.name} · P${level}` },
        ]);
        setLoaded(true);
        return;
      }

      const port =
        snap.ports.find((p) =>
          (p.pickupHubs ?? []).some((h) => h.toUpperCase() === hub),
        ) ?? null;
      const wh = (snap.warehouses?.warehouses ?? []).find(
        (w) => w.icao.trim().toUpperCase() === hub,
      );
      const claim = port?.concession?.claim ?? null;
      const tier = wh?.tier ?? 0;
      const shipped = Math.max(
        wh?.lifetimeShippedKg ?? 0,
        claim?.shippedKg ?? 0,
      );
      const shippedNeed =
        claim?.shippedNeededKg ?? 25_000;
      const hasT3 = Boolean(claim?.hasTier3Warehouse) || tier >= 3;
      const dueUsd =
        claim != null
          ? (claim.claimUsd ?? 0) + (claim.leaseUsd ?? 0)
          : 175_000 + 2_500 * 7;
      const canAfford = props.walletUsd >= dueUsd;
      const ready = Boolean(claim?.ok);

      setHasFbo(false);
      setClaimReady(ready);
      setPortName(port?.name ?? null);

      const next: PathStep[] = [
        {
          id: 'wh',
          done: Boolean(wh),
          label: wh
            ? `Warehouse ${hub} · T${tier}`
            : `Buy a warehouse at ${hub} (Ports → Warehouse)`,
        },
        {
          id: 't3',
          done: hasT3,
          label: hasT3
            ? `WH T3+ at ${hub}`
            : `Upgrade WH at ${hub} to T3 (company CAPEX)`,
        },
        {
          id: 'ship',
          done: shipped >= shippedNeed,
          label:
            shipped >= shippedNeed
              ? `Shipped ${formatMassKg(shipped)} through ${hub}`
              : `Ship ${formatMassKg(shipped)} / ${formatMassKg(shippedNeed)} via company WH at ${hub}`,
        },
        {
          id: 'cash',
          done: canAfford,
          label: canAfford
            ? `Ledger covers claim + lease (${formatBoardMoney(dueUsd)})`
            : `Need ~${formatBoardMoney(dueUsd)} on the VA Ledger (claim + first lease)`,
        },
        {
          id: 'claim',
          done: false,
          label: port
            ? `Claim Port FBO · ${port.name}`
            : 'Claim Port FBO at the seaport serving your home hub',
        },
      ];
      setSteps(next);

      if (ready) {
        setHeadline(
          port
            ? `Ready to claim ${port.name} — Port FBO unlocks desk buy/Scout and richer Hauls.`
            : 'Ready to claim Port FBO on Ports.',
        );
        setDetail(
          props.isOwner
            ? 'Open Ports desk and claim. Until then Freights with VA tails still work.'
            : 'Owner claims on Ports when the company hits the gates — you can fly Freights VA meanwhile.',
        );
      } else {
        const blocker =
          claim?.reasons?.[0] ??
          (!wh
            ? `No warehouse at ${hub} yet`
            : !hasT3
              ? `WH at ${hub} is T${tier || '—'} — need T3`
              : shipped < shippedNeed
                ? `Need more throughput through ${hub}`
                : !canAfford
                  ? 'VA Ledger needs more cash for claim + lease'
                  : 'Finish the steps below');
        setHeadline(
          `Path to Port FBO${port ? ` · ${port.name}` : ''} — ${blocker}.`,
        );
        setDetail(
          props.isOwner
            ? 'This is company CAPEX on the VA Ledger — not your home wallet. Freights VA work before Port FBO.'
            : 'Shared company goal. Fly VA freights; owner builds WH/Port FBO. Hauls fill after desk stock + bridges.',
        );
      }
    } catch {
      setHeadline('Could not load Port FBO path.');
      setDetail('');
      setSteps([]);
      setClaimReady(false);
      setHasFbo(false);
      setPortName(null);
    } finally {
      setLoaded(true);
    }
  }, [
    props.companyId,
    props.homeHubIcao,
    props.walletUsd,
    props.isOwner,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loaded) {
    return (
      <section className="va-port-path">
        <h4 className="va-config-section-title">Path to Port FBO</h4>
        <p className="settings-help">Loading company port path…</p>
      </section>
    );
  }

  return (
    <section className="va-port-path">
      <div className="va-port-path-head">
        <h4 className="va-config-section-title">Path to Port FBO</h4>
        {props.onGoPorts ? (
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onGoPorts}
          >
            {claimReady && props.isOwner
              ? 'Claim on Ports'
              : hasFbo
                ? 'Open Ports desk'
                : 'Open Ports'}
          </button>
        ) : null}
      </div>
      <p className="va-port-path-blurb">{headline}</p>
      {detail ? <p className="settings-help">{detail}</p> : null}
      {steps.length > 0 && !hasFbo ? (
        <ul className="va-checklist">
          {steps.map((s) => (
            <li
              key={s.id}
              className={s.done ? 'is-done' : undefined}
            >
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      {hasFbo && portName ? (
        <p className="va-port-path-done muted">
          Unlocked · {portName}
        </p>
      ) : null}
    </section>
  );
}
