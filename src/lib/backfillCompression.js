// backfillCompression.js
// One-shot admin utility: walk the snapples collection, download each
// video, run it through the same native compression pipeline that
// new uploads now use, and replace the Firebase Storage object +
// snapple.videoUrl in place. Safe to run repeatedly — files under the
// compressor's skip threshold are left alone.
//
// Runs on the admin's phone (uses the client Firestore SDK and the
// device's ffmpeg), so it's slow (~10-30s per snapple depending on
// size + network). Intended as a one-time cleanup, not a nightly
// job. If we outgrow this, port to a Cloud Function with ffmpeg.

import { collection, doc, getDocs, limit, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { uploadRawToStorage } from '../services/videoStorage';
import { compressVideo } from '../services/videoCompression';

// Cap per run. Users can tap the admin button again to keep going.
// Prevents a single tap from locking the app up for hours on a
// large collection.
const BATCH_LIMIT = 50;

/**
 * downloadToTemp — pull a Firebase Storage download URL into the
 * app's document directory and return the local file:// path.
 * Used so compressVideo (which needs a local file) can operate.
 */
async function downloadToTemp(videoUrl, tag) {
  const LegacyFS = require('expo-file-system/legacy');
  const dir = `${LegacyFS.documentDirectory}backfill/`;
  await LegacyFS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${tag}.mp4`;
  const res = await LegacyFS.downloadAsync(videoUrl, dest);
  return res.uri;
}

/**
 * cleanupTempDir — wipe the backfill scratch dir once we're done.
 * Compressed and downloaded originals both live here; keeping them
 * around wastes device storage.
 */
async function cleanupTempDir() {
  try {
    const LegacyFS = require('expo-file-system/legacy');
    const dir = `${LegacyFS.documentDirectory}backfill/`;
    await LegacyFS.deleteAsync(dir, { idempotent: true });
  } catch (e) { /* non-fatal */ }
}

/**
 * backfillCompression — main entry point. Iterates snapples,
 * compresses each, and replaces the Storage file + updates the
 * snapple doc's videoUrl / filename / fileSize. Calls `onProgress`
 * with per-item and cumulative counters so the admin UI can render
 * a running status.
 *
 * @param {(stats: { current, total, snappleId, phase }) => void} onProgress
 * @returns {Promise<{ examined: number, compressed: number, skipped: number, failed: number, savedBytes: number }>}
 */
export async function backfillCompression(onProgress) {
  const snap = await getDocs(query(collection(db, 'snapples'), limit(BATCH_LIMIT)));

  let examined = 0, compressed = 0, skipped = 0, failed = 0, savedBytes = 0;
  const total = snap.size;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    examined++;

    if (!data.videoUrl || !data.creatorId) {
      skipped++;
      onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: 'skipped (no video)' });
      continue;
    }

    try {
      onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: 'downloading' });
      const localUri = await downloadToTemp(data.videoUrl, docSnap.id);

      onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: 'compressing' });
      const result = await compressVideo(localUri);
      if (result.skipped || result.ratio >= 0.95) {
        // Nothing meaningful to gain — leave the snapple alone.
        skipped++;
        onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: 'skipped (already small)' });
        continue;
      }

      // Upload to a NEW path so we never overwrite the original
      // mid-flight. Old file is left in Storage (small cost, safe
      // rollback path if the update goes sideways). If needed a
      // second admin utility can prune orphans later.
      const timestamp = Date.now();
      const newFilename = `videos/${data.creatorId}/${timestamp}-compressed.mp4`;
      onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: 'uploading' });
      const uploaded = await uploadRawToStorage(result.uri, newFilename);

      await updateDoc(doc(db, 'snapples', docSnap.id), {
        videoUrl: uploaded.downloadURL,
        filename: newFilename,
        fileSize: result.compressedSize,
        updatedAt: serverTimestamp(),
      });

      savedBytes += (result.originalSize - result.compressedSize);
      compressed++;
      onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: 'done' });
    } catch (e) {
      console.error('[backfillCompression] snapple failed', docSnap.id, e);
      failed++;
      onProgress?.({ current: examined, total, snappleId: docSnap.id, phase: `failed: ${e.message}` });
    }
  }

  await cleanupTempDir();
  return { examined, compressed, skipped, failed, savedBytes };
}
