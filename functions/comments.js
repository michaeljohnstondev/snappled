// comments.js — telling people someone replied.
//
// The client already wrote a notification document when you commented,
// into a top-level `notifications` collection that nothing has ever
// read. No trigger watched it, so no push was ever sent and no in-app
// notification ever appeared. Comments have been notifying an empty
// room since they were written.
//
// This is the trigger that was missing. It reuses deliverNotification
// from notify.js, which is the one place that checks blocks, mutes and
// per-type toggles and then writes the in-app doc and sends the FCM -
// so comments get the same treatment as follows and game invites
// rather than a second, parallel path that drifts.
//
// WHO GETS TOLD
//
//   top-level comment   the snapple's creator
//   reply               everyone already in the thread, plus the
//                       snapple's creator
//
// "Everyone already in the thread" is kept as a participants array on
// the thread's root comment, maintained HERE rather than by the client.
// The alternative - querying every reply to work out who has spoken -
// costs one read per reply on every new reply, so a busy thread gets
// quadratically more expensive as it gets busier. One array on one
// document costs one read no matter how long the thread runs.
//
// Maintaining it server-side also means a client cannot add somebody
// to a thread they never joined, which would be a way to make the app
// push notifications at a stranger.

// v1 explicitly: firebase-functions v5+ makes the root import v2, which
// has no functions.firestore.document. Same note as the top of index.js.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { deliverNotification } = require('./notify');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// How many people one reply will notify. A thread with hundreds of
// participants should not turn a single reply into hundreds of pushes -
// past a point it stops being a conversation anyone is following and
// starts being a broadcast.
const MAX_FANOUT = 30;

/** First line of a comment, short enough to read on a lock screen. */
function preview(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > 80 ? t.slice(0, 77) + '…' : t;
}

exports.onCommentCreated = functions.firestore
  .document('comments/{commentId}')
  .onCreate(async (snap, context) => {
    const comment = snap.data() || {};
    const commentId = context.params.commentId;
    const author = comment.userId;
    const snappleId = comment.snappleId;
    if (!author || !snappleId) return null;

    // A reply belongs to the thread it replies to; a top-level comment
    // starts its own.
    const rootId = comment.parentCommentId || commentId;
    const isReply = !!comment.parentCommentId;

    // Who is in this conversation already.
    let participants = [];
    if (isReply) {
      const rootSnap = await db.collection('comments').doc(rootId).get();
      if (rootSnap.exists) {
        const root = rootSnap.data() || {};
        // The thread's author counts as a participant even before the
        // array exists - they started it.
        participants = [...(root.participants || []), root.userId].filter(Boolean);
      }
    }

    // The snapple's creator hears about everything on their own video.
    let creatorId = null;
    const snappleSnap = await db.collection('snapples').doc(snappleId).get();
    if (snappleSnap.exists) creatorId = snappleSnap.data().creatorId || null;

    const recipients = [...new Set([...participants, creatorId])]
      .filter(uid => uid && uid !== author);

    // Per-thread mute. Checked here rather than in deliverNotification
    // because it is specific to this conversation - deliverNotification
    // handles the account-wide switches that apply to every type.
    const kept = [];
    for (const uid of recipients.slice(0, MAX_FANOUT)) {
      try {
        const u = await db.collection('users').doc(uid).get();
        if (!u.exists) continue;
        // Keyed by snappleId: the mute control is one switch in the
        // thread header covering that snapple's whole conversation,
        // not a per-root-comment toggle. rootId is still accepted so
        // anything muted under the old per-thread control stays muted.
        const muted = u.data().mutedThreads || [];
        if (muted.includes(snappleId) || muted.includes(rootId)) continue;
        kept.push(uid);
      } catch (e) {
        console.warn('[comments] mute check failed', uid, e.message);
      }
    }

    const who = comment.username || 'Someone';
    const body = preview(comment.text);

    for (const uid of kept) {
      try {
        await deliverNotification({
          targetUserId: uid,
          actorUserId: author,
          settingsKey: 'comments',
          type: 'comment',
          title: uid === creatorId && !isReply
            ? `${who} commented on your snapple`
            : `${who} replied`,
          body,
          // snappleId is what the client navigates by; threadId lets a
          // notification open the thread it belongs to rather than the
          // top of the list.
          data: { snappleId, commentId, threadId: rootId },
        });
      } catch (e) {
        console.warn('[comments] deliver failed', uid, e.message);
      }
    }

    // Record the author as a participant AFTER notifying, so they are
    // not told about their own comment by the write that adds them.
    try {
      await db.collection('comments').doc(rootId).update({
        participants: FV.arrayUnion(author),
      });
    } catch (e) {
      // A reply to a deleted root is the ordinary reason this misses.
      console.warn('[comments] participant update failed', rootId, e.message);
    }

    if (kept.length) {
      console.log(`[comments] ${commentId} notified ${kept.length}`);
    }
    return null;
  });
