# Task List — Snappled

Live working doc. Shipped work lives in git history, not here — an entry
leaves this file the moment it lands. Unstarted feature ideas live in
BACKLOG.md; this file is only what's actively being worked.

Last pruned: 2026-08-25

## Active Tasks

### Light theme — full app rollout
- **Status**: ALL SCREENS CONVERTED, NOT TESTED ON DEVICE
- **Approach**: not tracker's semantic light palette (rejected). Inverts
  background + text; every vibe* accent hue is untouched.
- **Infra**: `theme/themes.js` exports darkTheme / lightTheme / themes;
  `theme/ThemeContext.js` (dark/light/system, AsyncStorage,
  `useThemedStyles` factory cache) ported from tracker. Provider in
  App.js, toggle in Settings.
- **Coverage**: 90 files moved from module-scope `StyleSheet.create` to
  `useThemedStyles` factories.
- **Deliberately NOT themed** — each keeps its own surface, so text on it
  has to stay light:
  - RoundPromptBanner, ShimmerBar CTAs, BackChunk (user's call)
  - RoundHeaderBar + PhaseChips — dark slab in both themes; the active
    chip is a solid cyan fill and themed text on it was unreadable
  - Card overlay text (duration, play button, @username) — sits on video
  - GameScreen scoringStyles / adminGameStyles, CountdownOverlay — all on
    rgba(0,0,0,.) scrims
  - VibeTimePicker — dark-only on purpose: its sub-components are
    implicit-return arrows (`=> (`) that can't take a hook without being
    restructured, not worth the risk for a time picker
- **Verified**: eslint no-undef clean across src (that rule is what
  catches a `t`/`styles` reference outside its component — a runtime
  white-screen that linting styles alone won't show), and Metro bundles
  (1438 modules).
- **NOT verified**: nothing looked at on a device. Residual risk from the
  scripted pass is themed text on a surface that doesn't follow the
  theme; a scan for that pattern found none, but it only catches shapes
  it knows about.
- **Watch for**: vibeGreen #00FF41 / vibeCyan #00FFFF have little
  contrast on light. Fine as borders and fills, thin as text.

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
