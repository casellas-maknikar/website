const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const javascript = readFileSync(join(__dirname, '../src/context-menu.js'), 'utf8');
const source = javascript.split('// BEGIN PAGE CLIPBOARD')[1].split('// END PAGE CLIPBOARD')[0];
const create = vm.runInNewContext(source + ';createPageClipboard');

function deferred() {
  let resolve, reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const events = { writes: [], reads: 0, notices: [], busy: [] };
  const clipboard = {
    writeText: async text => { events.writes.push(text); },
    readText: () => { events.reads++; throw new Error('Clipboard reads are not allowed'); },
    ...overrides,
  };
  const engine = create({
    clipboard,
    notify: message => events.notices.push(message),
    busyChanged: value => events.busy.push(value),
  });
  return { engine, events };
}

test('creating the clipboard engine does not access the clipboard', () => {
  const { engine, events } = fixture();
  assert.equal(engine.pending, false);
  assert.deepEqual(events, { writes: [], reads: 0, notices: [], busy: [] });
});

for (const [label, text] of [
  ['Email address', 'contact@casellas-maknikar.com'],
  ['Mailing address', 'Casellas-Maknikar\n971 US Highway 202 N, Suite N\nBranchburg, Somerset County, NJ 08876, US'],
  ['Page URL', 'https://example.test/contact?ref=menu#address'],
  ['Selection', '<b>Selected text</b> & emoji 👩‍💻'],
]) test(`${label} copy preserves the exact plain text and reports success`, async () => {
  const { engine, events } = fixture();
  await engine.copy(text, label);
  assert.deepEqual(events.writes, [text]);
  assert.deepEqual(events.notices, [`${label} copied.`]);
  assert.deepEqual(events.busy, [true, false]);
  assert.equal(events.reads, 0);
  assert.equal(engine.pending, false);
});

test('copy waits for completion before reporting success and suppresses duplicate operations', async () => {
  const waiting = deferred();
  const { engine, events } = fixture({ writeText: text => { events.writes.push(text); return waiting.promise; } });
  const first = engine.copy('contact@casellas-maknikar.com', 'Email address');
  assert.equal(engine.pending, true);
  assert.deepEqual(events.notices, []);
  assert.deepEqual(events.busy, [true]);

  await engine.copy('must not replace the first value', 'Mailing address');
  assert.deepEqual(events.writes, ['contact@casellas-maknikar.com']);
  assert.deepEqual(events.busy, [true]);
  assert.equal(events.reads, 0);

  waiting.resolve();
  await first;
  assert.deepEqual(events.notices, ['Email address copied.']);
  assert.deepEqual(events.busy, [true, false]);
  assert.equal(engine.pending, false);
});

for (const [reason, writeText] of [
  ['asynchronous denial', async () => { throw new Error('denied'); }],
  ['synchronous failure', () => { throw new Error('unavailable'); }],
  ['missing write support', undefined],
]) test(`copy handles ${reason} without a false success`, async () => {
  const { engine, events } = fixture({ writeText });
  await engine.copy('contact@casellas-maknikar.com', 'Email address');
  assert.deepEqual(events.notices, ['Could not copy the email address. Clipboard access was unavailable.']);
  assert.deepEqual(events.busy, [true, false]);
  assert.equal(events.reads, 0);
  assert.equal(engine.pending, false);
});

test('copy recovers after rejection and allows the next explicit attempt', async () => {
  let attempts = 0;
  const { engine, events } = fixture({ writeText: async text => {
    events.writes.push(text);
    if (++attempts === 1) throw new Error('first permission denied');
  } });
  await engine.copy('first', 'Mailing address');
  await engine.copy('second', 'Mailing address');
  assert.deepEqual(events.writes, ['first', 'second']);
  assert.deepEqual(events.notices, [
    'Could not copy the mailing address. Clipboard access was unavailable.',
    'Mailing address copied.',
  ]);
  assert.deepEqual(events.busy, [true, false, true, false]);
  assert.equal(engine.pending, false);
});
