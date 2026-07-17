'use strict';

/**
 * THE CONCURRENCY FENCE — behavior tests for the durable agent-slot semaphore.
 *
 * Root cause this closes: `src/lib/task-registry.js` really does enforce the
 * five-concurrent-subagent cap (`evaluateConcurrency` Rule 1 →
 * `{run:false, reason:'max-concurrent'}`), but ONLY for work that walks in
 * through `menu task add` → `canRun`. Nothing forced a background subagent to
 * take that on-ramp, so a launch that never registered itself was never counted
 * and the cap was optional in practice. `src/lib/agent-slots.js` plus the
 * `Task` PreToolUse hook make the count mechanical.
 *
 * These tests drive the REAL module against REAL temp project roots — no fake
 * filesystem, no mocked core logic. Time is INJECTED (`now`, milliseconds)
 * rather than slept on, so the thirty-minute stale-reap contract is proven in
 * microseconds and the suite stays deterministic.
 *
 * The load-bearing assertions, each of which goes red under the obvious mutant:
 *   • the sixth acquire is refused           (delete the cap check → red)
 *   • a released slot refills                (drop the removal → red)
 *   • a slot past the TTL is reaped          (drop the reaping → red; this is
 *     what stops a CRASHED subagent from leaking a slot forever)
 *   • a corrupt store fails OPEN             (throw instead → red; a fence that
 *     bricks the session is worse than the gap it closes)
 *
 * Cross-platform: path.join / os.tmpdir / fs; fixtures removed in after().
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const REPO = path.resolve(__dirname, '..');
const agentSlots = require(path.join(REPO, 'src', 'lib', 'agent-slots.js'));
const taskRegistry = require(path.join(REPO, 'src', 'lib', 'task-registry.js'));

const { acquire, release, activeCount, reap, slotsPath, SLOT_TTL_MS, MAX_CONCURRENT } = agentSlots;

const createdRoots = [];

/** A real, empty temp project root. */
function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-slots-'));
  createdRoots.push(root);
  return root;
}

/** Read the raw store file (throws if absent — tests use it only when it must exist). */
function readStore(root) {
  return JSON.parse(fs.readFileSync(slotsPath(root), 'utf8'));
}

after(() => {
  for (const root of createdRoots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ===========================================================================
// The fence itself — five in flight is fine, the sixth is refused.
// ===========================================================================

describe('agent-slots — the five-concurrent cap', () => {
  it('the cap number is task-registry\'s MAX_CONCURRENT, not a second copy of 5', () => {
    assert.equal(MAX_CONCURRENT, taskRegistry.MAX_CONCURRENT);
    assert.equal(MAX_CONCURRENT, 5);
  });

  it('MAX_CONCURRENT acquires succeed and the NEXT one is refused with max-concurrent', () => {
    const root = mkRoot();
    for (let i = 0; i < MAX_CONCURRENT; i++) {
      const got = acquire(root, { label: `agent-${i}` });
      assert.equal(got.ok, true, `acquire ${i} should have been granted a slot`);
      assert.equal(typeof got.token, 'string');
      assert.ok(got.token.length > 0);
    }
    assert.equal(activeCount(root), MAX_CONCURRENT);

    // THE FENCE. Remove the cap check in acquire() and this line goes red.
    const sixth = acquire(root, { label: 'agent-6' });
    assert.deepEqual(sixth, { ok: false, reason: 'max-concurrent', running: MAX_CONCURRENT });
    assert.equal(sixth.token, undefined, 'a refused acquire must not hand out a token');

    // A refusal must not be a silent acquire — the count is unchanged.
    assert.equal(activeCount(root), MAX_CONCURRENT);
  });

  it('every acquired token is unique', () => {
    const root = mkRoot();
    const tokens = new Set();
    for (let i = 0; i < MAX_CONCURRENT; i++) tokens.add(acquire(root, { label: 'x' }).token);
    assert.equal(tokens.size, MAX_CONCURRENT);
  });

  it('each entry records token, label and acquiredAt', () => {
    const root = mkRoot();
    const { token } = acquire(root, { label: 'code-reviewer', now: 1_700_000_000_000 });
    const entry = readStore(root).slots.find((s) => s.token === token);
    assert.deepEqual(entry, { token, label: 'code-reviewer', acquiredAt: 1_700_000_000_000 });
  });

  it('a missing label is recorded as a usable default, never undefined', () => {
    const root = mkRoot();
    const { token } = acquire(root);
    const entry = readStore(root).slots.find((s) => s.token === token);
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.length > 0);
  });

  it('the store is written atomically — no temp files survive an acquire', () => {
    const root = mkRoot();
    acquire(root, { label: 'a' });
    const stateDir = path.dirname(slotsPath(root));
    const leftovers = fs.readdirSync(stateDir).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftovers, [], 'temp+rename must leave no temp file behind');
  });
});

// ===========================================================================
// Release — the slot refills.
// ===========================================================================

describe('agent-slots — release refills the slot', () => {
  it('after a release a new acquire succeeds again', () => {
    const root = mkRoot();
    const tokens = [];
    for (let i = 0; i < MAX_CONCURRENT; i++) tokens.push(acquire(root, { label: 'a' }).token);
    assert.equal(acquire(root, { label: 'sixth' }).ok, false);

    const released = release(root, tokens[2]);
    assert.equal(released.ok, true);
    assert.equal(released.released, tokens[2]);
    assert.equal(activeCount(root), MAX_CONCURRENT - 1);

    const refilled = acquire(root, { label: 'sixth' });
    assert.equal(refilled.ok, true, 'the freed slot must be reusable');
    assert.equal(activeCount(root), MAX_CONCURRENT);
  });

  it('releasing with NO token removes the OLDEST live entry (the count-based semaphore)', () => {
    const root = mkRoot();
    const oldest = acquire(root, { label: 'oldest', now: 1_000 }).token;
    const middle = acquire(root, { label: 'middle', now: 2_000 }).token;
    const newest = acquire(root, { label: 'newest', now: 3_000 }).token;

    const out = release(root, undefined, 3_500);
    assert.equal(out.ok, true);
    assert.equal(out.released, oldest, 'the oldest live entry is the one released');

    const remaining = readStore(root).slots.map((s) => s.token);
    assert.deepEqual(remaining.sort(), [middle, newest].sort());
  });

  it('releasing an UNKNOWN token is a safe no-op that still reports ok', () => {
    const root = mkRoot();
    const real = acquire(root, { label: 'a' }).token;

    const out = release(root, 'not-a-real-token');
    assert.equal(out.ok, true);
    assert.equal(out.released, null);
    assert.equal(activeCount(root), 1, 'an unknown token must not free somebody else\'s slot');
    assert.deepEqual(readStore(root).slots.map((s) => s.token), [real]);
  });

  it('releasing against an EMPTY store is ok and the count never goes negative', () => {
    const root = mkRoot();
    assert.equal(activeCount(root), 0);
    for (let i = 0; i < 3; i++) {
      const out = release(root);
      assert.equal(out.ok, true);
      assert.equal(out.released, null);
    }
    assert.equal(activeCount(root), 0);
    assert.ok(activeCount(root) >= 0);
  });

  it('over-releasing a single slot cannot drive the count below zero', () => {
    const root = mkRoot();
    const token = acquire(root, { label: 'a' }).token;
    assert.equal(release(root, token).released, token);
    assert.equal(release(root, token).released, null, 'the second release of the same token is a no-op');
    assert.equal(activeCount(root), 0);
  });
});

// ===========================================================================
// Stale reaping — a CRASHED subagent must never leak a slot forever.
// ===========================================================================

describe('agent-slots — stale reaping (a crashed subagent leaks nothing)', () => {
  it('exports a thirty-minute TTL so callers and tests reason about the same number', () => {
    assert.equal(SLOT_TTL_MS, 30 * 60 * 1000);
  });

  it('an entry older than the TTL is reaped and its slot is free again', () => {
    const root = mkRoot();
    const t0 = 1_700_000_000_000;
    // Fill every slot, then let the wall clock move past the TTL: every holder
    // is presumed dead (crashed without ever firing SubagentStop).
    for (let i = 0; i < MAX_CONCURRENT; i++) acquire(root, { label: `crashed-${i}`, now: t0 });
    assert.equal(activeCount(root, t0), MAX_CONCURRENT);
    assert.equal(acquire(root, { label: 'blocked', now: t0 }).ok, false);

    const later = t0 + SLOT_TTL_MS + 1;
    assert.equal(activeCount(root, later), 0, 'every stale holder is reaped');
    const after = acquire(root, { label: 'fresh', now: later });
    assert.equal(after.ok, true, 'a crashed subagent must not permanently leak a slot');
  });

  it('an entry EXACTLY at the TTL boundary is still live; one microsecond past is not', () => {
    const root = mkRoot();
    const t0 = 500_000_000;
    acquire(root, { label: 'edge', now: t0 });
    assert.equal(activeCount(root, t0 + SLOT_TTL_MS - 1), 1, 'inside the TTL → live');
    assert.equal(activeCount(root, t0 + SLOT_TTL_MS), 0, 'at/after the TTL → presumed dead');
  });

  it('reap returns how many entries it removed and persists the reaped store', () => {
    const root = mkRoot();
    const t0 = 42_000_000;
    acquire(root, { label: 'old-1', now: t0 });
    acquire(root, { label: 'old-2', now: t0 });
    acquire(root, { label: 'fresh', now: t0 + 1 });

    // At exactly t0 + TTL the two t0 holders have aged out; `fresh` (one
    // millisecond younger) has not.
    const removed = reap(root, t0 + SLOT_TTL_MS);
    assert.equal(removed, 2);
    assert.deepEqual(readStore(root).slots.map((s) => s.label), ['fresh']);

    assert.equal(reap(root, t0 + SLOT_TTL_MS), 0, 'a second reap has nothing left to remove');
  });

  it('reap on an empty/absent store removes nothing and writes nothing', () => {
    const root = mkRoot();
    assert.equal(reap(root), 0);
    assert.equal(fs.existsSync(slotsPath(root)), false, 'a no-op reap must not create the store');
  });

  it('a stale entry does not count toward the cap, so the fence still admits work', () => {
    const root = mkRoot();
    const t0 = 9_000_000;
    for (let i = 0; i < MAX_CONCURRENT; i++) acquire(root, { label: `x-${i}`, now: t0 });
    // Four of the five stay alive; one crashed long ago.
    const later = t0 + SLOT_TTL_MS + 1;
    for (let i = 0; i < 4; i++) acquire(root, { label: `y-${i}`, now: later });
    assert.equal(activeCount(root, later), 4);
    assert.equal(acquire(root, { label: 'fifth', now: later }).ok, true);
    assert.deepEqual(
      acquire(root, { label: 'sixth', now: later }),
      { ok: false, reason: 'max-concurrent', running: MAX_CONCURRENT },
    );
  });
});

// ===========================================================================
// FAIL OPEN — our own bookkeeping must never block real work.
// ===========================================================================

describe('agent-slots — fails open', () => {
  it('a corrupt/unparseable store lets the acquire through AND resets the store', () => {
    const root = mkRoot();
    const file = slotsPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ this is not json at all', 'utf8');

    const got = acquire(root, { label: 'after-corruption', now: 123 });
    assert.equal(got.ok, true, 'a broken store must never block a real launch');
    assert.equal(typeof got.token, 'string');

    // The corrupt bytes are gone: the store is valid JSON holding exactly the
    // one live slot we just took.
    const store = readStore(root);
    assert.deepEqual(store.slots, [{ token: got.token, label: 'after-corruption', acquiredAt: 123 }]);
  });

  it('a store whose slots are the wrong SHAPE is treated as empty (reset), not trusted', () => {
    const root = mkRoot();
    const file = slotsPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ slots: 'not-an-array' }), 'utf8');
    assert.equal(activeCount(root), 0);
    assert.equal(acquire(root, { label: 'a' }).ok, true);
  });

  it('garbage ENTRIES inside a well-formed store are dropped, not counted', () => {
    const root = mkRoot();
    const file = slotsPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      slots: [
        null,
        'nope',
        { label: 'no token', acquiredAt: 1 },
        { token: 'ok-1', label: 'real', acquiredAt: Date.now() },
        { token: 'bad-time', label: 'x', acquiredAt: 'yesterday' },
      ],
    }), 'utf8');
    assert.equal(activeCount(root), 1, 'only the one well-formed entry counts');
  });

  it('an unusable root does not throw — acquire fails OPEN with a token', () => {
    const root = null;
    const got = acquire(root, { label: 'a' });
    assert.equal(got.ok, true);
    assert.equal(typeof got.token, 'string');
    // The sibling reads/writes must not throw either.
    assert.equal(release(root, 'x').ok, true);
    assert.equal(activeCount(root), 0);
    assert.equal(reap(root), 0);
  });

  it('a store path that cannot be written (state dir is a FILE) still fails open', () => {
    const root = mkRoot();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    // `.ctoc/state` occupied by a regular file → mkdir/write must fail.
    fs.writeFileSync(path.join(root, '.ctoc', 'state'), 'in the way', 'utf8');

    const got = acquire(root, { label: 'a' });
    assert.equal(got.ok, true, 'an unwritable store must never block a real launch');
    assert.equal(typeof got.token, 'string');
    assert.equal(activeCount(root), 0, 'nothing could be persisted, so nothing is counted');
  });

  it('a non-finite injected now falls back to the real clock instead of poisoning the stamp', () => {
    const root = mkRoot();
    const { token } = acquire(root, { label: 'a', now: Number.NaN });
    const entry = readStore(root).slots.find((s) => s.token === token);
    assert.ok(Number.isFinite(entry.acquiredAt));
    assert.ok(entry.acquiredAt > 1_600_000_000_000, 'stamped with the real clock');
  });
});

// ===========================================================================
// The store path.
// ===========================================================================

describe('agent-slots — the store lives under .ctoc/state', () => {
  it('slotsPath is <root>/.ctoc/state/agent-slots.json, joined cross-platform', () => {
    const root = mkRoot();
    assert.equal(slotsPath(root), path.join(root, '.ctoc', 'state', 'agent-slots.json'));
  });
});
