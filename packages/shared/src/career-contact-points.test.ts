import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMainGearStationFt } from './career-contact-points.js';

const TRICYCLE = `
[WEIGHT_AND_BALANCE]
empty_weight_cg_position = -2.7, 0, 1.5

[CONTACT_POINTS]
static_pitch = 0.5
point.0 = 1, 4.2, 0, -2.4, 750, 0, 0.5, 35, 0.2, 2, 0.9, 0, 0, 0, 0, 0 ; nose
point.1 = 1, -6.0, -3.2, -2.5, 750, 1, 0.6, 0, 0.2, 2, 0.9, 0, 0, 0, 0, 0
point.2 = 1, -6.0, 3.2, -2.5, 750, 2, 0.6, 0, 0.2, 2, 0.9, 0, 0, 0, 0, 0
point.3 = 2, -18, 0, -0.4, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ; scrape
`;

describe('parseMainGearStationFt', () => {
  it('uses the non-steering wheels and ignores the nose and scrape points', () => {
    const station = parseMainGearStationFt(TRICYCLE);
    assert.ok(station);
    assert.ok(Math.abs(station!.longitudinalFt - -6) < 1e-6);
    assert.ok(Math.abs(station!.verticalFt - -2.5) < 1e-6);
  });

  it('accepts a leading point name', () => {
    const station = parseMainGearStationFt(`
[CONTACT_POINTS]
point.0 = Nose, 1, 5.0, 0, -2, 700, 0, 0.4, 28
point.1 = LeftMain, 1, -8.5, -4, -2.2, 700, 1, 0.5, 0
point.2 = RightMain, 1, -8.5, 4, -2.2, 700, 2, 0.5, 0
`);
    assert.ok(station);
    assert.ok(Math.abs(station!.longitudinalFt - -8.5) < 1e-6);
  });

  it('uses the aft axle of a bogey', () => {
    const station = parseMainGearStationFt(`
[CONTACT_POINTS]
point.0 = 1, 40, 0, -8, 1000, 0, 1.2, 70
point.1 = 1, -20, -8, -8, 1000, 1, 1.5, 0
point.2 = 1, -23, -8, -8, 1000, 1, 1.5, 0
point.3 = 1, -20, 8, -8, 1000, 2, 1.5, 0
point.4 = 1, -23, 8, -8, 1000, 2, 1.5, 0
`);
    assert.ok(station);
    assert.ok(Math.abs(station!.longitudinalFt - -23) < 1e-6);
  });

  it('returns undefined when the section has no gear', () => {
    assert.equal(
      parseMainGearStationFt('[CONTACT_POINTS]\npoint.0 = 2, -4, 0, -1, 100'),
      undefined,
    );
  });
});
