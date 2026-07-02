import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshRecap } from '../src/lib/summarize/recap.mjs';

test('shouldRefreshRecap: first time (no recap yet) → true', () => {
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 0, everyTurns: 5, hasRecap: false }), true);
});
test('shouldRefreshRecap: below cadence with recap → false', () => {
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 4, everyTurns: 5, hasRecap: true }), false);
});
test('shouldRefreshRecap: at/over cadence → true', () => {
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 5, everyTurns: 5, hasRecap: true }), true);
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 9, everyTurns: 5, hasRecap: true }), true);
});

import { EventEmitter } from 'node:events';
import { makeRecapper, formatPrefix } from '../src/lib/summarize/recap.mjs';

function fakeSpawn(out) {
  return () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stdin = { write() {}, end() {} };
    c.kill = () => {};
    setImmediate(() => { if (out) c.stdout.emit('data', Buffer.from(out)); c.emit('close'); });
    return c;
  };
}
function failSpawn() { return () => { throw new Error('ENOENT'); }; }

const titleLine = (t) => JSON.stringify({ type: 'ai-title', aiTitle: t });
const claudeCfg = (extra = {}) => ({ summarize: { mode: 'claude', recap: { enabled: true, everyTurns: 5, maxLen: 60 }, claude: {} }, ...extra });

test('formatPrefix joins via default template', () => {
  assert.equal(formatPrefix('Search app', 'done', {}), 'Search app: done');
  assert.equal(formatPrefix('A', 'b', { recapTemplate: '${recap} — ${body}' }), 'A — b');
});

test('resolvePrefix: claude mode, first turn → generates recap, persists, resets counter', async () => {
  let saved;
  const r = makeRecapper({
    spawn: fakeSpawn('Search app release'),
    readSession: () => ({}),
    writeSession: (_id, d) => { saved = d; },
    now: () => 0,
  });
  const out = await r.resolvePrefix({ sessionId: 's', jsonl: 'JSONLTEXT', cfg: claudeCfg() });
  assert.equal(out, 'Search app release');
  assert.equal(saved.prefix, 'Search app release');
  assert.equal(saved.recap, 'Search app release');
  assert.equal(saved.turnsSinceRecap, 0);
  assert.equal(saved.transcriptChars, 'JSONLTEXT'.length);
});

test('resolvePrefix: claude mode, not due → reuses cached recap, bumps counter, no spawn', async () => {
  let saved; let spawned = false;
  const r = makeRecapper({
    spawn: () => { spawned = true; return fakeSpawn('x')(); },
    readSession: () => ({ recap: 'Cached theme', turnsSinceRecap: 2, transcriptChars: 10 }),
    writeSession: (_id, d) => { saved = d; },
    now: () => 0,
  });
  const out = await r.resolvePrefix({ sessionId: 's', jsonl: 'abc', cfg: claudeCfg() });
  assert.equal(out, 'Cached theme');
  assert.equal(saved.turnsSinceRecap, 3);
  assert.equal(spawned, false);
});

test('resolvePrefix: claude mode, due → regenerates', async () => {
  let saved;
  const r = makeRecapper({
    spawn: fakeSpawn('Updated theme'),
    readSession: () => ({ recap: 'Old', turnsSinceRecap: 5, transcriptChars: 3 }),
    writeSession: (_id, d) => { saved = d; },
    now: () => 0,
  });
  const out = await r.resolvePrefix({ sessionId: 's', jsonl: 'abcdef', cfg: claudeCfg() });
  assert.equal(out, 'Updated theme');
  assert.equal(saved.recap, 'Updated theme');
  assert.equal(saved.turnsSinceRecap, 0);
});

test('resolvePrefix: claude refresh fails → keeps prior recap, resets counter', async () => {
  let saved;
  const r = makeRecapper({
    spawn: failSpawn(),
    readSession: () => ({ recap: 'Prior', turnsSinceRecap: 7 }),
    writeSession: (_id, d) => { saved = d; },
    now: () => 0,
  });
  const out = await r.resolvePrefix({ sessionId: 's', jsonl: 'x', cfg: claudeCfg() });
  assert.equal(out, 'Prior');
  assert.equal(saved.turnsSinceRecap, 0);
});

test('resolvePrefix: claude prints "Not logged in" → keeps prior recap, never caches the error text', async () => {
  let saved;
  const r = makeRecapper({
    spawn: fakeSpawn('Not logged in · Please run /login'),
    readSession: () => ({ recap: 'Prior', turnsSinceRecap: 7 }),
    writeSession: (_id, d) => { saved = d; },
    now: () => 0,
  });
  const out = await r.resolvePrefix({ sessionId: 's', jsonl: 'x', cfg: claudeCfg() });
  assert.equal(out, 'Prior');
  assert.equal(saved.recap, 'Prior');           // error text not cached
  assert.equal(saved.prefix, 'Prior');
  assert.equal(saved.turnsSinceRecap, 0);       // token guard: retry in N turns
});

test('resolvePrefix: claude refresh fails with no prior recap → falls back to ai-title', async () => {
  const r = makeRecapper({
    spawn: failSpawn(),
    readSession: () => ({}),
    writeSession: () => {},
    now: () => 0,
  });
  const out = await r.resolvePrefix({ sessionId: 's', jsonl: titleLine('My Title'), cfg: claudeCfg() });
  assert.equal(out, 'My Title');
});

test('resolvePrefix: non-claude mode → ai-title prefix, no spawn', async () => {
  let saved; let spawned = false;
  const r = makeRecapper({
    spawn: () => { spawned = true; return fakeSpawn('x')(); },
    readSession: () => ({}),
    writeSession: (_id, d) => { saved = d; },
    now: () => 0,
  });
  const out = await r.resolvePrefix({
    sessionId: 's', jsonl: titleLine('Heuristic Title'),
    cfg: { summarize: { mode: 'heuristic', recap: { enabled: true } } },
  });
  assert.equal(out, 'Heuristic Title');
  assert.equal(saved.prefix, 'Heuristic Title');
  assert.equal(spawned, false);
});

test('resolvePrefix: recap disabled → ai-title even in claude mode', async () => {
  const r = makeRecapper({ spawn: fakeSpawn('x'), readSession: () => ({}), writeSession: () => {}, now: () => 0 });
  const out = await r.resolvePrefix({
    sessionId: 's', jsonl: titleLine('T'),
    cfg: { summarize: { mode: 'claude', recap: { enabled: false }, claude: {} } },
  });
  assert.equal(out, 'T');
});
