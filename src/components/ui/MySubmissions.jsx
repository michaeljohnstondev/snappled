// MySubmissions.jsx — the prompts you wrote, and where they stand.
//
// Submitting a game prompt used to be a one-way door. The composer
// closed, the tickets left your balance, and the prompt appeared
// nowhere: the ranking deck deliberately skips your own prompts (you
// cannot vote on yourself), and the Top / New / Mine list that used to
// sit on this tab was removed. So the only evidence you had submitted
// anything at all was a hundred tickets missing.
//
// This is the receipt. It shows every prompt you have submitted, its
// current standing, and how the vote is going - including the ones that
// were retired or removed, because those are exactly the ones you would
// otherwise be left guessing about.

import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { gamePromptService } from '../../services/gamePromptService';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// What each status means to the person who wrote it, rather than to the
// database. "candidate" is a schema word; "in the vote" is the thing
// they actually want to know.
// Takes the live theme because "retired" is the one standing drawn in
// the muted text colour, and that colour flips between light and dark -
// the accents do not.
function standingFor(status, t) {
  const map = {
    candidate: { label: 'IN THE VOTE', color: theme.colors.vibeYellow },
    live: { label: 'IN PLAY', color: theme.colors.vibeGreen },
    retired: { label: 'RETIRED', color: t.colors.textSecondary },
    banned: { label: 'REMOVED', color: theme.colors.vibeRed },
  };
  return map[status] || map.candidate;
}

/**
 * @param {string} userId
 * @param {number} refreshKey  bump it to re-read. The panel does that
 *   after a submission lands, so a new prompt shows up immediately
 *   rather than after a tab switch.
 */
export default function MySubmissions({ userId, refreshKey = 0 }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) { setRows([]); return undefined; }
    gamePromptService.getMine(userId)
      .then(res => { if (!cancelled) setRows(res.prompts || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  // Nothing submitted yet means no section at all. An empty "your
  // submissions" header is a prompt to do something, and this screen
  // already has one of those in the card above it.
  if (!rows.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>YOUR SUBMISSIONS</Text>
      {rows.map(row => {
        const standing = standingFor(row.status, t);
        const likes = row.likeCount || 0;
        const dislikes = row.dislikeCount || 0;
        return (
          <View key={row.id} style={styles.row}>
            <Text style={styles.text} numberOfLines={2}>{row.text}</Text>
            <View style={styles.meta}>
              <Text style={[styles.standing, { color: standing.color }]}>
                {standing.label}
              </Text>
              {/* No score until somebody has actually voted. "0 - 0" on a
                  prompt submitted a minute ago reads like a rejection. */}
              {likes + dislikes > 0 ? (
                <View style={styles.tally}>
                  <Ionicons name="thumbs-up" size={12} color={theme.colors.vibeGreen} />
                  <Text style={styles.tallyText}>{likes}</Text>
                  <Ionicons name="thumbs-down" size={12} color={theme.colors.vibeRed} />
                  <Text style={styles.tallyText}>{dislikes}</Text>
                </View>
              ) : (
                <Text style={styles.tallyText}>No votes yet</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t) => ({
  wrap: { marginTop: 28, alignSelf: 'stretch' },
  label: {
    color: t.colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,198,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  text: { color: t.colors.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  meta: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 8,
  },
  standing: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tallyText: { color: t.colors.textSecondary, fontSize: 11, fontWeight: '600' },
});
