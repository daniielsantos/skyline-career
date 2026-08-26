import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canRestoreStagingDraft,
  type PersistedStagingDraft,
} from './staging-draft-persist.js';

const baseDraft = (): PersistedStagingDraft => ({
  originIcao: 'MMMX',
  destIcao: 'MMUN',
  originName: 'Mexico City',
  destName: 'Cancun',
  aircraft: 'light_turboprop',
  aircraftId: 'acf-1',
  lines: [
    {
      lot: {
        id: 'lot-1',
        originIcao: 'MMMX',
        destIcao: 'MMUN',
        originName: 'Mexico City',
        destName: 'Cancun',
        commodityId: 'dry',
        commodityName: 'Dry',
        availableKg: 1000,
        payUsd: 5000,
        urgency: 'normal',
        reason: 'test',
        expiresAtTick: 99,
      },
      cargoKg: 500,
    },
  ],
});

describe('canRestoreStagingDraft', () => {
  it('restores an unsaved pre-commit manifest when no active flight exists', () => {
    assert.equal(canRestoreStagingDraft(baseDraft(), []), true);
  });

  it('blocks pre-commit restore when another flight is already open', () => {
    assert.equal(
      canRestoreStagingDraft(baseDraft(), [], 'mission-open'),
      false,
    );
  });

  it('restores manifest edits tied to the open flight', () => {
    const draft = {
      ...baseDraft(),
      intoMissionId: 'm1',
      replaceManifest: true,
    };
    assert.equal(
      canRestoreStagingDraft(
        draft,
        [{ id: 'm1', status: 'dispatched' }],
        'm1',
      ),
      true,
    );
  });

  it('drops manifest edits when the bound mission is gone', () => {
    const draft = {
      ...baseDraft(),
      intoMissionId: 'm1',
      replaceManifest: true,
    };
    assert.equal(canRestoreStagingDraft(draft, [], 'm1'), false);
  });
});
