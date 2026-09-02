# Task List — Snappled

Live working doc. Shipped work lives in git history, not here — an entry
leaves this file the moment it lands. Unstarted feature ideas live in
BACKLOG.md; this file is only what's actively being worked.

Last pruned: 2026-08-25

## Active Tasks

### Light theme — game screens (phase 1 of the rollout)
- **Status**: WARMUP + PICKING DONE, REST OF THE GAME STILL DARK
- **Approach**: NOT tracker's semantic light palette (rejected — too much
  of a redesign). This inverts background + text and leaves every vibe*
  accent hue exactly as it was.
- **Infra**: `src/theme/themes.js` now exports `darkTheme` / `lightTheme` /
  `themes`; `src/theme/ThemeContext.js` ported from tracker (dark/light/
  system, AsyncStorage, `useThemedStyles` factory cache). `ThemeProvider`
  wraps the tree in App.js. Toggle lives in Settings.
- **Key compatibility trick**: `export default` is still the DARK theme, so
  all ~85 unconverted files keep rendering exactly as before. The migration
  can land file by file with no flag day.
- **Deliberately left dark** (user's call): the prompt banner, ShimmerBar
  CTAs (READY UP / SUBMIT / PLAY THIS SNAPPLE) and BackChunk. They carry
  their own gradient fills and read fine on either background.
- **Also left white on purpose**: overlay text on video (duration badge,
  play button, @username on a card). Those sit over video with a dark
  scrim, not over the app background.
- **Converted**: WarmupPhase, PickingPhase, HandCardThumbnail,
  RoundHeaderBar, PhaseChips.
- **NOT converted — the visible gap**: `GameScreen.jsx` (24 hardcoded
  literals) renders VOTING / SCORING / ROUND_RESULTS directly, so toggling
  to light gives light warmup+picking and dark voting+results mid-game.
  That inconsistency is the next thing to close.
- **Then**: LobbyPhase, LoadingPhase, FinalResultsPhase, the overlays, and
  eventually the other ~76 app files (~244 hardcoded literals total).
- **Watch for**: vibeGreen #00FF41 and vibeCyan #00FFFF have little
  contrast on a light surface. Fine as borders/fills, thin as text. If it
  bites, darken only the accents used as text.

### screen: GameScreen — hand as a horizontal rail (warmup + picking)
- **Status**: BUILT, NOT TESTED ON DEVICE
- **What**: the 2-col grid put 4-6 small cards on screen; the hand is now
  a horizontal rail showing 2 big ones, the rest a swipe away. The
  prompt banner is pinned instead of scrolling away with the cards —
  previously you could be choosing a card with the thing you're
  answering off-screen.
- **New**: `src/components/game/round/HandCardRail.jsx` — dumb layout
  shell (sizing + snap), caller supplies the card via `renderCard`, so
  picking keeps selection/mulligan and warmup keeps inline play.
- **Card shape**: `HandCardThumbnail` took an optional `aspect` prop,
  defaulting to the 4:5 it always used. The rail passes 9:16 — the shape
  snapples are actually recorded in, so a big card is mostly video
  rather than letterbox. Voting and results are untouched and still 4:5.
- **Sizing**: min of two constraints — two cards across, or 42% of
  screen height. Tall phones hit the width limit and get the intended
  2-up; short ones shrink slightly and show ~2.1 rather than clipping a
  card under the submit bar. Checked 375x667 through 430x932.
- **Net**: card area up ~31% (177x221 -> 170x302 on a 390pt screen).
- **Untested**: no device run. Worth checking the snap feel, that a
  1-card hand doesn't look broken, and the short-screen case.

### screen: SettingsScreen — one hub for account + app settings
- **Status**: BUILT, NOT TESTED ON DEVICE
- **Shipped**: `src/screens/SettingsScreen.jsx` +
  `src/components/ui/settings/SettingsRow.jsx` (switch / link / value
  row). Reached from Profile > Settings, which replaced the old
  Notification Settings button — notifications are now a row inside it.
  Registered in both the Profile stack and the root stack.
- **Live rows**: username (inline rename via `UsernameEditor` +
  `usernameService`), email (display only), SFX on/off (wired to
  `soundService.setEnabled`, closes out the "sound settings toggle"
  backlog item), Notifications link, version + OTA tag, Sign Out.

### helper built: username rename service
- **Status**: BUILT, NOT TESTED ON DEVICE
- **What**: `src/services/usernameService.js`. `changeUsername(userId, next)`
  validates via the existing `userService.validateUsername`, writes
  `username` (lowercased) + `displayName` on the user doc, updates the
  Firebase Auth displayName, then fans the new handle out in batched
  writes (400/batch) to `snapples` (creatorId), and `activePrompts` /
  `onDeckPrompts` / `promptPool` (createdBy).
- **Partial-failure behaviour**: the user doc write lands first and is
  never rolled back. A failed fan-out collection comes back in
  `staleCollections` and the screen says "Renamed, mostly" rather than
  claiming a clean success. Saving again retries.
- **Global state edit (logged per house rules)**: the user-doc
  `onSnapshot` in `src/store/AuthContext.js` now also syncs `username` /
  `displayName` onto `user`, so a rename shows up without a re-login.
  Both fall back to the previous value so an empty doc field can't blank
  a good name.
- **Known gap**: comments store `username` copied off the auth profile
  but carry no author id to query by, so existing comments keep the old
  name. New comments are correct immediately. Backfilling needs an
  author field added to comment docs first.
- **Untested**: no device run yet. Worth checking on a real account that
  (a) a taken handle is rejected, (b) an existing snapple's byline
  actually changes, (c) a capitalisation-only change is allowed.

### Android App Link verification
- **Status**: BLOCKED on a fingerprint only I cannot read
- **What**: `public/.well-known/assetlinks.json` on bigvibestudios.com does
  not list this app, so Android will not auto-open shared links — they
  fall through to the web page. iOS is already configured.
- **Needed**: the SHA-256 signing fingerprint, from
  Play Console > Test and release > Setup > App integrity >
  App signing key certificate. Add a second entry alongside the existing
  `com.bigvibestudios.bvs` one:

  ```json
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.bigvibestudios.snappled",
      "sha256_cert_fingerprints": ["<SHA-256 from Play Console>"]
    }
  }
  ```

  Include the EAS upload-key fingerprint too (`eas credentials`,
  interactive) if direct APK downloads should verify as well.
- **No rebuild needed** — this is server-side.

### Deploy the website share page + OG renderer
- **Status**: WRITTEN AND TESTED, NOT DEPLOYED
- **What**: `bvs-web/functions/` (new codebase) serves `/snappled/s/**`
  with per-snapple Open Graph tags, so Facebook / WhatsApp / iMessage /
  Discord unfurl a real thumbnail instead of a generic card. Crawlers do
  not run JS, which is why this cannot be a static page.
- **To ship**:
  `cd c:\devvs-webunctions && npm install`, then
  `firebase deploy --only functions:snappleShare,hosting`.
- **Note**: that repo has a lot of unrelated uncommitted work, and a
  hosting deploy pushes all of it live. Review its `git status` first.
- **Note**: this puts a Blaze-billed function in front of share links for
  the first time. Responses set `s-maxage=3600` so the Hosting CDN
  absorbs repeat crawler hits.
- **Missing**: no branded fallback OG image exists (`public/assets/` has
  only `site.css`). Snapples whose render has not finished unfurl with no
  image at all. Add one and set `FALLBACK_IMAGE` in
  `bvs-web/functions/index.js`.

### Install the production build (sounds + sharing are waiting on it)
- **Status**: BUILT AND FINISHED — not installed
- **Correction**: this entry used to say a new build was required. It
  isn't. `expo-audio ~55.0.18` and `expo-sharing ~55.0.24` are both in
  `package.json` at the commits that were built, so the native side
  already shipped:
  - Android, production, commit `215da17`, 2026-08-25 — build
    `f1395e2d-af1b-48cc-a5da-7cb38474f403`
  - iOS, production, commit `378db21`, 2026-08-26 — build
    `df18d2b5-9975-4046-b4aa-3f3895e3d820`
- **The catch**: both are store bundles (`.aab` / `.ipa`), not
  sideloadable. Installing means the Play internal-testing track or
  TestFlight. For a directly installable APK, run
  `eas build -p android --profile preview` (that profile is
  `distribution: internal`). A preview Android build was started on
  08-26 and canceled.
- **Once installed**: game SFX and file-attached sharing come alive, and
  every OTA since rides on top — the runtime version is still 1.0.1, so
  today's update (Android `01a05a0b-65b6-7614-bcca-8b6de9db5436`)
  applies to it unchanged.

## Watch List

Not scheduled work — known soft spots to re-check if symptoms show up.

### ⏳ Node 20 runtime is being decommissioned 2026-10-30
- **Status**: HARD DEADLINE, ~2 months out
- **What**: every Cloud Function runs Node.js 20 (1st Gen). It was
  deprecated 2026-04-30; after 2026-10-30 Firebase will refuse the
  deploy entirely. Existing functions keep running, but you lose the
  ability to ship a fix.
- **Also flagged in the same deploy**: `firebase-functions` is on 4.9.0.
  Anything >=5.1.0 is needed for current Extensions features, and the
  upgrade has breaking changes — so this is a real task, not a version
  bump.
- **Do it before**: the next time a function change is urgent. Finding
  this out during an incident would be the bad version.

### 📱 Server-side video transcode
- **Status**: NOT PLANNED (client-side compression covers it for now)
- **Context**: Original concern was iOS/Android codec mismatch on playback.
  `src/services/videoCompression.js` now runs every upload through
  react-native-compressor (native ffmpeg), capped at 720p, which normalizes
  both platforms to the same H.264/MP4 before it ever reaches Storage.
- **Revisit if**: playback failures appear on specific devices, or the feed
  needs multiple quality tiers for slow connections. Only then is a
  Cloud Function transcode worth the cost — YAGNI until it bites.

---

## Notes
- Check this file before starting new tasks.
- Delete an entry when it ships; don't leave COMPLETED blocks behind.
- New feature ideas go in BACKLOG.md until they're actually started.
- Use consistent date format: YYYY-MM-DD.

## Lessons Learned
- **expo-camera gotcha**: Always use `mode="video"` for video recording.
- **Race conditions**: Use guard refs to prevent double-stop issues.
- **stopRecording**: Returns void, don't await it.
- **expo-av deprecated**: Use expo-video for video playback.
- **SafeAreaProvider**: Must stay mounted at the App.js root — removing it
  makes insets go stale after any modal (camera) pops, silently breaking
  the resource bar.
- **Global-fetch-then-filter doesn't scale**: fetching the newest N docs and
  filtering client-side breaks once the collection outgrows N. Query by the
  field you're filtering on instead.
