import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { airframeCardArtUrl } from './AircraftCards';

describe('airframe card art', () => {
  it('maps ATR family SKUs and leftover Highline glass ids', () => {
    assert.equal(
      airframeCardArtUrl('microsoft-atr-72-600'),
      '/airframes/atr-72-600.png',
    );
    assert.equal(
      airframeCardArtUrl('microsoft-atr-72-600-highline-03'),
      '/airframes/atr-72-600.png',
    );
    assert.equal(
      airframeCardArtUrl('microsoft-atr-42-600-stol'),
      '/airframes/atr-42-600.png',
    );
  });
});
