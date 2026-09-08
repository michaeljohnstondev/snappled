// notificationDisplayService.js
// Foreground push display bridge. FCM on Android/iOS suppresses
// notification-tray display when the app is in foreground, so we need
// to render our own in-app banner. Uses the existing ModalContext
// toast so it feels native to snappled instead of adding a new UI
// primitive.
//
// The service exposes a setter for the toast function; the App root
// wires it up once on mount so this module stays UI-framework-free
// (safe to import from services that don't know about React).

let toastFn = null;
let navigationFn = null;

// Push type -> toast style. Deliberately explicit: these are two
// different vocabularies and the overlap is coincidental, so a new
// notification type should have to choose a style rather than inherit
// whatever the fallback happens to be.
const TOAST_TYPE_FOR = {
  new_follower: 'info',
  mutual_follow: 'info',
  followed_user_snapple: 'info',
  game_invite: 'info',
  new_prompt_digest: 'info',
};

export const notificationDisplayService = {
  // setToast — called ONCE from a bridge component that lives inside
  // ModalContext. Wires the toast callback so foreground FCM messages
  // can render as banners.
  setToast(fn) {
    toastFn = fn;
  },

  // setNavigate — same shape for the navigation handler. Tapping the
  // toast opens the destination screen. Passed in from the app root
  // where the navigation ref is available.
  setNavigate(fn) {
    navigationFn = fn;
  },

  // displayWithNavigation — called by fcmService.handleForegroundMessage
  // when a push arrives while app is foregrounded. Shows toast; if the
  // user taps, dispatches the same navigation logic used for tap-in-tray.
  displayWithNavigation(remoteMessage, onTapNavigate) {
    if (!toastFn) {
      console.warn('[notificationDisplayService] toast not wired yet — dropping foreground banner');
      return false;
    }
    const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || 'Snappled';
    const body = remoteMessage?.notification?.body || remoteMessage?.data?.message || remoteMessage?.data?.body || '';
    if (!body && title === 'Snappled') return false; // skip empty pushes

    // ModalContext's showToast is (type, title, subtitle) — no tap
    // handler. Foreground toast is informational only; users can
    // still tap the OS-tray notification when the app is
    // backgrounded/quit and hit the same navigation path.
    // The push's `type` is a NAVIGATION key - game_invite,
    // new_follower - not a toast style. Passing it straight through
    // meant RewardToast never recognised it and fell back to reward, so
    // every push arrived labelled "REWARD!". Mapped explicitly, and
    // anything unmapped lands on info rather than inventing a mood.
    const toastType = TOAST_TYPE_FOR[remoteMessage?.data?.type] || 'info';
    toastFn(toastType, title, body);
    return true;
  },
};

export default notificationDisplayService;
