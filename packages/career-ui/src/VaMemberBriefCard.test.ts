import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VA_MEMBER_BRIEF_STEPS } from './VaMemberBriefCard.tsx';

describe('VA_MEMBER_BRIEF_STEPS', () => {
  it('keeps one idea per slide without a wall of text', () => {
    assert.equal(VA_MEMBER_BRIEF_STEPS.length, 4);
    for (const step of VA_MEMBER_BRIEF_STEPS) {
      assert.ok(step.kicker.trim());
      assert.ok(step.title.trim());
      assert.ok(step.body.trim().length > 40);
      assert.ok(step.body.length < 320);
    }
    assert.deepEqual(
      VA_MEMBER_BRIEF_STEPS.map((s) => s.kicker),
      ['Wallets', 'Cuts', 'Progression', 'Jobs'],
    );
  });
});
