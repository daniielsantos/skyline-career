import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOpsFleet, type OpsFleetEntry } from './ops-fleet.js';

type MiniAcf = {
  id: string;
  label: string;
  status: 'parked';
  locationIcao: string;
};

function acf(id: string, label: string): MiniAcf {
  return { id, label, status: 'parked', locationIcao: 'SBGR' };
}

describe('buildOpsFleet', () => {
  it('marks shared ids as VA when they appear in the VA session fleet', () => {
    const duke = acf('acf_duke', 'Duke');
    const aero = acf('acf_aero', 'Aerostar');
    const entries = buildOpsFleet(
      [duke, aero] as never,
      [duke] as never,
    ) as OpsFleetEntry[];
    assert.equal(entries.length, 2);
    assert.equal(entries.find((e) => e.aircraft.id === 'acf_duke')?.owner, 'va');
    assert.equal(entries.find((e) => e.aircraft.id === 'acf_aero')?.owner, 'home');
  });
});
