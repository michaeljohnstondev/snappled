// summonPrompt.js — putting a prompt into rotation, and charging for it.
//
// This ran on the client. The phone checked the ban list, searched the
// four prompt collections, wrote the new prompt, and then — separately,
// afterwards, as its own updateDoc — took a ticket off its own balance.
// Every one of those steps was optional from the caller's side. Skip
// the last write and prompts are free; skip the ban check and a banned
// phrase goes straight back into rotation.
//
// The charge is the reason it had to move. A ticket is bought with real
// money, so what it buys has to be decided somewhere the buyer is not.
//
// Summoning has four outcomes and only three of them cost anything:
//
//   already_active   it is live right now       free
//   promoted         pulled up from on-deck     1 ticket
//   revived          pulled back from the pool  1 ticket
//   created          brand new                  1 ticket
//
// "Already live" staying free is deliberate and predates this port: you
// asked for something that was already there, so you got it without
// paying. The client used to enforce that by choosing not to run the
// debit. Here it falls out of charging inside the same transaction that
// decides the outcome.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

const PROMPT_COST = 1;
const ACTIVE_MS = 24 * 60 * 60 * 1000;
// Prompts stop accepting new answers ten minutes before they expire, so
// nobody starts recording against a prompt that dies mid-upload.
const LOCKOUT_MS = ACTIVE_MS - 10 * 60 * 1000;

/** Same normalisation the rest of the app de-dups prompt text with. */
function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First document in a collection whose textKey matches, or null. */
async function findByTextKey(collection, textKey) {
  const snap = await db.collection(collection)
    .where('textKey', '==', textKey).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

/** The counters every freshly-activated prompt starts from. */
function freshCounters() {
  return {
    likeCount: 0,
    dislikeCount: 0,
    likes: [],
    dislikes: [],
    reports: [],
    reportCount: 0,
    participantCount: 0,
    totalViews: 0,
  };
}

/**
 * summonPrompt — make a prompt live, charging a ticket unless it
 * already was.
 *
 * The searches run before the transaction because Firestore
 * transactions cannot run queries; the transaction then re-reads the
 * user and does the money. That ordering means a prompt could in
 * principle be summoned by someone else between the search and the
 * charge, which costs the loser a ticket for a duplicate — so the
 * write into activePrompts uses the textKey as its document id, and a
 * duplicate collides instead of writing twice.
 */
exports.summonPrompt = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }

  const cleanText = String((data && data.text) || '').trim();
  if (!cleanText) {
    throw new functions.https.HttpsError('invalid-argument', 'Write a prompt first.');
  }
  if (cleanText.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'That prompt is too long.');
  }
  const textKey = normalizePromptText(cleanText);
  if (!textKey) {
    throw new functions.https.HttpsError('invalid-argument', 'Write a prompt first.');
  }

  const username = String((data && data.username) || '').trim() || 'anonymous';

  // 1. Permanently banned text never comes back, at any price.
  const banned = await db.collection('bannedPromptTexts').doc(textKey).get();
  if (banned.exists) {
    return { success: true, status: 'banned' };
  }

  // 2. Already live? Free, and nothing to write.
  const active = await findByTextKey('activePrompts', textKey);
  if (active) {
    return {
      success: true,
      status: 'already_active',
      promptId: active.id,
      prompt: { id: active.id, ...active.data() },
    };
  }

  // 3. Where else it might be. On-deck wins over the pool: an on-deck
  //    prompt was queued to run next, so summoning one is pulling it
  //    forward rather than reviving something retired.
  const onDeck = await findByTextKey('onDeckPrompts', textKey);
  const pooled = onDeck ? null : await findByTextKey('promptPool', textKey);

  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const expiresAt = new Date(now + ACTIVE_MS).toISOString();
  const lockoutAt = new Date(now + LOCKOUT_MS).toISOString();

  // Deterministic id. Two people summoning the same text at the same
  // moment both aim at this document, and the second one's create fails
  // rather than producing two live copies of one prompt.
  const activeRef = db.collection('activePrompts').doc(textKey);
  const userRef = db.collection('users').doc(uid);

  let status;
  let promptData;

  try {
    await db.runTransaction(async (tx) => {
      const [userSnap, activeSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(activeRef),
      ]);

      if (activeSnap.exists) {
        // Someone beat us to it in the last few milliseconds. Free, same
        // as if it had been live when we looked.
        status = 'already_active';
        promptData = { id: activeSnap.id, ...activeSnap.data() };
        return;
      }
      if (!userSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'No account found.');
      }

      const userData = userSnap.data();
      const tickets = (userData.resources && userData.resources.tokens) || 0;
      if (tickets < PROMPT_COST) {
        throw new functions.https.HttpsError(
          'failed-precondition', 'You need a ticket to create a prompt.');
      }

      if (onDeck) {
        const d = onDeck.data();
        promptData = {
          ...d,
          textKey,
          createdAt: nowISO,
          expiresAt,
          lockoutAt,
          isSystem: d.isSystem === undefined ? false : d.isSystem,
          ...freshCounters(),
          summonedBy: uid,
          summonedFrom: 'onDeck',
        };
        status = 'promoted';
        tx.delete(db.collection('onDeckPrompts').doc(onDeck.id));
      } else if (pooled) {
        const d = pooled.data();
        promptData = {
          text: d.text || cleanText,
          textKey,
          category: d.category || 'user',
          createdBy: d.createdBy || uid,
          creatorUsername: d.creatorUsername || username,
          createdAt: nowISO,
          expiresAt,
          lockoutAt,
          isSystem: d.isSystem === undefined ? false : d.isSystem,
          ...freshCounters(),
          revivedBy: uid,
          poolDocId: pooled.id,
        };
        status = 'revived';
        // Lifetime stats stay on the pool doc; this is the instance count.
        tx.update(db.collection('promptPool').doc(pooled.id), {
          instanceCount: FV.increment(1),
          lastRevivedAt: nowISO,
        });
      } else {
        // Fresh. Goes into the pool as well as into rotation, so the
        // next person to summon this text revives it instead of
        // creating a second copy with its own separate history.
        const base = {
          text: cleanText,
          textKey,
          createdBy: uid,
          creatorUsername: username,
          category: 'user',
          createdAt: nowISO,
          isSystem: false,
        };
        const poolRef = db.collection('promptPool').doc();
        tx.set(poolRef, {
          ...base,
          likeCountLifetime: 0,
          dislikeCountLifetime: 0,
          participantCountLifetime: 0,
          totalViewsLifetime: 0,
          instanceCount: 1,
          lastRevivedAt: nowISO,
        });
        promptData = {
          ...base,
          expiresAt,
          lockoutAt,
          ...freshCounters(),
          poolDocId: poolRef.id,
        };
        status = 'created';
      }

      tx.create(activeRef, promptData);
      tx.update(userRef, {
        'resources.tokens': FV.increment(-PROMPT_COST),
        updatedAt: FV.serverTimestamp(),
      });
      promptData = { id: activeRef.id, ...promptData };
    });
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('[summonPrompt]', uid, textKey, e.message);
    throw new functions.https.HttpsError('internal', 'Could not create that prompt.');
  }

  return { success: true, status, promptId: promptData.id, prompt: promptData };
});
