const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const javascript = readFileSync(join(__dirname, '../src/context-menu.js'), 'utf8');
function extract(marker) {
  return javascript.split(`// BEGIN ${marker}`)[1].split('\n').slice(1).join('\n').split(`// END ${marker}`)[0].trim();
}
const create = vm.runInNewContext(`(${extract('SCREEN CAPTURE ENGINE')})`);
const count = vm.runInNewContext(`(${extract('TEXT COUNTS')})`);
function fixture(overrides = {}) {
  const events = { requested: 0, stopped: 0, saved: 0, messages: [], busy: [] };
  const stream = { getTracks: () => [{ stop: () => events.stopped++ }, { stop: () => events.stopped++ }] };
  const engine = create({ request: () => { events.requested++; return Promise.resolve(stream); },
    frame: async () => ({ type: 'image/png' }), save: () => events.saved++,
    notify: text => events.messages.push(text), busyChanged: flag => events.busy.push(flag), ...overrides });
  return { engine, events, stream };
}
test('counts words and user-perceived characters, including spaces and joined emoji', () => {
  assert.equal(count(''), '0 words · 0 chars');
  assert.equal(count('a'), '1 word · 1 char');
  assert.equal(count('Hello world'), '2 words · 11 chars');
  assert.equal(count('e\u0301 👩‍💻'), '1 word · 3 chars');
});
test('capture requests permission immediately and stops every track after saving', async () => {
  const { engine, events } = fixture(); const running = engine.run();
  assert.equal(events.requested, 1); assert.equal(engine.pending, true);
  await running; assert.equal(events.saved, 1); assert.equal(events.stopped, 2);
  assert.equal(engine.pending, false); assert.deepEqual(events.busy, [true, false]);
});
test('duplicate capture activation is ignored while permission is pending', async () => {
  let resolve, calls = 0;
  const { engine, events, stream } = fixture({ request: () => { calls++; return new Promise(r => { resolve = r; }); } });
  const running = engine.run(); await engine.run(); assert.equal(calls, 1);
  resolve(stream); await running; assert.equal(events.saved, 1); assert.equal(events.stopped, 2);
});
for (const name of ['NotAllowedError', 'AbortError']) test(`${name} preserves a usable capture action`, async () => {
  const { engine, events } = fixture({ request: () => Promise.reject(Object.assign(new Error(), { name })) });
  await engine.run(); assert.equal(engine.pending, false); assert.equal(events.saved, 0);
  assert.match(events.messages[0], /cancelled|not granted/);
});
for (const stage of ['frame', 'save']) test(`capture stops tracks when ${stage} fails`, async () => {
  const { engine, events } = fixture({ [stage]: () => { throw new Error('failed'); } });
  await engine.run(); assert.equal(events.stopped, 2); assert.equal(engine.pending, false);
  assert.match(events.messages[0], /Could not capture/);
});
test('empty encoding result is not downloaded and stops capture', async () => {
  const { engine, events } = fixture({ frame: async () => null });
  await engine.run(); assert.equal(events.saved, 0); assert.equal(events.stopped, 2);
});
