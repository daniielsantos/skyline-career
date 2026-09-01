import { HubEconomyNetworkHistory } from './HubEconomyNetworkHistory';
import type { WeightSystem } from './weight-units';

/** Dev-only network economy pulse (hub_economy_samples → daily series). */
export function HubEconomyPulsePage(props: {
  weightSystem: WeightSystem;
  /** Re-fetch when the economy clock advances. */
  refreshToken?: string | number;
}) {
  return (
    <section className="panel hub-economy-pulse-panel">
      <div className="panel-head">
        <div>
          <h2>Economy pulse</h2>
          <p>
            Dev-only network history from saved daily hub samples. Lenses: World /
            BR / US / Spoke — with dead-spoke counts, size mix, soft-fill, pay
            band. Not shown on Terminal Stats.
          </p>
        </div>
      </div>
      <HubEconomyNetworkHistory
        weightSystem={props.weightSystem}
        refreshToken={props.refreshToken}
        layout="page"
      />
    </section>
  );
}
