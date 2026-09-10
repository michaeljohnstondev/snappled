// admin.js — who counts as an admin.
//
// The uid list was copy-pasted into five separate files (LoadingPhase,
// PreviewPlayer, PromptInfoOverlay, SnappleOverlay, UserMenu) and
// snappleService already carries a note about it. Five literals means
// five places to edit when the list changes and five chances to miss
// one, which for an access check is the kind of drift that quietly
// grants or removes admin in one corner of the app only.
//
// New code reads from here. The existing copies are untouched for now -
// they are working and each sits in a different screen - but this is
// where they should collapse to.
//
// Worth being clear about what this is NOT: a client-side uid check is
// a UI affordance, not a permission. It decides whether a button is
// drawn. Anything that actually matters has to be enforced in Firestore
// rules or a Cloud Function, because this list ships inside the bundle
// and a modified client can simply answer true.

export const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

/** True when this uid is on the admin list. */
export function isAdminUid(uid) {
  return !!uid && ADMIN_UIDS.includes(uid);
}
