import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPayloadDueLine } from './load-verification.js';

describe('formatPayloadDueLine', () => {
  const fmt = (lb: number | undefined) =>
    lb === undefined ? '—' : `${Math.round(lb)} lb`;

  it('shows cargo + crew when both are present', () => {
    assert.equal(
      formatPayloadDueLine(
        { plannedLb: 2840, cargoLb: 2500, crewLb: 340 },
        fmt,
      ),
      'Due 2840 lb · 2500 lb cargo + 340 lb crew',
    );
  });

  it('falls back to total-only when breakdown is missing', () => {
    assert.equal(
      formatPayloadDueLine({ plannedLb: 2840 }, fmt),
      'Due 2840 lb',
    );
  });
});
