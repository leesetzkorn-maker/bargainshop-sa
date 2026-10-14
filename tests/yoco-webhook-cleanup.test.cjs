'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { retireLegacyYocoWebhook } = require('../scripts/runtime/retire-legacy-yoco-webhook.cjs');
const GOOD = 'https://bargainshop.co.za/api/payments/yoco/notify';
const OLD = 'https://bargainshop-sa-production.up.railway.app/api/payments/yoco/notify';
const KEY = 'sk_live_not-real-for-tests';
const log = { info() {}, warn() {} };

function fakeFetch(subscriptions, { failDelete = false } = {}) {
  const calls = [];
  async function fetchFn(url, opts) {
    calls.push({ url, method: opts.method, auth: opts.headers.Authorization });
    if (opts.method === 'GET') return { ok: true, json: async () => ({ subscriptions }) };
    return { ok: !failDelete, status: failDelete ? 403 : 200 };
  }
  return { fetchFn, calls };
}

test('removes only the exact retired-domain subscription and preserves the active one', async () => {
  const { fetchFn, calls } = fakeFetch([
    { id: 'sub_good', url: GOOD, mode: 'live' },
    { id: 'sub_old', url: OLD, mode: 'live' },
    { id: 'sub_other', url: 'https://another-website.example/hooks', mode: 'live' },
    { id: 'sub_test', url: OLD, mode: 'test' },
  ]);
  assert.deepEqual(await retireLegacyYocoWebhook({ secretKey: KEY, fetchFn, log }), { status: 'ok', removed: 1 });
  assert.deepEqual(calls.map(x => [x.method, x.url]), [
    ['GET', 'https://payments.yoco.com/api/webhooks'],
    ['DELETE', 'https://payments.yoco.com/api/webhooks/sub_old'],
  ]);
  assert.ok(calls.every(x => x.auth === 'Bearer ' + KEY));
});

test('never deletes if active domain is absent or duplicated', async () => {
  for (const entries of [
    [{ id: 'sub_old', url: OLD, mode: 'live' }],
    [{ id: 'sub_good', url: GOOD, mode: 'live' }, { id: 'sub_good2', url: GOOD, mode: 'live' }, { id: 'sub_old', url: OLD, mode: 'live' }],
  ]) {
    const { fetchFn, calls } = fakeFetch(entries);
    assert.equal((await retireLegacyYocoWebhook({ secretKey: KEY, fetchFn, log })).status, 'skipped');
    assert.equal(calls.filter(x => x.method === 'DELETE').length, 0);
  }
});

test('already removed is a harmless no-op', async () => {
  const { fetchFn, calls } = fakeFetch([{ id: 'sub_good', url: GOOD, mode: 'live' }]);
  assert.deepEqual(await retireLegacyYocoWebhook({ secretKey: KEY, fetchFn, log }), { status: 'ok', removed: 0 });
  assert.equal(calls.filter(x => x.method === 'DELETE').length, 0);
});

test('never calls API without proper key or malformed subscription response', async () => {
  const { fetchFn, calls } = fakeFetch([]);
  assert.equal((await retireLegacyYocoWebhook({ secretKey: 'invalid', fetchFn, log })).status, 'skipped');
  assert.equal(calls.length, 0);
  await assert.rejects(() => retireLegacyYocoWebhook({ secretKey: KEY, log,
    fetchFn: async () => ({ ok: true, json: async () => ({ unknown: [] }) }),
  }), /subscriptions list/);
});

test('a failed deletion is not reported as success', async () => {
  const { fetchFn } = fakeFetch([{ id: 'sub_good', url: GOOD, mode: 'live' }, { id: 'sub_old', url: OLD, mode: 'live' }], { failDelete: true });
  await assert.rejects(() => retireLegacyYocoWebhook({ secretKey: KEY, fetchFn, log }), /HTTP 403/);
});
