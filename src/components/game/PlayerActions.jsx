// PlayerActions.jsx — the action rail inside the fullscreen player.
//
// Follow / Save / Buy / Share / Report, plus the emoji toggle where
// reacting is possible. One component so every player in a game offers
// the same things, because they did not:
//
//   picking, browsing your hand   nothing at all
//   picking, waiting to vote      the rail, no round prompt
//   warmup (review)               nothing at all
//   voting                        the rail + emoji + round prompt
//   scoring                       the rail + round prompt, no emoji
//
// Opening the same clip from two screens offered two different sets of
// buttons, and on two of them you could not share, buy or report at all.
//
// `prompt` is the ROUND's prompt, and it matters: a share built without
// it falls back to the prompt the clip was originally recorded for,
// which is the wrong caption for a snapple being replayed against
// something else.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CreatorActionRow from './CreatorActionRow';
import ReactionBar from './ReactionBar';
import theme from '../../theme/themes';

/**
 * @param {object} submission   the card on screen
 * @param {object} user         current user
 * @param {object} userCurrency for owned / wishlisted state
 * @param {string} prompt       the round's prompt, when there is one
 * @param {Function} onReact    omit where nothing can be reacted to yet -
 *   during picking and warmup nobody has submitted, so there is no
 *   submission for a reaction to attach to
 * @param {object} mine         which emoji this user already sent
 * @param {boolean} reactionsDisabled  true during the cooldown
 */
export default function PlayerActions({
  submission, user, userCurrency, showToast, showError, prompt,
  onReact, mine, reactionsDisabled,
}) {
  return (
    <>
      {/* Says so out loud. Private is a state you set once and then
          forget, and it quietly changes what every other button here
          does - nobody else can be sold it, and the share link only
          opens for people you send it to. Worth a word before someone
          wonders why their clip never shows up anywhere. */}
      {submission?.isPrivate ? (
        <View style={styles.private}>
          <Ionicons name="lock-closed" size={11} color={theme.colors.vibeYellow} />
          <Text style={styles.privateText}>PRIVATE</Text>
        </View>
      ) : null}

      <CreatorActionRow
        submission={submission}
        currentUser={user}
        ownedSnappleIds={userCurrency?.ownedSnapples || []}
        wishlistedSnappleIds={userCurrency?.wishlistedSnapples || []}
        showToast={showToast}
        showError={showError}
        prompt={prompt}
      />
      {/* Collapsible, so the rail stays one column of controls rather
          than four buttons over a ten-high stack of emoji. */}
      {onReact ? (
        <ReactionBar
          mode="picker"
          collapsible
          vertical
          mine={mine}
          onReact={onReact}
          disabled={reactionsDisabled}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  private: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.vibeYellow,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  privateText: {
    color: theme.colors.vibeYellow,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
