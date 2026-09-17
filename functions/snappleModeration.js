// snappleModeration.js — what happens when people report a snapple.
//
// Reporting used to be a client-side write and nothing else: the phone
// added a report document with an auto-id and incremented the snapple's
// own count. Both halves were wrong. The auto-id meant one person could
// report the same clip twenty times, and the count came from the
// reporter, so the number that was supposed to measure how many people
// objected measured how many times one person tapped.
//
// The report id is now <snappleId>_<uid>, so the count is distinct
// people by construction. This counts them and, past a threshold, takes
// the clip out of circulation until a human looks at it.
//
// Hidden, never deleted. Three reports is enough to stop something
// spreading and nowhere near enough to be sure it deserves deleting —
// a brigade of three is a group chat. The admin Reports tab is where
// the actual decision gets made; this just stops the clock running
// while it waits.

// v1 explicitly: firebase-functions v5+ made the root import the v2
// API, which has no functions.firestore.document. Same note as the top
// of index.js.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();

// Distinct reporters before a snapple is pulled from circulation.
// Matches the prompt threshold, for the same reason: one person is an
// opinion, two is a coincidence, three is a pattern.
const HIDE_THRESHOLD = 3;

exports.onSnappleReported = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap) => {
    const report = snap.data() || {};
    const snappleId = report.snappleId;
    if (!snappleId) return null;

    const reports = await db.collection('reports')
      .where('snappleId', '==', snappleId)
      .get();
    // One document per reporter, so the document count IS the number of
    // people who objected.
    const count = reports.size;

    const ref = db.collection('snapples').doc(snappleId);
    const snappleSnap = await ref.get();
    if (!snappleSnap.exists) return null;

    // Keep the running total on the snapple even below the threshold,
    // so the admin screen can see something trending before it trips.
    const updates = {
      reports: count,
      isReported: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (count >= HIDE_THRESHOLD && snappleSnap.data().isActive !== false) {
      // isActive: false is already the visibility gate everywhere that
      // reads snapples — the pool, the grids, hands, eligibility. One
      // flag takes it out of all of them at once.
      updates.isActive = false;
      updates.hiddenReason = 'reported';
      updates.hiddenAt = admin.firestore.FieldValue.serverTimestamp();
      console.log(`[Moderation] hid snapple ${snappleId} (${count} reports)`);
    }

    await ref.update(updates).catch(() => {});
    return null;
  });
