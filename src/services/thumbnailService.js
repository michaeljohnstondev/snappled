// thumbnailService.js
// Extracts and caches a still frame for a snapple's video URL using
// expo-video-thumbnails. Two-tier cache: in-memory Map for hot reuse,
// and a concurrency-limited queue so that mounting a grid of 10+ items
// doesn't fan out 10 parallel native thumbnail extractions (which is
// what was tanking the profile screen). Concurrent extractions are
// capped at MAX_PARALLEL; the rest queue up and run as slots free.

let VideoThumbnails = null;
try {
  VideoThumbnails = require('expo-video-thumbnails');
} catch (e) {
  // Native module not available (Expo Go or old dev build)
}

// Cap parallel native extractions. Empirical: 3 is enough to feel
// instant on a modern device without flooding the GPU/codec.
const MAX_PARALLEL = 3;

// videoUrl -> uri (resolved thumbnail). Empty string sentinel for
// "tried and failed" so we don't retry on every re-render.
const cache = new Map();
// videoUrl -> Promise (deduped in-flight extraction so two callers for
// the same URL share one underlying native call).
const inflight = new Map();

let activeCount = 0;
const queue = [];

// Pull the next pending extraction off the queue if a slot is free.
const drain = () => {
  while (activeCount < MAX_PARALLEL && queue.length > 0) {
    const next = queue.shift();
    activeCount++;
    next();
  }
};

// Run a single extraction, then release the slot and drain the queue.
const runExtraction = (videoUrl, resolve) => {
  VideoThumbnails.getThumbnailAsync(videoUrl, {
    time: 500,
    quality: 0.5,
  })
    .then(({ uri }) => {
      cache.set(videoUrl, uri);
      resolve(uri);
    })
    .catch(() => {
      // Failure sentinel: empty string in cache so subsequent calls
      // resolve null instantly instead of re-queueing a broken URL.
      cache.set(videoUrl, '');
      resolve(null);
    })
    .finally(() => {
      activeCount--;
      inflight.delete(videoUrl);
      drain();
    });
};

export const thumbnailService = {
  // Returns the cached or freshly-extracted thumbnail uri for a video
  // URL. Returns null if extraction is unavailable, failed, or the URL
  // is empty. Safe to call from N components at once for the same URL;
  // they share one underlying extraction.
  async getThumbnail(videoUrl) {
    if (!videoUrl || !VideoThumbnails) return null;

    if (cache.has(videoUrl)) {
      const cached = cache.get(videoUrl);
      return cached || null; // '' sentinel → null
    }

    if (inflight.has(videoUrl)) {
      return inflight.get(videoUrl);
    }

    const promise = new Promise((resolve) => {
      const task = () => runExtraction(videoUrl, resolve);
      if (activeCount < MAX_PARALLEL) {
        activeCount++;
        task();
      } else {
        queue.push(task);
      }
    });
    inflight.set(videoUrl, promise);
    return promise;
  },

  // Whether native video-thumbnail extraction is available on this
  // build (false in Expo Go or older dev clients without the module).
  isAvailable() {
    return VideoThumbnails !== null;
  },

  // Drop the in-memory cache. Call on logout or when video URLs may
  // have been rotated/replaced upstream.
  clearCache() {
    cache.clear();
    inflight.clear();
  },
};

export default thumbnailService;
