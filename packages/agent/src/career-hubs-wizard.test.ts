import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCareerHubsPositionals } from './career-hubs-wizard.js';

describe('parseCareerHubsPositionals', () => {
  it('keeps a lone scope keyword', () => {
    assert.deepEqual(parseCareerHubsPositionals(['gaps']), { scope: 'gaps' });
    assert.deepEqual(parseCareerHubsPositionals(['MISSING']), {
      scope: 'missing',
    });
  });

  it('keeps one ICAO', () => {
    assert.deepEqual(parseCareerHubsPositionals(['kdjt']), {
      scope: 'KDJT',
      icaos: ['KDJT'],
    });
  });

  it('keeps every ICAO on the line', () => {
    assert.deepEqual(
      parseCareerHubsPositionals([
        'KDJT',
        'UZTT',
        'UZSS',
        'UZSB',
        'UZNN',
        'UZFN',
      ]),
      {
        scope: 'icaos',
        icaos: ['KDJT', 'UZTT', 'UZSS', 'UZSB', 'UZNN', 'UZFN'],
      },
    );
  });

  it('drops a repeated ICAO', () => {
    assert.deepEqual(parseCareerHubsPositionals(['KDJT', 'kdjt']), {
      scope: 'KDJT',
      icaos: ['KDJT'],
    });
  });
});
