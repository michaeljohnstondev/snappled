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
import CreatorActionRow from './CreatorActionRow';
import ReactionBar from './ReactionBar';

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
