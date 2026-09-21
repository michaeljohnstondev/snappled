// notify.js — the one place a notification is sent.
//
// Lifted out of index.js so other trigger files can reach it. It was a
// module-private function there, and exporting it from index.js would
// have put a plain async function in Firebase's list of things to
// deploy, next to the actual triggers.
//
// Every fan-out in the app calls this: follows, game invites, friends'
// snapples, comments. One place that checks blocks, mutes and per-type
// toggles, writes the in-app document and sends the FCM - so a new
// notification type cannot quietly skip a check by growing its own
// delivery path.

const admin = require('firebase-admin');

const db = admin.firestore();

const messagingAdmin = admin.messaging();

// deliverNotification — the one place that sends FCM + writes the
// in-app notification doc. Every fan-out below calls this. Skips if
// the target has no FCM token, has blocked/muted the actor, or has
// the relevant push type toggled off.
//
// Params:
//   targetUserId    — recipient
//   actorUserId     — user whose action triggered this (skipped if blocked/muted)
//   settingsKey     — key under settings.notifications.push.* to check
//   type            — string used by client navigation switch
//   title, body     — user-facing notification copy
//   data            — extra fields for client navigation (userId, snappleId, etc.)
//   priority        — 'normal' | 'high' | 'urgent' — drives in-app color
async function deliverNotification({
  targetUserId, actorUserId, settingsKey, type, title, body, data = {}, priority = 'normal',
}) {
  if (!targetUserId || !type) return { sent: false, reason: 'missing-params' };

  // Skip self-notifications entirely.
  if (actorUserId && actorUserId === targetUserId) {
    return { sent: false, reason: 'self' };
  }

  const targetSnap = await db.collection('users').doc(targetUserId).get();
  if (!targetSnap.exists) return { sent: false, reason: 'no-target-doc' };
  const target = targetSnap.data() || {};

  // Block check — either side blocking kills the notification.
  const blockedByTarget = (target.social?.blockedUsers || []).includes(actorUserId);
  const blockedActor = (target.social?.blockedBy || []).includes(actorUserId);
  if (blockedByTarget || blockedActor) {
    return { sent: false, reason: 'blocked' };
  }

  // Mute check — one-way, only the target's mute matters.
  const muted = (target.social?.mutedNotifications || []).includes(actorUserId);
  if (muted) return { sent: false, reason: 'muted' };

  // Per-type toggle check. Missing settings doc = every type ON,
  // including newPrompts. Only an explicit `false` silences a type,
  // so legacy users with no settings doc get the full set.
  const pushPrefs = target.settings?.notifications?.push || {};
  const enabled = pushPrefs[settingsKey] !== undefined ? pushPrefs[settingsKey] : true;
  if (!enabled) return { sent: false, reason: 'toggled-off' };

  // Write in-app notification (owned by Cloud Functions per the CLAUDE.md
  // pattern — no client-side write on foreground receive).
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const notifRef = db.collection('users').doc(targetUserId).collection('notifications').doc(notifId);
  await notifRef.set({
    id: notifId,
    type,
    title,
    message: body,
    data: { ...data, actorUserId: actorUserId || null },
    priority,
    read: false,
    createdAt: admin.firestore.Timestamp.now(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
  });

  // Send FCM if the target has a token.
  const token = target.deviceInfo?.fcmToken;
  if (!token) return { sent: false, reason: 'no-token', notifId };

  try {
    await messagingAdmin.send({
      token,
      notification: { title, body },
      data: {
        // FCM data fields must be strings.
        type: String(type),
        ...Object.fromEntries(
          Object.entries({ ...data, actorUserId: actorUserId || '' })
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)]),
        ),
      },
      android: { priority: priority === 'urgent' ? 'high' : 'normal' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return { sent: true, notifId };
  } catch (err) {
    console.error(`[deliverNotification] FCM send failed for ${targetUserId}:`, err.message);
    // Clean up the token if it's no longer valid — prevents repeated
    // fan-out failures against a dead device.
    if (err.code === 'messaging/registration-token-not-registered'
        || err.code === 'messaging/invalid-registration-token') {
      await db.collection('users').doc(targetUserId).update({
        'deviceInfo.fcmToken': null,
        'deviceInfo.notificationsEnabled': false,
        'deviceInfo.lastTokenUpdate': admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
    return { sent: false, reason: 'fcm-error', error: err.message, notifId };
  }
}


module.exports = { deliverNotification };
