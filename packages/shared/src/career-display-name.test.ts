import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatDisplayLabel,
  normalizeAccountDisplayName,
  normalizeCompanyDisplayName,
  titleCaseDisplayWord,
} from './career-display-name.js';
import { normalizePilotName, assertValidPilotName } from './career-fleet.js';

describe('display name Title Case', () => {
  it('title-cases words and hyphen/apostrophe segments', () => {
    assert.equal(titleCaseDisplayWord("o'brien"), "O'Brien");
    assert.equal(titleCaseDisplayWord('ibm-air'), 'Ibm-Air');
    assert.equal(formatDisplayLabel('  ada   skyline '), 'Ada Skyline');
    assert.equal(formatDisplayLabel('NoNaMe'), 'Noname');
    assert.equal(formatDisplayLabel('LAMUSINE'), 'Lamusine');
  });

  it('normalizes account display within length', () => {
    assert.equal(normalizeAccountDisplayName('noname'), 'Noname');
    assert.throws(() => normalizeAccountDisplayName('x'), /2–48/);
  });

  it('normalizes company display', () => {
    assert.equal(
      normalizeCompanyDisplayName('skyline air cargo'),
      'Skyline Air Cargo',
    );
    assert.throws(() => normalizeCompanyDisplayName('   '), /required/);
  });

  it('title-cases pilot names and keeps multi-word', () => {
    assert.equal(normalizePilotName('ada skyline'), 'Ada Skyline');
    assert.equal(assertValidPilotName('  NoNaMe  '), 'Noname');
  });
});
