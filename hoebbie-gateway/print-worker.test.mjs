import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createPrintWorker } from './print-worker.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const command = { commandId: id, asset: 'test-a4-v1', maySubmit: true, cancelRequested: false, expiresAt: new Date(Date.now() + 600000).toISOString() };
function fixture(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [], actions = [];
  const worker = createPrintWorker({
    enabled: 'true', printerUri: 'ipp://192.168.1.5:631/ipp/print', gatewayUrl: 'https://example.invalid/functions/v1/home-assistant-pilot',
    headers: { 'X-Hoebbie-Gateway-Key': 'fixture' }, log() {},
    adapter: { async run(c) { actions.push(c); return { status: 'completed', code: null, sheets: 1 }; } },
    request: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return Response.json(JSON.parse(init.body).mode === 'claim' ? command : { ok: true });
    }, ...options
  });
  return { worker, calls, actions };
}
test('disabled or invalid local print configuration never contacts cloud', async t => {
  for (const config of [{ enabled: 'false' }, { printerUri: 'https://example.com' }]) {
    const f = fixture(t, config); await f.worker.wake(); assert.equal(f.calls.length, 0); t.mock.timers.reset();
  }
});
test('worker reports the exact command result to separate endpoint', async t => {
  const f = fixture(t); await f.worker.wake();
  assert.equal(f.calls.length, 2); assert.equal(f.actions.length, 1);
  assert.equal(f.calls[0].url, 'https://example.invalid/functions/v1/print-pilot');
  assert.deepEqual(f.calls[1].body, { mode: 'report', commandId: id, status: 'completed', code: null, sheets: 1 });
  assert.equal(f.calls[1].headers['X-Hoebbie-Gateway-Key'], 'fixture');
});
test('invalid cloud command never reaches local adapter', async t => {
  const f = fixture(t, { request: async () => Response.json({ ...command, asset: 'free-file' }) });
  await f.worker.wake(); assert.equal(f.actions.length, 0);
});
test('overlapping wake signals cannot concurrently claim or print', async t => {
  let release; const gate = new Promise(r => { release = r; }); let claims = 0;
  const f = fixture(t, { request: async () => { claims++; await gate; return new Response(null, { status: 204 }); } });
  const first = f.worker.wake(); await f.worker.wake(); release(); await first;
  assert.equal(claims, 1); assert.equal(f.actions.length, 0);
});

test('lost terminal report followed by empty queue stops focused polling', async t => {
  let requests = 0;
  const f = fixture(t, { request: async () => {
    requests++;
    if (requests === 1) return Response.json(command);
    if (requests === 2) throw new Error('response lost after server committed result');
    return new Response(null, { status: 204 });
  } });
  await f.worker.wake();
  t.mock.timers.tick(15000); await setImmediate();
  t.mock.timers.tick(60000); await setImmediate();
  assert.equal(requests, 3); assert.equal(f.actions.length, 1);
});
