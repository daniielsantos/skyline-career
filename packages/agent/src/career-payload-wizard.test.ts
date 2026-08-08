import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSimBriefPayloadProposal } from './career-payload-wizard.js';

describe('buildSimBriefPayloadProposal', () => {
  it('takes the tighter of catalog vs SimBrief and clamps to MTOW−OEW', () => {
    const proposal = buildSimBriefPayloadProposal(
      {
        typeId: 'c208-caravan-cargo',
        aircraftClassId: 'light_turboprop',
        label: 'Cessna 208 Caravan Cargo',
        rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
        simbriefIcao: 'C208',
        simbriefAirframeMatch: 'Default',
        oewKg: 1922,
        mtowKg: 3969,
        maxCargoKg: 2948,
        fuelCapacityKg: 1020,
      },
      {
        simbriefMaxCargoKg: 1542,
        simbriefSource: 'maxcargo',
        airframeLabel: 'C208 Default',
        oewKg: 1922,
        mtowKg: 3969,
        mzfwKg: 3550,
        fuelCapacityKg: 1020,
      },
    );
    // min(2948, 1542)=1542, also ≤ mzfw−oew (1628) and mtow−oew (2047)
    assert.equal(proposal.proposedMaxCargoKg, 1542);
  });

  it('clamps station-sum cargo that exceeds MTOW−OEW when SimBrief is higher', () => {
    const proposal = buildSimBriefPayloadProposal(
      {
        typeId: 'c208-caravan-cargo',
        aircraftClassId: 'light_turboprop',
        label: 'Cessna 208 Caravan Cargo',
        rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
        simbriefIcao: 'C208',
        simbriefAirframeMatch: 'Default',
        oewKg: 1922,
        mtowKg: 3969,
        maxCargoKg: 2948,
      },
      {
        simbriefMaxCargoKg: 5000,
        simbriefSource: 'maxcargo',
        airframeLabel: 'C208 Default',
        oewKg: 1922,
        mtowKg: 3969,
      },
    );
    assert.equal(proposal.proposedMaxCargoKg, 2047);
  });
});
