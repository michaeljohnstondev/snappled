// videoCompression.js
// Video compression pass that runs BEFORE upload to Firebase Storage.
// Cuts file size ~40-60% with imperceptible quality loss so cell uploads
// finish faster and downstream game/vote downloads are lighter for
// everyone else.
//
// Uses react-native-compressor's Video.compress (native ffmpeg wrapper).
// Native — requires a fresh EAS build; won't work in Expo Go.

import { Platform } from 'react-native';
import { Video } from 'react-native-compressor';

// Skip compression for files under this threshold — the CPU cost
// isn't worth it, and short clips are already small.
const SKIP_UNDER_BYTES = 3 * 1024 * 1024; // 3 MB

// Cap the vertical dimension so we never re-encode above 720p. Snapples
// display in small tiles + fullscreen previews on phones — 720p is
// plenty. Higher captured resolutions get downsampled here.
const MAX_HEIGHT = 720;

/**
 * compressVideo — take a local file:// URI, produce a compressed copy,
 * return the new URI plus size stats. Safe to call on any recording;
 * short/small files are returned unchanged.
 *
 * @param {string} sourceUri - Local file:// URI of the input video
 * @param {(pct: number) => void} onProgress - 0-100 compression progress
 * @returns {Promise<{ uri: string, originalSize: number, compressedSize: number, ratio: number, skipped: boolean }>}
 */
export async function compressVideo(sourceUri, onProgress) {
  if (!sourceUri) throw new Error('compressVideo: missing sourceUri');

  const LegacyFS = require('expo-file-system/legacy');
  const info = await LegacyFS.getInfoAsync(sourceUri);
  if (!info.exists) throw new Error('compressVideo: source file missing');

  const originalSize = info.size || 0;

  // Skip compression on already-small files. Return the source URI
  // so the upload path is identical whether we compressed or not.
  if (originalSize > 0 && originalSize < SKIP_UNDER_BYTES) {
    if (onProgress) onProgress(100);
    return {
      uri: sourceUri,
      originalSize,
      compressedSize: originalSize,
      ratio: 1,
      skipped: true,
    };
  }

  console.log('[videoCompression] compressing', {
    sourceUri,
    originalMB: (originalSize / 1024 / 1024).toFixed(2),
    platform: Platform.OS,
  });

  // 'auto' picks bitrate/resolution based on source. maxSize caps the
  // largest dimension. minimumFileSizeForCompress guards against
  // double-work if the library decides the file's already tiny.
  const compressedUri = await Video.compress(
    sourceUri,
    {
      compressionMethod: 'auto',
      maxSize: MAX_HEIGHT,
      minimumFileSizeForCompress: 3, // MB — matches SKIP_UNDER_BYTES
    },
    (pct) => {
      // react-native-compressor emits 0..1 float progress
      if (onProgress) onProgress(Math.round((pct || 0) * 100));
    },
  );

  const outInfo = await LegacyFS.getInfoAsync(compressedUri);
  const compressedSize = outInfo.size || 0;
  const ratio = originalSize > 0 ? compressedSize / originalSize : 1;

  console.log('[videoCompression] done', {
    compressedUri,
    originalMB: (originalSize / 1024 / 1024).toFixed(2),
    compressedMB: (compressedSize / 1024 / 1024).toFixed(2),
    savedPct: originalSize > 0 ? Math.round((1 - ratio) * 100) : 0,
  });

  return {
    uri: compressedUri,
    originalSize,
    compressedSize,
    ratio,
    skipped: false,
  };
}
