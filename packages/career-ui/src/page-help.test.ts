import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAGE_HELP, resolvePageHelp } from './page-help.ts';

describe('page help copy', () => {
  it('keeps every page guide short', () => {
    for (const help of Object.values(PAGE_HELP)) {
      assert.ok(help.bullets.length >= 1 && help.bullets.length <= 5, help.id);
      assert.ok(help.bullets.every((b) => b.length < 240), help.id);
    }
  });

  it('routes Dispatch, Ports, and airport terminals', () => {
    assert.equal(resolvePageHelp({ showAirport: false, showStaging: true, tab: 'market' }).id, 'dispatch');
    assert.equal(resolvePageHelp({ showAirport: false, showStaging: false, tab: 'ports' }).id, 'ports');
    assert.equal(resolvePageHelp({ showAirport: true, showStaging: false, tab: 'market' }).id, 'airport');
    assert.match(PAGE_HELP.ports.bullets.join(' '), /warehouse/i);
    assert.match(PAGE_HELP.ports.bullets.join(' '), /Demand/i);
  });
});
