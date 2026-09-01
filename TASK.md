# Task List — Snappled

Live working doc. Shipped work lives in git history, not here — an entry
leaves this file the moment it lands. Unstarted feature ideas live in
BACKLOG.md; this file is only what's actively being worked.

Last pruned: 2026-08-25

## Active Tasks

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

### Deploy the share-overlay Cloud Function
- **Status**: BUILT, NOT DEPLOYED
- **What**: `renderShareVideo` in `functions/shareRender.js` burns the prompt
  and a SNAPPLED watermark into a snapple, caches the result to
  `shared/{snappleId}.mp4`, and writes `sharedVideoUrl` back to the doc.
- **To ship**: `cd functions && npm install` then
  `firebase deploy --only functions:renderShareVideo`.
  `ffmpeg-static` fetches a platform-specific binary at install time — the
  local copy here is the Windows build, the deploy container pulls Linux.
- **Verified locally**: filter chain rendered against a 1080x1920 source
  with a prompt containing an apostrophe, a colon and a `%`. Client falls
  back to the un-overlaid clip if the call fails or exceeds 12s, so
  sharing keeps working until this lands.
- **Cost note**: 2GB / 300s per render, once per snapple. Watch the
  Functions bill if sharing gets popular.

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
