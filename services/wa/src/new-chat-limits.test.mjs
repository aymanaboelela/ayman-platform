import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NewChatLimits } from './new-chat-limits.mjs';

const NOW = new Date('2026-10-27T10:00:00Z');
const at = (iso) => () => new Date(iso);

describe('NewChatLimits', () => {
  it('knows nothing → blocks nothing', () => {
    const limits = new NewChatLimits(() => NOW);
    assert.equal(limits.blocksNewChats(), null);
    assert.equal(limits.snapshot().restricted, false);
  });

  it('an active timelock blocks until it ends', () => {
    const limits = new NewChatLimits(at('2026-10-27T10:00:00Z'));
    limits.observeTimelock({ isActive: true, timeEnforcementEnds: new Date('2026-10-27T12:00:00Z'), enforcementType: 'DEFAULT' });
    assert.deepEqual(limits.blocksNewChats(), { reason: 'timelock', until: new Date('2026-10-27T12:00:00Z') });
    assert.equal(limits.snapshot().until, '2026-10-27T12:00:00.000Z');
  });

  it('a timelock whose end has passed no longer blocks', () => {
    const limits = new NewChatLimits(at('2026-10-27T13:00:00Z'));
    limits.observeTimelock({ isActive: true, timeEnforcementEnds: new Date('2026-10-27T12:00:00Z') });
    assert.equal(limits.blocksNewChats(), null);
  });

  it('an active timelock with no end is still a lock', () => {
    const limits = new NewChatLimits(() => NOW);
    limits.observeTimelock({ isActive: true });
    assert.deepEqual(limits.blocksNewChats(), { reason: 'timelock', until: null });
  });

  it('lifting it (pushed by WhatsApp) unblocks', () => {
    const limits = new NewChatLimits(() => NOW);
    limits.observeTimelock({ isActive: true });
    limits.observeTimelock({ isActive: false });
    assert.equal(limits.blocksNewChats(), null);
  });

  it('the cap blocks only on CAPPED', () => {
    const limits = new NewChatLimits(() => NOW);
    limits.observeCap({ total_quota: 50, used_quota: 40, capping_status: 'SECOND_WARNING' });
    assert.equal(limits.blocksNewChats(), null);
    limits.observeCap({ total_quota: 50, used_quota: 50, capping_status: 'CAPPED', cycle_end_timestamp: String(Date.parse('2026-10-28T00:00:00Z') / 1000) });
    assert.deepEqual(limits.blocksNewChats(), { reason: 'capped', until: new Date('2026-10-28T00:00:00Z') });
  });

  it('0 of 0 is NOT capped — the fields are zero on accounts the cap does not apply to', () => {
    const limits = new NewChatLimits(() => NOW);
    limits.observeCap({ total_quota: 0, used_quota: 0, capping_status: 'NONE' });
    assert.equal(limits.blocksNewChats(), null);
    assert.equal(limits.snapshot().quotaTotal, 0);
  });

  it('ignores garbage and reset forgets everything', () => {
    const limits = new NewChatLimits(() => NOW);
    limits.observeTimelock(null);
    limits.observeCap('nope');
    assert.equal(limits.snapshot().checkedAt, null);
    limits.observeTimelock({ isActive: true });
    limits.reset();
    assert.equal(limits.blocksNewChats(), null);
    assert.equal(limits.snapshot().checkedAt, null);
  });
});
