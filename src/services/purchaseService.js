// purchaseService.js — buying coins and tickets with real money.
//
// Deliberately thin, and it grants nothing. The flow is:
//
//   app  -> RevenueCat SDK -> Apple / Google   (the charge)
//   store -> RevenueCat -> revenueCatWebhook   (the grant)
//
// The second line never passes through this app, which is the point.
// The client reports nothing about what it bought and is not believed
// about anything; the webhook reads the product id off a receipt the
// stores validated and looks the amount up in its own catalogue. A
// modified build can at most buy something and not be told about it.
//
// So there is a lag: the balance arrives when the webhook lands, not
// when the sheet closes. Usually a second or two. The AuthContext
// listener on the user document is what actually updates the number on
// screen - purchase() does not return a balance, because it does not
// know one.

import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PURCHASE_TYPE } from 'react-native-purchases';

// Everything Snappled sells is a one-time purchase. getProducts takes
// an optional type and DEFAULTS TO SUBSCRIPTIONS on Android, so asking
// without it made RevenueCat query Play for subscriptions by these
// ids - Play has none, correctly returned PRODUCT_NOT_FOUND for all
// eleven, and the store looked broken in a way that pointed at
// everything except the query:
//
//   UnfetchedProduct{productId='snappled_coins_100',
//                    productType='subs', statusCode=3}
//
// Two days went into Play Console - licence testing, tester opt-in,
// propagation windows, signing keys, the store listing - before anyone
// read the log line that named the type.

// Public SDK keys, in the source on purpose.
//
// These are public by design: they identify the app to RevenueCat and
// can grant nothing. The credential that CAN cause coins to be granted
// is the webhook's shared secret, and that lives in Google Secret
// Manager where no client ever sees it.
//
// Committed rather than read from the environment because an
// EXPO_PUBLIC_ variable is inlined into the JS bundle at build time
// anyway - so it ends up shipped to every device either way, and the
// only thing the env indirection adds is a way for a build to silently
// come out with no key and a store that quietly says "Coming Soon".
// The repo already commits google-services.json and the iOS plist for
// exactly the same reason.
//
// The env var still wins if set, so a fork or a staging project can
// point elsewhere without editing this file.
const API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    || 'appl_odcXLdFvEmNjTCqHfsTfmmQTneU',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
    || 'goog_sVnEUeuxQqysRqoUeHfSrrRYsjS',
};

let configuredFor = null;

const purchaseService = {
  /**
   * configure — point the SDK at this signed-in user.
   *
   * The uid matters more than it looks: RevenueCat sends it to the
   * webhook as `app_user_id`, and the webhook credits exactly that
   * document. Configure with the wrong id and someone else gets the
   * coins. Called on sign-in and again on account switch.
   *
   * Returns false when there is no key for this platform, which is the
   * normal state until the RevenueCat project exists - the store's real
   * money shelves stay disabled rather than throwing.
   */
  async configure(uid) {
    const key = API_KEYS[Platform.OS];
    if (!key || !uid) return false;
    if (configuredFor === uid) return true;
    try {
      // RevenueCat's own logs say why a product did not come back -
      // wrong bundle id, agreement not active, product not fetched from
      // the store - none of which reaches us through getProducts, which
      // just returns an empty array. Left on: this app has no secrets in
      // its purchase path, and a store that silently sells nothing is
      // far more expensive than a noisy log.
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      await Purchases.configure({ apiKey: key, appUserID: uid });
      configuredFor = uid;
      return true;
    } catch (error) {
      console.error('[PurchaseService] configure failed:', error);
      return false;
    }
  },

  /** Whether real-money purchases can be attempted at all right now. */
  isAvailable() {
    return !!API_KEYS[Platform.OS] && !!configuredFor;
  },

  /**
   * getPrices — localized price strings, keyed by product id.
   *
   * Apple and Google both require the price shown to be the one the
   * store will charge, in the user's own currency. The hardcoded
   * "$4.99" in the store is a placeholder for exactly this; anything
   * missing here keeps the placeholder rather than showing a blank.
   */
  async getPrices(productIds) {
    if (!this.isAvailable()) return {};
    try {
      const products = await Purchases.getProducts(productIds, PURCHASE_TYPE.INAPP);
      const out = {};
      products.forEach((p) => { out[p.identifier] = p.priceString; });
      return out;
    } catch (error) {
      console.error('[PurchaseService] getPrices failed:', error);
      return {};
    }
  },

  /**
   * diagnose — ask the store about every product and report what it
   * says. Admin tooling, not a user path.
   *
   * getProducts returns the ones it found and silently omits the rest,
   * so asking for one id and getting nothing tells you only that
   * something is wrong. Asking for all eleven separates the cases:
   *
   *   none found      the app is not talking to billing at all - not
   *                   installed through a store track, no licence
   *                   tester, or the agreement has not propagated
   *   some found      the missing ones are misconfigured individually
   *   all found       the problem is downstream of the lookup
   *
   * Also reports whether the SDK reached RevenueCat's backend, which
   * fails for a different set of reasons than the store does.
   */
  async diagnose(productIds) {
    const lines = [];
    lines.push(`platform: ${Platform.OS}`);
    lines.push(`configured: ${configuredFor ? 'yes' : 'NO'}`);
    lines.push(`key: ${(API_KEYS[Platform.OS] || '(none)').slice(0, 9)}…`);

    if (!configuredFor) {
      lines.push('');
      lines.push('SDK never configured - sign out and in again.');
      return lines.join('\n');
    }

    try {
      const info = await Purchases.getCustomerInfo();
      lines.push(`backend: ok (app_user_id ${info.originalAppUserId})`);
    } catch (e) {
      lines.push(`backend: FAILED - ${e?.message || e}`);
    }

    try {
      const found = await Purchases.getProducts(productIds, PURCHASE_TYPE.INAPP);
      const ids = new Set(found.map(p => p.identifier));
      lines.push('');
      lines.push(`store returned ${found.length} of ${productIds.length}`);
      productIds.forEach((id) => {
        const p = found.find(x => x.identifier === id);
        lines.push(`${ids.has(id) ? '  OK  ' : '  --  '}${id}${p ? `  ${p.priceString}` : ''}`);
      });
    } catch (e) {
      lines.push(`getProducts THREW: ${e?.message || e}`);
    }
    return lines.join('\n');
  },

  /**
   * purchase — charge for one product.
   *
   * Resolves once the STORE is done, which is not the same as the coins
   * having arrived; see the note at the top of this file. A user
   * cancelling is not an error worth showing them - they know they
   * cancelled - so it comes back as a distinct flag rather than a
   * message.
   */
  async purchase(productId) {
    if (!this.isAvailable()) {
      return { success: false, error: 'Purchases are not available yet.' };
    }
    try {
      const products = await Purchases.getProducts([productId], PURCHASE_TYPE.INAPP);
      if (!products.length) {
        // An empty array, not an error: the store was asked and had
        // nothing to say about this id. On iOS that is usually an IAP
        // that has never been submitted, or a Paid Apps agreement that
        // has not propagated; on Android it is nearly always an app
        // installed outside Play, because Billing only answers an app
        // signed with the Play key and installed through a track.
        console.warn(
          `[PurchaseService] store returned no product for "${productId}" `
          + `(${Platform.OS}). Check RevenueCat debug logs above.`,
        );
        return {
          success: false,
          error: 'That pack is not available right now. It may still be '
            + 'syncing with the store — try again in a few minutes.',
        };
      }
      await Purchases.purchaseStoreProduct(products[0]);
      return { success: true };
    } catch (error) {
      if (error?.userCancelled) return { success: false, cancelled: true };
      console.error('[PurchaseService] purchase failed:', error);
      return {
        success: false,
        error: error?.message || 'Purchase failed. You have not been charged.',
      };
    }
  },
};

export default purchaseService;
