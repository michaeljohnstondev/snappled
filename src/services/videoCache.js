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

const CACHE_DIR = `${FileSystem.cacheDirectory}snapples/`;
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

export async function prefetchVideo(url) {
  if (!url) return null;
  if (cached.has(url)) return cached.get(url);
  if (inFlight.has(url)) return inFlight.get(url);

  await ensureCacheDir();
  const localUri = `${CACHE_DIR}${urlToFilename(url)}`;

  // If the file already exists from a previous session, register and bail.
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && info.size > 0) {
      cached.set(url, localUri);
      notify(url, localUri);
      return localUri;
    }
  } catch (e) {}

  const promise = FileSystem.downloadAsync(url, localUri)
    .then(res => {
      cached.set(url, res.uri);
      inFlight.delete(url);
      notify(url, res.uri);
      return res.uri;
    })
    .catch(err => {
      inFlight.delete(url);
      // Silent fallback to remote URL — no error log spam.
      return url;
    });

  inFlight.set(url, promise);
  return promise;
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
