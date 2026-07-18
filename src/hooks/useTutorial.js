// useTutorial — drives the tap-to-dismiss tutorial overlay across the
// game flow. Each phase shows its tip once per game; dismiss advances
// nothing on its own (the game plays underneath). Callers pass the
// current phase and whether tutorial mode is on; the hook returns the
// active tip (or null) and a dismiss handler.
//
// Phase → tip content is defined here so a future "Play again with
// tutorial" toggle only needs to flip the enabled flag.

import { useEffect, useRef, useState } from 'react';

// Static content dictionary. Keys match GAME_PHASES values. Each tip
// has a short title and one-liner body — kept legible in a hurry so a
// mid-game read never risks timing out the round.
export const TUTORIAL_TIPS = {
  review: {
    title: 'The Prompt',
    body:
      "Every round starts with a prompt — a challenge like 'Trust me bro' or 'When mom says clean your room'. You'll get a hand of snapples (short videos). Your job: pick the one that best matches the prompt.",
  },
  picking: {
    title: 'Pick Your Snapple',
    body:
      'Tap any snapple in your hand to preview the video. When you find the one that matches the prompt, hit PLAY THIS SNAPPLE to lock it in.',
  },
  voting: {
    title: 'Vote For The Best',
    body:
      "Now watch everyone's picks. Tap a snapple to preview, then VOTE FAVORITE for the funniest match. You can't vote for your own snapple.",
  },
  scoring: {
    title: 'How You Score',
    body:
      'Every vote your snapple got is 1 point. The more people that liked your pick, the more points you rack up. First to the target score wins.',
  },
};

// Hook. Returns { activeTip, dismiss }.
// enabled: whether tutorial mode is on for this game session.
// phase: current game.phase string. Watched — when it changes and a
//        matching tip hasn't been shown this session, the tip surfaces.
export function useTutorial(enabled, phase) {
  const [activeTip, setActiveTip] = useState(null);
  const shownRef = useRef(new Set());

  // When tutorial mode turns off (leaveGame), clear the seen set so a
  // re-run in the same session shows every tip again from scratch.
  useEffect(() => {
    if (!enabled) {
      shownRef.current = new Set();
      setActiveTip(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !phase) return;
    const tip = TUTORIAL_TIPS[phase];
    if (!tip) return;
    if (shownRef.current.has(phase)) return;
    shownRef.current.add(phase);
    setActiveTip({ phase, ...tip });
  }, [enabled, phase]);

  // Dismiss the current tip. Doesn't advance the phase — the game
  // continues under the overlay so the player sees the actual UI the
  // tip just described.
  const dismiss = () => setActiveTip(null);

  return { activeTip, dismiss };
}
