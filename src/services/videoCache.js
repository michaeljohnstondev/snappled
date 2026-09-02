import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

// Local cache for video downloads. Each unique URL is downloaded once per
// install and stored under FileSystem.cacheDirectory. Players reference the
// local URI so subsequent renders (pick → vote → reveal) don't re-download.
//
// Design:
//   prefetchVideo(url) — kicks off a download. Idempotent. Returns Promise<localUri>.
//   getCachedUriSync(url) — synchronous best-effort lookup. Returns local
//     URI if cached, otherwise the original remote URL (which still plays,
//     just without the cache speedup).
//   useCachedVideoUri(url) — hook. Returns local URI once cached, remote
//     URL while pending. Re-renders when the cache lands.
//   pruneCache() — enforces a size budget. See EVICTION below.
//
// EVICTION
// The cache had no ceiling: every video a user ever watched accumulated
// and nothing removed it. The only thing keeping that survivable was the
// OS reclaiming cacheDirectory under storage pressure, which is the
// system cleaning up after us rather than a design.
//
// Now a budget is enforced after each download. Eviction is oldest-file-
// first by modification time, which is FIFO rather than true LRU — a real
// LRU needs an access index persisted across launches, and the payoff
// doesn't justify it here: evicting a video the user still wants costs
// one re-download, not correctness.

const CACHE_DIR = `${FileSystem.cacheDirectory}snapples/`;

// Ceiling for the whole cache. 400MB holds well over a hundred short
// clips, so a normal session never touches it; it only catches the
// long-tail accumulation that had no bound at all before.
const CACHE_BUDGET_BYTES = 400 * 1024 * 1024;
// Prune down to this once over budget, so we're not re-pruning on every
// single download once the cache is full.
const PRUNE_TARGET_BYTES = 320 * 1024 * 1024;
// In-memory map of URL → local URI (resolved cache hits)
const cached = new Map();
// In-memory map of URL → in-flight download Promise (de-dupes concurrent calls)
const inFlight = new Map();
// Subscribers per URL so the hook can refresh when a download finishes.
const listeners = new Map();

let dirEnsured = false;
async function ensureCacheDir() {
  if (dirEnsured) return;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  } catch (e) {}
  dirEnsured = true;
}

function urlToFilename(url) {
  // Stable hash so the same URL always maps to the same file.
  let h = 0;
  for (let i = 0; i < url.length; i++) h = ((h << 5) - h) + url.charCodeAt(i);
  return `v_${Math.abs(h)}.mp4`;
}

function notify(url, localUri) {
  const subs = listeners.get(url);
  if (subs) subs.forEach(fn => fn(localUri));
}

// Guard so concurrent downloads don't all kick off their own sweep.
let pruning = false;

/**
 * Delete oldest files until the cache is under PRUNE_TARGET_BYTES.
 * Best-effort and non-blocking: a failure here must never break playback,
 * so every step swallows its own errors.
 */
export async function pruneCache() {
  if (pruning) return;
  pruning = true;
  try {
    await ensureCacheDir();
    const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
    const files = [];
    let total = 0;
    for (const name of names) {
      const uri = `${CACHE_DIR}${name}`;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) continue;
        const size = info.size || 0;
        total += size;
        files.push({ uri, size, mtime: info.modificationTime || 0 });
      } catch (e) { /* skip unreadable entry */ }
    }
    if (total <= CACHE_BUDGET_BYTES) return;

    // Oldest first, deleting until under target.
    files.sort((a, b) => a.mtime - b.mtime);
    // Reverse-index the in-memory map once so evicted URLs can be
    // unregistered — leaving them mapped would hand players a local URI
    // whose file no longer exists.
    const uriToUrl = new Map();
    cached.forEach((localUri, u) => uriToUrl.set(localUri, u));

    for (const f of files) {
      if (total <= PRUNE_TARGET_BYTES) break;
      try {
        await FileSystem.deleteAsync(f.uri, { idempotent: true });
        total -= f.size;
        const url = uriToUrl.get(f.uri);
        if (url) {
          cached.delete(url);
          notify(url, url); // subscribers fall back to the remote URL
        }
      } catch (e) { /* leave it; next sweep retries */ }
    }
  } catch (e) {
    // Pruning is maintenance. Never let it surface.
  } finally {
    pruning = false;
  }
}

export async function prefetchVideo(url) {
  if (!url) return null;
  if (cached.has(url)) return cached.get(url);
  if (inFlight.has(url)) return inFlight.get(url);

  // Set inFlight BEFORE the first await so concurrent callers dedupe
  // to a single download. Previous code awaited ensureCacheDir() first,
  // which let a second call slip through and clobber the write.
  const promise = (async () => {
    await ensureCacheDir();
    const localUri = `${CACHE_DIR}${urlToFilename(url)}`;

    // If the file exists from a previous session, register and bail.
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists && info.size > 0) {
        cached.set(url, localUri);
        notify(url, localUri);
        return localUri;
      }
    } catch (e) { /* fall through to download */ }

    try {
      const res = await FileSystem.downloadAsync(url, localUri);
      cached.set(url, res.uri);
      notify(url, res.uri);
      // Fire-and-forget: the caller is waiting on a video, not on
      // housekeeping.
      pruneCache();
      return res.uri;
    } catch (err) {
      // Silent fallback to remote URL — video still streams, just no
      // cache speedup. Don't set `cached` so a later attempt can retry.
      return url;
    }
  })().finally(() => inFlight.delete(url));

  inFlight.set(url, promise);
  return promise;
}

// Force-drop a URL from the cache and delete its file. Called by the
// player when a "cached" file fails to open (corrupt download, missing
// codec, etc.) so the next play attempt refetches from the network.
export async function invalidateCachedVideo(url) {
  if (!url) return;
  cached.delete(url);
  inFlight.delete(url);
  try {
    const localUri = `${CACHE_DIR}${urlToFilename(url)}`;
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (e) { /* non-fatal */ }
  notify(url, url); // hand subscribers the remote URL as a fallback
}

export function getCachedUriSync(url) {
  if (!url) return url;
  return cached.get(url) || url;
}

// Hook: returns local URI when cached, remote URL while pending. Subscribes to
// the cache so the player swaps to local once the download finishes.
export function useCachedVideoUri(url) {
  const [uri, setUri] = useState(() => getCachedUriSync(url));

  useEffect(() => {
    if (!url) return;
    setUri(getCachedUriSync(url));
    // Subscribe in case a download is in progress.
    const subs = listeners.get(url) || new Set();
    const fn = (localUri) => setUri(localUri);
    subs.add(fn);
    listeners.set(url, subs);
    // Kick off prefetch (idempotent).
    prefetchVideo(url);
    return () => {
      subs.delete(fn);
      if (subs.size === 0) listeners.delete(url);
    };
  }, [url]);

  return uri;
}
