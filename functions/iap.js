/**
 * iap.js — granting currency for real money.
 *
 * The one rule this file exists to enforce: the CLIENT NEVER DECIDES
 * WHAT A PURCHASE IS WORTH. It reports which product was bought; the
 * amount comes from the catalogue here. Otherwise a modified app claims
 * the $1.99 pack was the $49.99 one and mints currency for free.
 *
 * Receipts are validated by RevenueCat rather than by hand. Verifying
 * an Apple receipt yourself means talking to Apple's endpoint, handling
 * the sandbox-vs-production fallback, and storing a shared secret;
 * Google needs a service account and the Play Developer API. Both are
 * doable and both are places to get subtly wrong in a way that only
 * shows up as fraud. RevenueCat does that and calls this webhook.
 *
 * NOT YET LIVE. Nothing calls this until the store accounts exist and
 * the app ships an IAP SDK - it is here so the server half is ready and
 * reviewable before any money moves.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();

// Mirrors src/lib/products.js. Duplicated deliberately: the client
// bundle can be modified and this file cannot, so the server keeps its
// own copy rather than trusting anything that arrives with a request.
const PRODUCTS = {
  snappled_coins_100: { coins: 100 },
  snappled_coins_500: { coins: 500 },
  snappled_coins_1000: { coins: 1000 },
  snappled_coins_5000: { coins: 5000 },
  snappled_tickets_5: { tickets: 5 },
  snappled_tickets_10: { tickets: 10 },
  snappled_tickets_25: { tickets: 25 },
  snappled_bundle_taster: { coins: 100, tickets: 5 },
  snappled_bundle_starter: { coins: 500, tickets: 10 },
  snappled_bundle_creator: { coins: 2000, tickets: 25 },
  snappled_bundle_mega: { coins: 10000, tickets: 50 },
};

/**
 * Timing-safe comparison of the webhook's authorization header.
 *
 * A plain === leaks how much of the secret matched through how long the
 * comparison took. Cheap to do properly, so there is no reason not to.
 */
function authorized(req) {
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET || '';
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !got || expected.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

/**
 * RevenueCat webhook: grant what a validated purchase bought.
 *
 * Idempotent by transaction id. Webhooks are delivered AT LEAST once -
 * RevenueCat retries on any non-2xx, including a timeout after the work
 * already succeeded - so without this a slow response would grant the
 * same pack twice.
 */
exports.revenueCatWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  if (!authorized(req)) return res.status(401).send('unauthorized');

  const event = (req.body && req.body.event) || {};
  const { type, app_user_id: userId, product_id: productId } = event;
  const txId = event.transaction_id || event.id;

  // Only the events that mean "money moved". A cancellation or an
  // expiry must not grant anything, and consumables are never refunded
  // back into the balance here - that is a support decision.
  if (!['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'].includes(type)) {
    return res.status(200).send('ignored');
  }
  if (!userId || !productId || !txId) return res.status(400).send('incomplete');

  const grants = PRODUCTS[productId];
  // An unknown product is a 200, not a 400: retrying will not make it
  // known, and a 4xx would have RevenueCat redeliver it forever.
  if (!grants) {
    console.warn('[iap] unknown product', productId);
    return res.status(200).send('unknown product');
  }

  const ledgerRef = db.collection('purchases').doc(String(txId));
  try {
    const granted = await db.runTransaction(async (tx) => {
      const seen = await tx.get(ledgerRef);
      if (seen.exists) return false;

      const userRef = db.collection('users').doc(userId);
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error(`no such user ${userId}`);

      // increment() rather than read-then-write: a purchase can land
      // while the player is spending, and a computed total would
      // silently discard whichever write lost the race.
      const inc = admin.firestore.FieldValue.increment;
      const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (grants.coins) update['resources.coins'] = inc(grants.coins);
      if (grants.tickets) update['resources.tokens'] = inc(grants.tickets);
      tx.update(userRef, update);

      // The ledger entry IS the idempotency key, written in the same
      // transaction as the grant so the two cannot disagree.
      tx.set(ledgerRef, {
        userId,
        productId,
        grants,
        type,
        store: event.store || null,
        environment: event.environment || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });

    console.log('[iap]', granted ? 'granted' : 'duplicate', txId, productId, userId);
    return res.status(200).send(granted ? 'granted' : 'duplicate');
  } catch (err) {
    console.error('[iap] grant failed', txId, err);
    // 500 so RevenueCat retries - this is the case where a retry is
    // exactly what we want.
    return res.status(500).send('retry');
  }
});
