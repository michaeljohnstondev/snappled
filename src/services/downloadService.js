// downloadService.js — saving your own snapple to your camera roll.
//
// Your videos are yours, and an app that holds the only copy of
// something you made is holding it hostage. This is the way out.
//
// WHY ONLY YOUR OWN
//
// The ownership check here is not a nicety, it is the whole design.
// Three separate things break the moment anyone can save anyone's
// snapple:
//
//   1. It is somebody's face. A save button on another person's video
//      is a supported, one-tap way to take a copy of a stranger out of
//      the app and keep it forever. Screen recording exists, but there
//      is a real difference between a thing being possible and the app
//      handing you the button.
//
//   2. It breaks the deletion promise. Account deletion erases the
//      videos - that guarantee is worth nothing if the clip is already
//      sitting in fifty camera rolls.
//
//   3. It undercuts the economy. Nobody spends coins on a card they
//      could have saved for free.
//
// So the check lives HERE, in the service, as well as in whether the
// button is drawn. A hidden button is not a rule.

import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import {
  isVideoCached, getCachedUriSync, prefetchVideo,
} from './videoCache';

/**
 * Save a snapple to the device's photo library.
 *
 * Reuses the video cache rather than downloading again: anything you
 * have watched is already on disk, so saving your own snapple from your
 * own profile is usually a file copy with no network at all.
 *
 * @param {object} snapple  needs id, videoUrl and creatorId
 * @param {string} userId   whoever is asking
 */
export async function saveSnappleToLibrary(snapple, userId) {
  const url = snapple?.videoUrl;
  if (!url) return { success: false, error: 'That snapple has no video.' };

  // The rule, not the button. See the header.
  if (!userId || snapple.creatorId !== userId) {
    return { success: false, error: 'You can only save your own snapples.' };
  }

  try {
    // writeOnly: true asks for permission to ADD to the library and
    // nothing else. The full grant would let the app read every photo
    // on the phone, which it has no business seeing to save one video -
    // and it is a far bigger thing to ask somebody to agree to.
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      return {
        success: false,
        denied: true,
        error: 'Snappled needs permission to save to your photos.',
      };
    }

    let localUri = isVideoCached(url) ? getCachedUriSync(url) : null;
    let temporary = null;

    if (!localUri) {
      // Populate the cache rather than downloading to one side of it.
      // The file is wanted on disk either way, and next playback gets
      // it for free.
      //
      // Its own try: prefetch throws on a stalled transfer, and a
      // failure to CACHE is not a reason to refuse to SAVE - the direct
      // download below is a perfectly good second attempt.
      try {
        localUri = await prefetchVideo(url);
      } catch (e) {
        localUri = null;
      }
    }

    // prefetch falls back to the remote URL when it cannot cache, and
    // the media library needs a real file.
    if (!localUri || !localUri.startsWith('file://')) {
      temporary = `${FileSystem.cacheDirectory}snappled-${snapple.id}.mp4`;
      const res = await FileSystem.downloadAsync(url, temporary);
      // downloadAsync resolves on a 404 - it writes the error body to
      // the file and reports success. Same trap videoCache documents.
      if (!res || res.status !== 200) {
        await FileSystem.deleteAsync(temporary, { idempotent: true });
        return { success: false, error: 'Could not download that video.' };
      }
      localUri = res.uri;
    }

    await MediaLibrary.saveToLibraryAsync(localUri);

    // Only ever the temp copy. Deleting the cached file would make the
    // next playback re-download something already on the phone.
    if (temporary) {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
    }

    return { success: true };
  } catch (error) {
    console.error('[DownloadService] save failed:', error);
    return { success: false, error: 'Could not save that video.' };
  }
}
