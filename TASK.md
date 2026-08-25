# Task List — Snappled

Live working doc. Shipped work lives in git history, not here — an entry
leaves this file the moment it lands. Unstarted feature ideas live in
BACKLOG.md; this file is only what's actively being worked.

Last pruned: 2026-08-25

## Active Tasks

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

### Deploy the website share page
- **Status**: WRITTEN, NOT DEPLOYED
- **What**: `bvs-web/public/snappled/s/index.html` plus a
  `/snappled/s/**` rewrite in that repo's `firebase.json`.
- **Not deployed because**: that working tree carries a lot of unrelated
  uncommitted work, and `firebase deploy --only hosting` would push all
  of it live. Review that repo's `git status` first.

### New EAS build required
- **Status**: PENDING
- **Why**: `expo-audio` and `expo-sharing` are native modules. Game sounds
  and file-attached sharing are both inert until a fresh build ships —
  neither rides an OTA update.

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
