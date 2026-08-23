export type CargoLotCardLine = {
  shipmentLotId?: string;
  commodityId: string;
  cargoKg: number;
  payUsd: number;
  urgency?: string;
};

export function formatCargoCommodityLabel(commodityId: string): string {
  const raw = commodityId.replace(/_/g, ' ').trim();
  if (!raw) return commodityId;
  return raw.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function CargoLotCards(props: {
  lots: CargoLotCardLine[];
  formatTonnes: (kg: number) => string;
  formatMoney: (usd: number) => string;
  className?: string;
}) {
  return (
    <ul
      className={['cargo-lot-cards', props.className].filter(Boolean).join(' ')}
    >
      {props.lots.map((line, index) => {
        const urgent = line.urgency === 'urgent';
        return (
          <li
            key={`${line.shipmentLotId ?? 'lot'}-${line.commodityId}-${index}`}
            className={
              urgent ? 'cargo-lot-card is-urgent' : 'cargo-lot-card'
            }
          >
            <div className="cargo-lot-card-top">
              <strong>{formatCargoCommodityLabel(line.commodityId)}</strong>
              {urgent ? <span className="tag">Urgent</span> : null}
            </div>
            <dl className="cargo-lot-card-meta">
              <div>
                <dt>Weight</dt>
                <dd>{props.formatTonnes(line.cargoKg)}</dd>
              </div>
              <div>
                <dt>Pay</dt>
                <dd>{props.formatMoney(line.payUsd)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
