'use strict';

/**
 * Idempotently retire ONLY Bargainshop's obsolete Railway-hostname Yoco webhook.
 * Never delete the active bargainshop.co.za subscription, or any other endpoint.
 */
const WEBHOOKS_URL = 'https://payments.yoco.com/api/webhooks';
const CURRENT_URL = 'https://bargainshop.co.za/api/payments/yoco/notify';
const RETIRED_URL = 'https://bargainshop-sa-production.up.railway.app/api/payments/yoco/notify';

async function retireLegacyYocoWebhook({ secretKey = process.env.YOCO_SECRET_KEY, fetchFn = fetch, log = console } = {}) {
  if (typeof secretKey !== 'string' || !/^sk_(live|test)_/.test(secretKey.trim())) {
    return { status: 'skipped', reason: 'No recognised Yoco key' };
  }
  const key = secretKey.trim();
  const mode = key.startsWith('sk_live_') ? 'live' : 'test';
  const headers = { Authorization: 'Bearer ' + key };

  const listResponse = await fetchFn(WEBHOOKS_URL, {
    method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(6000),
  });
  if (!listResponse.ok) throw new Error('Yoco subscription lookup returned HTTP ' + listResponse.status);
  const result = await listResponse.json();
  if (!Array.isArray(result?.subscriptions)) {
    throw new Error('Yoco subscription lookup did not return a subscriptions list');
  }
  const subscriptions = result.subscriptions;
  const active = subscriptions.filter(item => item?.url === CURRENT_URL && item?.mode === mode);
  if (active.length !== 1 || !/^sub_[A-Za-z0-9_-]+$/.test(active[0]?.id || '')) {
    log.warn('Yoco webhook cleanup skipped: exactly one working-domain subscription must exist in this key mode.');
    return { status: 'skipped', reason: 'Active endpoint not uniquely registered' };
  }
  const obsolete = subscriptions.filter(item => item?.url === RETIRED_URL && item?.mode === mode);
  let removed = 0;
  for (const item of obsolete) {
    if (!/^sub_[A-Za-z0-9_-]+$/.test(item?.id || '')) {
      throw new Error('Yoco returned an invalid retired subscription identifier; no delete attempted');
    }
    const deleteResponse = await fetchFn(WEBHOOKS_URL + '/' + encodeURIComponent(item.id), {
      method: 'DELETE', headers, cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    if (!deleteResponse.ok) throw new Error('Yoco retired subscription delete returned HTTP ' + deleteResponse.status);
    removed += 1;
  }
  if (removed) log.info('Yoco: retired ' + removed + ' obsolete Railway-domain webhook subscription(s); current bargainshop.co.za webhook preserved.');
  else log.info('Yoco: no obsolete Railway-domain webhook subscriptions remain.');
  return { status: 'ok', removed };
}

module.exports = { retireLegacyYocoWebhook };
