/** Compact VA money map — who pays / who receives. */

export function VaMoneyMap(props: {
  marketHireCutPct: number;
  airlineLaborCutPct: number;
}) {
  const market = Math.max(
    0,
    Math.min(100, Math.round(props.marketHireCutPct)),
  );
  const airline = Math.max(
    0,
    Math.min(100, Math.round(props.airlineLaborCutPct)),
  );
  const rows: { job: string; pays: string; earns: string }[] = [
    {
      job: 'Freights / Charter (VA tail)',
      pays: 'VA · Jet-A',
      earns: `${market}% route net → your home · rest VA`,
    },
    {
      job: 'Demand / Wide haul (desk stock)',
      pays: 'VA · Jet-A',
      earns: `${airline}% route net → your home · rest VA`,
    },
    {
      job: 'Internal Haul (WH→WH)',
      pays: 'VA · Jet-A',
      earns: 'Haul fee → your home',
    },
    {
      job: 'Empty ferry (Line crew)',
      pays: 'Allowance · VA · overflow your home',
      earns: '—',
    },
    {
      job: 'Inspect / repair / overhaul',
      pays: 'VA wallet (owner only)',
      earns: '—',
    },
    {
      job: 'Solo empire (your port / WH)',
      pays: 'Your home wallet',
      earns: '100% → your home',
    },
  ];
  return (
    <div className="va-money-map">
      <p className="aircraft-card-section-label" style={{ margin: 0 }}>
        Money map
      </p>
      <p className="va-money-map-blurb">
        Topbar Wallet is always your <strong>home</strong> company. This Ledger
        is the shared <strong>VA</strong> wallet. Solo keeps 100% after CAPEX;
        airline desk pays better than market hire on a VA tail — never above
        solo.
      </p>
      <table className="va-money-map-table">
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">Pays</th>
            <th scope="col">Pilot earns</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.job}>
              <td>{row.job}</td>
              <td>{row.pays}</td>
              <td>{row.earns}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
