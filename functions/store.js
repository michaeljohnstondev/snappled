// store.js — buying things with coins, decided on the server.
//
// The client used to do this itself: read its own balance, subtract the
// price, grant the item, all in one updateDoc against its own user
// document. Every number in that sentence came from the phone. The
// price was passed in as `item.coinPrice`, so a modified client could
// buy a 5,000-coin Shield for zero, or for a negative amount and come
// out ahead. And since the balance check and the debit were separate
// steps, two taps in the same second both passed the check.
//
// So the catalogue lives here now. The client keeps its copy for
// DISPLAY - what the shelf looks like is a UI question - but what a
// thing costs and what it gives you is answered in one transaction the
// buyer cannot reach.

// v1 explicitly. The bare require is the v2 API in firebase-functions
// v5+, and a v2 onCall handler is passed ONE argument - so the
// (data, context) signature below silently bound context to
// something that is not the auth context, context.auth came back
// undefined, and every call threw 'unauthenticated'. Every other
// function in this codebase is 1st gen; see the top of index.js.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

const BOOST_DURATION_MS = 24 * 60 * 60 * 1000;

// Deck size ladder. Mirrors StoreScreen's display copy:
//   50->60: 500, 60->70: 1000, 70->80: 2500, 80->90: 5000, 90->100: 7500
//   100->125: 10000, then the same per +25 up to the 500 ceiling.
const DECK_SIZE_START = 50;
const DECK_SIZE_INCREMENT = 10;
const DECK_SIZE_MAX = 500;
const DECK_UPGRADE_PRICES = [500, 1000, 2500, 5000, 7500];
const DECK_BIG_INCREMENT = 25;
const DECK_BIG_PRICE = 10000;

/**
 * deckUpgrade — price and step for a user's NEXT deck upgrade.
 *
 * Priced from the deck they currently have rather than from anything
 * the client says, which is the whole point: the ladder gets steeper,
 * so a buyer who picked their own starting rung would climb it free.
 * Returns null at the ceiling.
 */
function deckUpgrade(currentMax) {
  const current = currentMax || DECK_SIZE_START;
  if (current >= DECK_SIZE_MAX) return null;
  if (current < 100) {
    const step = Math.round((current - DECK_SIZE_START) / DECK_SIZE_INCREMENT);
    return { price: DECK_UPGRADE_PRICES[step] || 7500, next: current + DECK_SIZE_INCREMENT };
  }
  return { price: DECK_BIG_PRICE, next: Math.min(current + DECK_BIG_INCREMENT, DECK_SIZE_MAX) };
}

// The catalogue. `price` is a number for everything with a fixed cost;
// deck_size_up computes its own from the buyer's current deck.
//
// `apply` returns the field updates that item grants. It receives the
// user's existing data so an item can depend on what they already have,
// and it is the only place an item's effect is written down - adding a
// shelf to the UI without adding it here sells nothing, which is the
// failure direction you want.
const CATALOGUE = {
  trophy_boost: {
    name: 'Trophy Boost',
    price: 3000,
    apply: () => ({
      'boosts.trophyBoost': new Date(Date.now() + BOOST_DURATION_MS).toISOString(),
    }),
  },
  xp_boost: {
    name: 'XP Boost',
    price: 3000,
    apply: () => ({
      'boosts.xpBoost': new Date(Date.now() + BOOST_DURATION_MS).toISOString(),
    }),
  },
  mulligan: {
    name: 'Mulligan',
    price: 500,
    apply: () => ({ 'inventory.mulligans': FV.increment(1) }),
  },
  shield: {
    name: 'Shield',
    price: 5000,
    apply: () => ({ 'inventory.shields': FV.increment(1) }),
  },
  spotlight: {
    name: 'Spotlight',
    price: 1500,
    apply: () => ({ 'inventory.spotlights': FV.increment(1) }),
  },
  deck_size_up: {
    name: 'Deck Size Upgrade',
    priceFor: (userData) => {
      const step = deckUpgrade(userData?.upgrades?.maxDeckSize);
      return step ? step.price : null;
    },
    apply: (userData) => {
      const step = deckUpgrade(userData?.upgrades?.maxDeckSize);
      return { 'upgrades.maxDeckSize': step.next };
    },
  },
};

/**
 * spendMulligan — consume one purchased mulligan.
 *
 * The free one each game never comes here: it lives in component state
 * precisely so it cannot be banked, so there is nothing to decrement.
 * This is only for stock bought with coins, which means it needs the
 * same protection a coin does.
 *
 * Refuses at zero rather than going negative. The old client-side
 * version incremented by -1 unconditionally and swallowed the error,
 * so a player with none quietly went into debt and got free swaps until
 * they climbed back out.
 */
exports.spendMulligan = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'No account found.');
    }
    const held = (snap.data().inventory && snap.data().inventory.mulligans) || 0;
    if (held < 1) {
      throw new functions.https.HttpsError(
        'failed-precondition', 'You have no mulligans left.');
    }
    tx.update(userRef, {
      'inventory.mulligans': FV.increment(-1),
      updatedAt: FV.serverTimestamp(),
    });
    return { success: true, remaining: held - 1 };
  });
});

// Extra snapple slots. You get one snapple per prompt for free; a
// second costs 1,000 coins and every one after that 5,000. The price
// therefore depends on how many you already have, which the client used
// to count for itself — and then charge itself accordingly.
const EXTRA_SLOT_SECOND = 1000;
const EXTRA_SLOT_BEYOND = 5000;

/**
 * purchaseExtraSlot — pay to answer a prompt you've already answered.
 *
 * Counts your existing snapples for the prompt server-side and charges
 * from that count. The count is the price, so it cannot come from the
 * phone: a client reporting "I have zero" bought every slot at the
 * cheap rate, and a client skipping the charge bought them at none.
 *
 * Grants nothing — it returns permission, and the snapple upload that
 * follows is what spends it. That gap is deliberate: an upload can fail
 * for a dozen boring reasons, and re-charging someone whose video
 * timed out is worse than the rare free slot.
 */
exports.purchaseExtraSlot = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const promptId = data && data.promptId;
  if (!promptId) {
    throw new functions.https.HttpsError('invalid-argument', 'Which prompt?');
  }

  const existing = await db.collection('snapples')
    .where('promptId', '==', promptId)
    .where('creatorId', '==', uid)
    .get();

  if (existing.empty) {
    // Their first answer to this prompt is free, so there is nothing to
    // sell. Saying so beats charging for a slot they already had.
    return { success: true, charged: 0, free: true };
  }

  const price = existing.size === 1 ? EXTRA_SLOT_SECOND : EXTRA_SLOT_BEYOND;
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'No account found.');
    }
    const balance = (snap.data().resources && snap.data().resources.coins) || 0;
    if (balance < price) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `You need ${price.toLocaleString()} coins and have ${balance.toLocaleString()}.`);
    }
    tx.update(userRef, {
      'resources.coins': FV.increment(-price),
      updatedAt: FV.serverTimestamp(),
    });
    return { success: true, charged: price, coinsRemaining: balance - price };
  });
});

/**
 * purchaseStoreItem — spend coins on one catalogue item.
 *
 * Takes an item id and nothing else. Everything that could be lied
 * about - the price, the effect, whether the buyer can afford it - is
 * read or computed inside the transaction, so the balance that gets
 * checked is the balance that gets debited. Two taps in the same second
 * no longer both pass: the second retries against the first's result.
 */
exports.purchaseStoreItem = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to buy things.');
  }

  const itemId = data && data.itemId;
  const item = CATALOGUE[itemId];
  if (!item) {
    throw new functions.https.HttpsError('invalid-argument', 'No such item.');
  }

  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'No account found.');
    }
    const userData = snap.data();

    const price = item.priceFor ? item.priceFor(userData) : item.price;
    if (price === null || price === undefined) {
      // deck_size_up at the ceiling is the only way to land here: a real
      // item that this particular buyer cannot buy any more of.
      throw new functions.https.HttpsError(
        'failed-precondition', 'You already have the largest deck.');
    }

    const balance = (userData.resources && userData.resources.coins) || 0;
    if (balance < price) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `You need ${price} coins and have ${balance}.`);
    }

    const updates = {
      'resources.coins': FV.increment(-price),
      ...item.apply(userData),
      // Receipts, so a support question about a missing item has an
      // answer. arrayUnion because two purchases of the same item on
      // the same millisecond would otherwise collapse into one - the
      // timestamp is what keeps them distinct.
      purchases: FV.arrayUnion({
        itemId,
        name: item.name,
        coinPrice: price,
        purchasedAt: new Date().toISOString(),
      }),
      updatedAt: FV.serverTimestamp(),
    };

    tx.update(userRef, updates);
    return { success: true, itemId, name: item.name, price, coinsRemaining: balance - price };
  });
});
