import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertDispatchHubsAreSimBriefKnown,
  listDispatchCareerHubIcaos,
  listSimBriefDispatchAllowlist,
  SIMBRIEF_DISPATCH_DENY_ICAOS,
} from './career-simbrief-airports.js';

describe('SimBrief dispatch allowlist', () => {
  it('covers every cargo hub and excludes deny-listed ICAOs', () => {
    assertDispatchHubsAreSimBriefKnown();
    const allow = new Set(listSimBriefDispatchAllowlist());
    const dispatch = listDispatchCareerHubIcaos();
    assert.ok(dispatch.length >= 300);
    assert.equal(allow.size, dispatch.length);
    for (const icao of SIMBRIEF_DISPATCH_DENY_ICAOS) {
      assert.equal(allow.has(icao), false);
      assert.equal(dispatch.includes(icao), false);
    }
    assert.ok(allow.has('SCIE'));
    assert.ok(allow.has('SCSE'));
    assert.equal(allow.has('SCCD'), false);
  });
});
