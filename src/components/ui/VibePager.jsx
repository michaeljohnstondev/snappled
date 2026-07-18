// VibePager — reusable search-engine style pager. Renders numbered
// page pills with prev/next arrows and ellipsis for large ranges, so
// even a 200-page list stays compact on a phone screen.
//
// Punk theme: current page is a solid vibeBlue pill, others are hollow
// with a thin vibeBlue border, arrows sit inside dark chips. Whole
// row centers under whatever list it's paginating.
//
// Usage:
//   <VibePager
//     currentPage={page}          // 1-indexed
//     totalPages={totalPages}     // derived by caller
//     onPageChange={setPage}
//   />
//
// Renders null when totalPages <= 1 (nothing to page through).

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';

// Shared default page size — 6 fits a 3-column grid as 2 clean rows.
// Small enough that the whole page + pager fits comfortably on a phone
// screen without scrolling. Callers can pick their own if their grid
// has different dimensions, but import this by default so pagination
// feels consistent across the app.
export const DEFAULT_PAGE_SIZE = 6;

// Compact list of pages to display. For small counts (≤7) shows all.
// For larger, always shows first + last + a window around current,
// with '…' separators — same pattern Google / Amazon / etc. use.
// e.g., current=5 of 12 → [1, '…', 4, 5, 6, '…', 12]
function buildPageList(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push('…');
  pages.push(totalPages);
  return pages;
}

export default function VibePager({ currentPage, totalPages, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const pages = buildPageList(currentPage, totalPages);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <View style={styles.wrap}>
      <PagerChip
        icon="chevron-back"
        disabled={!canPrev}
        onPress={() => canPrev && onPageChange(currentPage - 1)}
      />
      {pages.map((p, i) =>
        p === '…' ? (
          <Text key={`ell-${i}`} style={styles.ellipsis}>…</Text>
        ) : (
          <PageNumber
            key={p}
            page={p}
            active={p === currentPage}
            onPress={() => onPageChange(p)}
          />
        )
      )}
      <PagerChip
        icon="chevron-forward"
        disabled={!canNext}
        onPress={() => canNext && onPageChange(currentPage + 1)}
      />
    </View>
  );
}

// PageNumber — single number pill. Active variant is a solid vibeBlue
// fill so it reads as "you are here" at a scan-glance.
function PageNumber({ page, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      hitSlop={4}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{page}</Text>
    </Pressable>
  );
}

// PagerChip — the prev / next arrow buttons. Disabled at the edges
// (page 1 back-arrow / last-page forward-arrow) with muted styling.
function PagerChip({ icon, disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, disabled && styles.chipDisabled]}
      disabled={disabled}
      hitSlop={4}
    >
      <Ionicons
        name={icon}
        size={18}
        color={disabled ? theme.colors.textSecondary : theme.colors.vibeBlue}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  pill: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(0, 198, 255, 0.35)',
    backgroundColor: 'rgba(0, 198, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: theme.colors.vibeBlue,
    borderColor: theme.colors.vibeBlue,
  },
  pillText: {
    color: theme.colors.vibeBlue,
    fontSize: 13,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  chip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(0, 198, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDisabled: {
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  ellipsis: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: 2,
  },
});
