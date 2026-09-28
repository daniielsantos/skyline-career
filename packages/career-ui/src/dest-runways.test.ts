import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CareerRunway } from './api';
import {
  destRunwayEnds,
  formatDestRunwayFacts,
  runwaysLongestFirst,
} from './dest-runways';

function strip(
  partial: Pick<CareerRunway, 'ident' | 'lengthM' | 'widthM'> &
    Partial<CareerRunway>,
): CareerRunway {
  return {
    headingTrueDeg: 0,
    lat: 1,
    lon: 1,
    ...partial,
  };
}

describe('dest runway lines', () => {
  it('formats both ends, length, width, surface, and lights', () => {
    assert.equal(
      destRunwayEnds({ ident: '09', identReciprocal: '27' }),
      '09/27',
    );
    assert.equal(
      formatDestRunwayFacts(
        strip({
          ident: '09',
          identReciprocal: '27',
          lengthM: 1200,
          widthM: 30,
          surface: 'asphalt',
          lighted: false,
        }),
      ),
      '1.20 km · 30 m wide · asphalt · unlit',
    );
  });

  it('lists the longest strip first', () => {
    const rows = runwaysLongestFirst([
      strip({ ident: '09', lengthM: 1200, widthM: 30 }),
      strip({ ident: '18', lengthM: 2400, widthM: 45 }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.ident),
      ['18', '09'],
    );
  });
});
