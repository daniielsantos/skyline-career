import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SIMBRIEF_DISPATCH_BASE,
  buildDispatchRedirectUrl,
  cargoWeightToThousands,
  formatCargoThousands,
  makeStaticId,
} from './simbrief-dispatch.js';

describe('makeStaticId', () => {
  it('returns skyline_ prefix and safe chars', () => {
    const id = makeStaticId();
    assert.match(id, /^skyline_[a-z0-9_]+$/i);
    assert.ok(id.length <= 64);
  });
});

describe('formatCargoThousands / cargoWeightToThousands', () => {
  it('converts kg weight to SimBrief thousands', () => {
    assert.equal(cargoWeightToThousands(4066), 4.066);
    assert.equal(formatCargoThousands(5), '5');
    assert.equal(formatCargoThousands(4.066), '4.066');
  });
});

describe('buildDispatchRedirectUrl', () => {
  it('requires type/orig/dest and defaults units to KGS', () => {
    const url = buildDispatchRedirectUrl({
      type: 'B738',
      orig: 'sbgr',
      dest: 'sbgl',
    });
    assert.ok(url.startsWith(`${SIMBRIEF_DISPATCH_BASE}?`));
    const qs = new URL(url).searchParams;
    assert.equal(qs.get('type'), 'B738');
    assert.equal(qs.get('orig'), 'SBGR');
    assert.equal(qs.get('dest'), 'SBGL');
    assert.equal(qs.get('units'), 'KGS');
    assert.equal(qs.get('pax'), null);
  });

  it('sends pax=0 and cargo explicitly for freighter', () => {
    const url = buildDispatchRedirectUrl({
      type: 'MD11',
      orig: 'KMIA',
      dest: 'SBGR',
      pax: 0,
      cargo: 45.5,
      units: 'KGS',
      staticId: 'skyline_test_1',
    });
    const qs = new URL(url).searchParams;
    assert.equal(qs.get('pax'), '0');
    assert.equal(qs.get('cargo'), '45.5');
    assert.equal(qs.get('static_id'), 'skyline_test_1');
  });

  it('includes optional airline/fltnum/route and encodes acdata JSON', () => {
    const url = buildDispatchRedirectUrl({
      type: 'B738',
      orig: 'KORD',
      dest: 'KSFO',
      pax: 156,
      manualPayload: 17.336,
      airline: 'UAL',
      fltnum: '1234',
      route: 'PLL GAROT OAL',
      altn: 'KLAX',
      units: 'LBS',
      acdata: { paxwgt: 190, bagwgt: 30 },
    });
    const qs = new URL(url).searchParams;
    assert.equal(qs.get('pax'), '156');
    assert.equal(qs.get('manualpayload'), '17.336');
    assert.equal(qs.get('airline'), 'UAL');
    assert.equal(qs.get('fltnum'), '1234');
    assert.equal(qs.get('route'), 'PLL GAROT OAL');
    assert.equal(qs.get('altn'), 'KLAX');
    assert.equal(qs.get('units'), 'LBS');
    assert.equal(qs.get('acdata'), JSON.stringify({ paxwgt: 190, bagwgt: 30 }));
  });
});
