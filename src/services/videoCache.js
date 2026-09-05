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
      // createDownloadResumable instead of downloadAsync purely for the
      // progress callback. Same request, same result - downloadAsync
      // simply gives no way to see how far along it is.
      setProgress(url, 0);
      const task = FileSystem.createDownloadResumable(
        url, localUri, {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(url, totalBytesWritten / totalBytesExpectedToWrite);
          }
        },
      );
      // Take a slot only around the transfer itself.
      await acquireSlot();
      let res;
      try {
        res = await task.downloadAsync();
      } finally {
        // Release before any throw below, or a failing download would
        // hold its slot forever and wedge the queue after three of them.
        releaseSlot();
      }
      if (!res) throw new Error('download produced no result');

      // downloadAsync RESOLVES on a 404 or 500 - it just writes the
      // error body to the file. Without this check a Storage error page
      // was cached as though it were the video, and every later play
      // read that file happily and showed nothing.
      if (res.status && (res.status < 200 || res.status >= 300)) {
        try {
          await FileSystem.deleteAsync(localUri, { idempotent: true });
        } catch (e) { /* nothing to clean up */ }
        recordError(url, `HTTP ${res.status}`);
        notify(url, url);
        return url;
      }

      lastErrors.delete(url);
      setProgress(url, 1);
      cached.set(url, res.uri);
      notify(url, res.uri);
      // Fire-and-forget: the caller is waiting on a video, not on
      // housekeeping.
      pruneCache();
      return res.uri;
    } catch (err) {
      // Silent fallback to remote URL — video still streams, just no
      // cache speedup. Don't set `cached` so a later attempt can retry.
      recordError(url, err?.message || String(err) || 'unknown error');
      notify(url, url);
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

/**
 * Is this url actually on disk?
 *
 * prefetchVideo RESOLVES with the remote url when a download fails
 * rather than rejecting, so "the promise settled" says nothing about
 * whether anything was downloaded. Callers that need the truth - the
 * loading screen deciding whether a card is ready - have to ask this
 * instead, or they report success for files that were never fetched.
 */
// Why the last prefetch of a url failed. Kept because the failure was
// otherwise swallowed entirely - prefetchVideo resolves either way, so
// "it didn't download" arrived with no cause attached and there was
// nothing to debug from. Bounded to the most recent handful; this is a
// diagnostic, not a log.
// Bytes-so-far per url, 0..1. downloadAsync reports nothing, so the
// download was a black box - there was no way to tell "slow" from
// "stalled", which is most of what you want to know off wifi.
// Cap parallel downloads. Six clips at once on cellular starved each
// other badly enough that none of them finished - each got a sliver of
// the connection and the whole hand timed out together. Three at a time
// finish in sequence instead, which is both faster overall and gives
// visible progress rather than six stalled bars.
const MAX_PARALLEL_DOWNLOADS = 3;
let activeDownloads = 0;
const downloadQueue = [];

function acquireSlot() {
  if (activeDownloads < MAX_PARALLEL_DOWNLOADS) {
    activeDownloads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => downloadQueue.push(resolve));
}

function releaseSlot() {
  const next = downloadQueue.shift();
  if (next) next();
  else activeDownloads--;
}

const progress = new Map();
const progressListeners = new Map();

function setProgress(url, value) {
  progress.set(url, value);
  const subs = progressListeners.get(url);
  if (subs) subs.forEach((fn) => { try { fn(value); } catch (e) {} });
}

/** Download progress for `url`, 0..1, or 0 if nothing has started. */
export function getDownloadProgress(url) {
  return (url && progress.get(url)) || 0;
}

/** Subscribe to progress for `url`. Returns an unsubscribe function. */
export function onDownloadProgress(url, fn) {
  const subs = progressListeners.get(url) || new Set();
  subs.add(fn);
  progressListeners.set(url, subs);
  return () => {
    subs.delete(fn);
    if (subs.size === 0) progressListeners.delete(url);
  };
}

const lastErrors = new Map();
const MAX_ERRORS = 20;

function recordError(url, reason) {
  if (lastErrors.size >= MAX_ERRORS) {
    lastErrors.delete(lastErrors.keys().next().value);
  }
  lastErrors.set(url, reason);
}

/** Reason the last prefetch of `url` failed, or null. */
export function getPrefetchError(url) {
  return (url && lastErrors.get(url)) || null;
}

export function isVideoCached(url) {
  return !!url && cached.has(url);
}

export function getCachedUriSync(url) {
  if (!url) return url;
  return cached.get(url) || url;
}

/**
 * Hook: the local URI once cached, otherwise the remote URL.
 *
 * @param {string} url
 * @param {number} [graceMs] wait this long for the download before
 *   falling back to the remote URL, returning null meanwhile so the
 *   caller can show a spinner.
 *
 *   Without a grace period an uncached clip does not fail - it streams,
 *   and on a weak connection that is the stutter people report as "it
 *   didn't play right". A clip is a few seconds long, so streaming one
 *   that is halfway downloaded is strictly worse than waiting a moment
 *   for the file. The fallback still exists: if the download has not
 *   landed by graceMs, stream rather than spin forever, because a
 *   stuttering clip beats no clip at all.
 */
/** Hook: live download progress for `url`, 0..1. */
export function useDownloadProgress(url) {
  const [pct, setPct] = useState(() => getDownloadProgress(url));
  useEffect(() => {
    if (!url) { setPct(0); return undefined; }
    setPct(getDownloadProgress(url));
    return onDownloadProgress(url, setPct);
  }, [url]);
  return pct;
}

export function useCachedVideoUri(url, graceMs = 0) {
  // graceMs === Infinity means never fall back: wait for the file,
  // however long it takes. Streaming a clip whose download is already
  // in flight competes with that download for the same connection, so
  // on a weak link it makes the thing it is trying to paper over worse.

  const [uri, setUri] = useState(() => {
    if (!url) return url;
    const hit = cached.get(url);
    return hit || (graceMs > 0 ? null : url);
  });

  useEffect(() => {
    if (!url) return;
    const hit = cached.get(url);
    setUri(hit || (graceMs > 0 ? null : url));

    // Stop holding out after the grace period, whatever the download is
    // doing. Cleared on unmount so a closed player can't strand a timer.
    let graceTimer = null;
    if (graceMs > 0 && graceMs !== Infinity && !hit) {
      graceTimer = setTimeout(() => setUri((cur) => cur || url), graceMs);
    }
    // Subscribe in case a download is in progress.
    const subs = listeners.get(url) || new Set();
    // A failed prefetch notifies with the REMOTE url as its fallback.
    // When streaming is disabled that must be ignored, or the very
    // failure we're waiting through would hand us the stream anyway.
    const fn = (localUri) => {
      if (graceMs === Infinity && localUri === url) return;
      setUri(localUri);
    };
    subs.add(fn);
    listeners.set(url, subs);
    // Kick off prefetch (idempotent).
    prefetchVideo(url);
    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      subs.delete(fn);
      if (subs.size === 0) listeners.delete(url);
    };
  }, [url, graceMs]);

  return uri;
}
