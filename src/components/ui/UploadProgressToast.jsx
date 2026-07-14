// UploadProgressToast — floating pill above the tab bar that surfaces
// the state of any in-flight snapple uploads. Aggregates multi-item
// queues into a single line, and renders a red retry chip per failed
// item. Auto-dismisses items ~2s after they complete.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUploadQueue, UPLOAD_STATUS } from '../../store/UploadQueueContext';
import theme from '../../theme/themes';

const AUTO_DISMISS_MS = 2000;

// averageActiveProgress — average pct across all active items (any
// non-terminal, non-staging status). Ignores DONE/FAILED/STAGING
// because those get their own visual treatment.
function averageActiveProgress(items) {
  const active = items.filter(
    (i) => i.status === UPLOAD_STATUS.UPLOADING || i.status === UPLOAD_STATUS.FINALIZING,
  );
  if (!active.length) return 0;
  const sum = active.reduce((acc, i) => acc + (i.progress || 0), 0);
  return Math.round(sum / active.length);
}

// truncate — clip long error messages so the failed chip doesn't
// blow up to full-screen height on a giant Firebase stack.
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

export default function UploadProgressToast() {
  const { items, retryUpload, dismissUpload } = useUploadQueue();

  // Auto-dismiss any DONE items after AUTO_DISMISS_MS. Failed items
  // stick around until the user taps X or retries — losing a failed
  // upload silently would be worse than a persistent red chip.
  useEffect(() => {
    const timers = items
      .filter((i) => i.status === UPLOAD_STATUS.DONE)
      .map((i) => setTimeout(() => dismissUpload(i.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [items, dismissUpload]);

  if (items.length === 0) return null;

  const failed = items.filter((i) => i.status === UPLOAD_STATUS.FAILED);
  const active = items.filter(
    (i) => i.status === UPLOAD_STATUS.UPLOADING || i.status === UPLOAD_STATUS.FINALIZING,
  );
  const staging = items.filter((i) => i.status === UPLOAD_STATUS.STAGING);
  const done = items.filter((i) => i.status === UPLOAD_STATUS.DONE);

  const avgPct = averageActiveProgress(items);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Failed items each get their own red retry chip so the user
          can retry one at a time (or dismiss). */}
      {failed.map((item) => (
        <View key={item.id} style={styles.failedChip}>
          <Ionicons name="alert-circle" size={18} color="#fff" />
          <View style={styles.failedTextWrap}>
            <Text style={styles.failedText} numberOfLines={1}>
              Upload failed
            </Text>
            {item.error ? (
              <Text style={styles.failedDetail} numberOfLines={2}>
                {truncate(item.error, 90)}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={styles.retryBtn}
            onPress={() => retryUpload(item.id)}
            hitSlop={8}
          >
            <Text style={styles.retryText}>RETRY</Text>
          </Pressable>
          <Pressable
            style={styles.dismissBtn}
            onPress={() => dismissUpload(item.id)}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
      ))}

      {/* Single aggregated pill for staging + active + just-done uploads. */}
      {(active.length > 0 || staging.length > 0 || done.length > 0) && (
        <View style={styles.pill}>
          {staging.length > 0 && active.length === 0 ? (
            <>
              <View style={styles.spinnerDot} />
              <Text style={styles.pillText} numberOfLines={1}>
                Preparing snapple…
              </Text>
            </>
          ) : active.length > 0 ? (
            <>
              <View style={styles.spinnerDot} />
              <Text style={styles.pillText} numberOfLines={1}>
                {active.length > 1
                  ? `Uploading ${active.length} snapples… ${avgPct}%`
                  : `Uploading… ${avgPct}%`}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${avgPct}%` }]} />
              </View>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.vibeGreen} />
              <Text style={styles.pillText} numberOfLines={1}>
                {done.length > 1 ? `${done.length} snapples uploaded` : 'Snapple uploaded'}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchored just above the tab bar. AppLayout sits inside the tab
  // navigator's screen area so bottom: 12 is the gap between the
  // pill and the top of the tab bar.
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 8,
    zIndex: 999,
    elevation: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
  spinnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.vibeBlue,
  },
  pillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  progressTrack: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.vibeBlue,
  },
  failedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.vibeRed,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: '#fff',
  },
  failedTextWrap: {
    flex: 1,
  },
  failedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  failedDetail: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  retryBtn: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
