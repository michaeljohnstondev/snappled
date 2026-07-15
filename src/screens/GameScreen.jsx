import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Dimensions,
  ActivityIndicator, Animated, Modal, TextInput, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { LinearTransition } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { useRewardClaim } from '../store/RewardClaimContext';
import { prefetchVideo } from '../services/videoCache';
import { thumbnailService } from '../services/thumbnailService';
import { gameService, GAME_PHASES } from '../services/gameService';
import SnappleThumbnailImg from '../components/ui/SnappleThumbnail';
import { snappleService } from '../services/snappleService';
import { userService } from '../services/userService';
import VibeButton from '../components/ui/VibeButton';
import ShimmerBar from '../components/ui/ShimmerBar';
import BackChunk from '../components/ui/BackChunk';
import AppLayout from '../components/ui/layout/AppLayout';
import { CardThumbnailDelayed } from '../components/game/CardThumbnail';
import PreviewModal from '../components/game/PreviewModal';
import VoteAuraCard from '../components/game/VoteAuraCard';
import CreatorActionRow from '../components/game/CreatorActionRow';
import LobbyPhase from '../components/game/phases/LobbyPhase';
import WarmupPhase from '../components/game/phases/WarmupPhase';
import FinalResultsPhase from '../components/game/phases/FinalResultsPhase';
import PickingPhase from '../components/game/phases/PickingPhase';
import LoadingPhase from '../components/game/phases/LoadingPhase';
import RoundHeaderBar from '../components/game/round/RoundHeaderBar';
import RoundPromptBanner from '../components/game/round/RoundPromptBanner';
import HandCardThumbnail from '../components/game/round/HandCardThumbnail';
import RoundStartOverlay from '../components/game/RoundStartOverlay';
import TutorialOverlay from '../components/game/TutorialOverlay';
import { useTutorial } from '../hooks/useTutorial';
import theme from '../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ── Round results reveal — staged animation: grid → spotlight → shrink → scoreboard ──
// Layout: scoreboard is the base layer (always rendered) so we can measure
// each player's row Y in screen coords. The reveal grid + winner spotlight
// are an overlay on top. During shrink each winner card scales down and
// translates toward its actual row in the scoreboard.
// Palette assigned to non-self players in voter-order. Self always shows
// in vibeGreen so the user can spot their own vote at a glance.
// Distinct colors only — vibeCyan/Aqua/Teal were near-duplicates of
// vibeBlue and made adjacent players hard to tell apart. Replaced with
// vibeTurquoise (clearly different green-blue), vibeRed, and
// vibeRoyalBlue for spread.
// vibeOrange dropped — sat too close to vibeYellow in the palette
// and two adjacent voters would end up looking identical. Swapped
// for vibeElectricBlue which reads distinctly against the yellow.
const VOTER_PALETTE = [
  theme.colors.vibeBlue,
  theme.colors.vibePurple,
  theme.colors.vibePink,
  theme.colors.vibeYellow,
  theme.colors.vibeElectricBlue,
  theme.colors.vibeRed,
  theme.colors.vibeTurquoise,
  theme.colors.vibeRoyalBlue,
];

// Scoring-phase winner callout. Slides down from above on mount with a
// soft fade so the moment feels announced rather than printed. Idempotent
// — re-mounted each round when SCORING phase enters.
function ScoringWinnerBanner({ isTie, names, votes }) {
  const ty = React.useRef(new Animated.Value(-40)).current;
  const op = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(ty, {
        toValue: 0,
        duration: 450,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(op, {
        toValue: 1,
        duration: 450,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);
  return (
    <Animated.View
      style={[
        scoringStyles.winnerBanner,
        { opacity: op, transform: [{ translateY: ty }] },
      ]}
    >
      <Text style={scoringStyles.winnerLabel}>
        {isTie ? 'Round Winners (tied)' : 'Round Winner'}
      </Text>
      <Text style={scoringStyles.winnerNames}>
        {names.map(n => `@${n}`).join(' · ')}
      </Text>
      <Text style={scoringStyles.winnerVotes}>
        {votes} vote{votes === 1 ? '' : 's'}{isTie ? ' each' : ''}
      </Text>
    </Animated.View>
  );
}

// Voting-wait snapples grid. Renders VoteAuraCards and, once all-voted
// flips true, fades all picker names in together below the cards. Owns
// a single shared Animated.Value so the fade survives re-renders during
// the 10s post-all-voted wait.
// Optional props:
//   winnerUids (Set):    submission.uid values to crown (SCORING phase)
//   pointsByUid (Map):   submission.uid → pointsEarned chip (SCORING phase)
function VotingWaitGrid({
  submissions, voters, players, playerColors, selfUid, allVotedIn,
  onPressCard, winnerUids, pointsByUid,
  // Optional inline-play controls — when passed, cards behave like
  // the picking/voting hand cards (tap = play once inline, expand
  // chip = fullscreen preview).
  inlinePlayingId, playToken, onTogglePlay, onFullscreen,
  // "large" = 2-col grid with big cards (SCORING screen), matches
  // the picking/voting hand grid. Anything else = the older
  // 8-column-ish centered flex-wrap for the voting wait screen.
  variant = 'wait',
}) {
  const nameOpacity = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!allVotedIn) return;
    Animated.timing(nameOpacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [allVotedIn]);

  const isLarge = variant === 'large';
  const gridStyle = isLarge ? styles.auraGridLarge : styles.allSnapplesGrid;
  const cellStyle = isLarge ? styles.auraCellLarge : styles.auraCellSmall;
  // Reserve the same picker-name offset on every card so the row
  // reads as a clean line regardless of who got how many votes.
  const maxRingCount = React.useMemo(
    () => (submissions || []).reduce(
      (max, sub) => Math.max(max, (voters(sub.uid) || []).length),
      0,
    ),
    [submissions, voters],
  );
  return (
    <View style={gridStyle}>
      {(submissions || []).map((sub, i) => {
        const player = (players || []).find(p => p.uid === sub.uid);
        const color = playerColors.get(sub.uid) || theme.colors.textSecondary;
        const isMe = sub.uid === selfUid;
        const picker = allVotedIn && player ? {
          name: player.username,
          color,
          isMe,
          opacity: nameOpacity,
        } : null;
        return (
          <View key={sub.snappleId || `sub-${i}`} style={cellStyle}>
            <VoteAuraCard
              submission={sub}
              voters={voters(sub.uid)}
              picker={picker}
              maxRingCount={maxRingCount}
              onPress={() => onPressCard(sub)}
              isWinner={winnerUids ? winnerUids.has(sub.uid) : false}
              pointsEarned={pointsByUid ? pointsByUid.get(sub.uid) : undefined}
              isPlaying={inlinePlayingId === sub.uid}
              playToken={inlinePlayingId === sub.uid ? (playToken || 0) : 0}
              onTogglePlay={onTogglePlay ? () => onTogglePlay(sub) : undefined}
              onFullscreen={onFullscreen ? () => onFullscreen(sub) : undefined}
            />
          </View>
        );
      })}
    </View>
  );
}

// Segmented aura rendered around a card — one stripe per voter, in their
// assigned color. Stripes wrap each side of the card so the colors are
// visible regardless of orientation. If no voters, just renders children.
// ── Round results — scoreboard only. The reveal/spotlight phases were
// removed because the energy now lives on the voting wait screen
// (vote auras pulse in as votes land). This component shows the
// scoreboard with a tick-up score animation + Reanimated row swaps.
function RoundResultsReveal({
  rankings, players, prompt, submissions,
  currentRound, totalRounds, timer,
  isHost, isPractice, onNextRound, onShare, onEndGame, onLeave,
  onHelp, onHelpEnd, onQuitPractice, selfUid,
}) {
  const isInfinite = totalRounds === 0;

  // Per-player color — same as voting wait + scoreboard so colors are
  // consistent across all surfaces.
  const playerColors = React.useMemo(() => {
    const map = new Map();
    let i = 0;
    (players || []).forEach(p => {
      if (p.uid === selfUid) {
        map.set(p.uid, theme.colors.vibeGreen);
      } else {
        map.set(p.uid, VOTER_PALETTE[i % VOTER_PALETTE.length]);
        i++;
      }
    });
    return map;
  }, [players, selfUid]);

  // earnedByUid lookup for the scoreboard +N display.
  const earnedByUid = {};
  (rankings || []).forEach(r => { earnedByUid[r.uid] = r.pointsEarned || 0; });

  // Displayed points start at "before this round" total; tick up to
  // post-round total over ~1.2s on mount.
  const [displayedPoints, setDisplayedPoints] = useState(() =>
    Object.fromEntries(
      (players || []).map(p => {
        const earned = earnedByUid[p.uid] || 0;
        return [p.uid, Math.max(0, p.points - earned)];
      })
    )
  );

  const orderedPlayers = [...(players || [])].sort((a, b) => {
    const aPts = displayedPoints[a.uid] ?? a.points;
    const bPts = displayedPoints[b.uid] ?? b.points;
    return bPts - aPts;
  });

  useEffect(() => {
    const targets = {};
    (players || []).forEach(p => { targets[p.uid] = p.points || 0; });
    const startVals = { ...displayedPoints };
    const duration = 1200;
    const steps = 40;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const t = step / steps;
      const next = {};
      (players || []).forEach(p => {
        const start = startVals[p.uid] ?? 0;
        const target = targets[p.uid] ?? 0;
        next[p.uid] = Math.round(start + (target - start) * t);
      });
      setDisplayedPoints(next);
      if (t >= 1) clearInterval(id);
    }, duration / steps);
    return () => clearInterval(id);
  }, []);

  return (
    <LinearGradient colors={theme.colors.gameBackgroundGradient} style={styles.container}>
      <RoundHeaderBar phase="roundResults" timerSec={timer} onHelp={onHelp} onHelpEnd={onHelpEnd} />

      <ScrollView contentContainerStyle={styles.resultsScrollContent} showsVerticalScrollIndicator={false}>
        {/* Standings — picker reveal + prompt already shown on the
            voting wait screen; this is just the leaderboard. */}
        {orderedPlayers.map((p, i) => {
          const earned = earnedByUid[p.uid] || 0;
          const displayed = displayedPoints[p.uid] ?? p.points;
          const color = playerColors.get(p.uid) || theme.colors.textSecondary;
          const isMe = p.uid === selfUid;
          return (
            <Reanimated.View
              key={p.uid}
              layout={LinearTransition.springify().damping(12).stiffness(90)}
              collapsable={false}
              style={[styles.resultRow, { borderLeftWidth: 5, borderLeftColor: color }]}
            >
              <Text style={styles.resultPlacement}>#{i + 1}</Text>
              <View style={styles.resultInfo}>
                <Text style={[styles.resultName, isMe && { color: theme.colors.vibeGreen }]}>
                  {p.username}
                </Text>
              </View>
              {earned > 0 && (
                <Text style={[styles.resultRoundPts, styles.resultRoundPtsEarned]}>
                  +{earned}
                </Text>
              )}
              <Text style={styles.resultTotal}>{displayed} pts</Text>
            </Reanimated.View>
          );
        })}

        <View style={styles.resultsActions}>
          {isHost ? (
            (() => {
              // Left-side "quit-ish" action pairs with the primary
              // Next Round ShimmerBar into a split action row. Which
              // one appears depends on game mode:
              //   practice (bots)     → QUIT (leaves practice)
              //   infinite non-prac   → END GAME (host ends for all)
              //   fixed-round non-prac → nothing (game auto-ends)
              const leftAction = isPractice && onQuitPractice
                ? { label: 'QUIT', onPress: onQuitPractice }
                : isInfinite && !isPractice && onEndGame
                  ? { label: 'END GAME', onPress: onEndGame }
                  : null;
              return leftAction ? (
                <View style={styles.actionRow}>
                  <BackChunk
                    onPress={leftAction.onPress}
                    label={leftAction.label}
                    style={styles.actionBackFlex}
                  />
                  <ShimmerBar
                    colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
                    label="NEXT ROUND"
                    onPress={onNextRound}
                    style={styles.actionSubmitChunk}
                  />
                </View>
              ) : (
                <ShimmerBar
                  colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
                  label="NEXT ROUND"
                  onPress={onNextRound}
                />
              );
            })()
          ) : (
            <Text style={styles.waitingText}>Next round in {timer}s...</Text>
          )}
          <Pressable style={styles.shareResultsBtn} onPress={onShare}>
            <Ionicons name="share-social" size={16} color={theme.colors.vibeBlue} />
            <Text style={styles.shareResultsText}>Share Round</Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Main Game Screen ──
export default function GameScreen({ navigation }) {
  const { user, userCurrency } = useAuth();
  const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];
  const isAdmin = ADMIN_UIDS.includes(user?.uid);
  // Admin-only inline edit on the round's prompt banner. Mirrors the pattern
  // in PromptInfoOverlay — Edit toggles a TextInput, Delete pulls a fresh
  // prompt and restarts the round.
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editPromptText, setEditPromptText] = useState('');
  const { showAlert, showError, showConfirm, showToast } = useModal();
  const { claimRewards } = useRewardClaim();
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [currentVoteIndex, setCurrentVoteIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [mySnapples, setMySnapples] = useState([]);
  const [allSnapples, setAllSnapples] = useState([]);
  // Mirror allSnapples in a ref so async schedulers (bot picks, retries)
  // always see the latest pool without stale-closure problems.
  const allSnapplesRef = useRef([]);
  useEffect(() => { allSnapplesRef.current = allSnapples; }, [allSnapples]);
  const [useRandomCards, setUseRandomCards] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  // Tutorial mode: a practice game with tap-to-dismiss phase tips.
  // Cleared on leaveGame the same as isPractice.
  const [isTutorial, setIsTutorial] = useState(false);
  const { activeTip: tutorialTip, dismiss: dismissTutorialTip } = useTutorial(
    isTutorial,
    game?.phase,
  );
  // Freeze flag consumed by the phase timer and auto-advance triggers.
  // While a tutorial tip is open the round pauses so first-timers can
  // read without racing the countdown. Kept as a ref so the interval
  // callback + subscription handler see the current value without
  // needing to be re-registered on every tip toggle.
  const pausedRef = useRef(false);
  // Paused whenever a full-screen overlay is up — tutorial tips OR
  // the per-round "60s to pick / vote" alert. Both are tap-to-dismiss
  // and freeze the countdown + auto-advance so reading isn't racing
  // the clock.
  useEffect(() => {
    pausedRef.current = !!tutorialTip || !!roundAlert;
  }, [tutorialTip, roundAlert]);
  const [isSpectating, setIsSpectating] = useState(false);
  const [timer, setTimer] = useState(0);
  const [previewCard, setPreviewCard] = useState(null);
  // Which voting card is playing inline (mini-player inside the
  // thumbnail). Token increments per tap so tapping the same card
  // replays via a fresh mount.
  const [votingInlinePlaying, setVotingInlinePlaying] = useState({ id: null, token: 0 });
  // Same shape for the SCORING screen — mini-player inside each
  // VoteAuraCard so users can rewatch after voting closes.
  const [scoringInlinePlaying, setScoringInlinePlaying] = useState({ id: null, token: 0 });

  // Reset both inline-play states on any phase transition / round
  // bump. Without this, tapping a card in round 1's voting kept the
  // submitter's uid in state; round 2's voting saw the same uid and
  // auto-played whatever new snapple that player had submitted.
  useEffect(() => {
    setVotingInlinePlaying({ id: null, token: 0 });
    setScoringInlinePlaying({ id: null, token: 0 });
  }, [game?.phase, game?.currentRound]);
  // IDs of snapples this user has already played in the current game — used to
  // filter the hand pool so each round reveals unseen cards.
  const [playedCardIds, setPlayedCardIds] = useState([]);
  // When true, tapping a card in the hand replaces it instead of previewing.
  const [mulliganMode, setMulliganMode] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  // Help overlay — user-triggered via the "?" button on
  // RoundHeaderBar. Now a press-and-hold: press-in shows the tip,
  // press-out hides it. Copy per phase lives here so it stays with
  // the game screen instead of leaking into each phase component.
  const [roundAlert, setRoundAlert] = useState(null);
  const hidePhaseHelp = () => setRoundAlert(null);
  const showPhaseHelp = () => {
    const phase = game?.phase;
    if (phase === GAME_PHASES.PICKING) {
      setRoundAlert({
        title: 'Pick a card',
        bullets: [
          'Pick the snapple that best suits the prompt',
          'Tap a card to preview it fullscreen',
          'Hit PLAY THIS CARD when you\'re locked in',
        ],
      });
    } else if (phase === GAME_PHASES.VOTING) {
      setRoundAlert({
        title: 'Vote for the best',
        bullets: [
          'Pick your favorite snapple for this prompt',
          'Tap a card to preview it fullscreen',
          'You can\'t vote for your own submission',
        ],
      });
    } else if (phase === GAME_PHASES.SCORING) {
      setRoundAlert({
        title: 'Scoring',
        bullets: [
          'Each vote your card got is worth a point',
          'The round winner wears the crown',
        ],
      });
    } else if (phase === GAME_PHASES.REVIEW) {
      setRoundAlert({
        title: 'Warmup',
        bullets: [
          'Get comfy with your hand',
          'Tap READY UP when you\'re set',
          'Round starts when everyone\'s ready or the timer runs out',
        ],
      });
    } else if (phase === GAME_PHASES.ROUND_RESULTS) {
      setRoundAlert({
        title: 'Round results',
        bullets: [
          'Standings after the round',
          'Host advances to the next round when ready',
        ],
      });
    }
  };
  // Round count for newly-created games (practice + custom). Adjustable
  // on the no-game choice screen via the rounds picker.
  // Default play-to target points (was rounds count). Lobby picker for
  // custom games can change it; practice uses this value at create time.
  const [selectedRounds, setSelectedRounds] = useState(25);
  const timerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  // pickDeadline we last scheduled bot picks against — guards against
  // duplicate schedules. Switched from currentRound because admin's
  // Replace & Restart keeps the same round but stamps a new pickDeadline,
  // so the old guard would skip rescheduling and bots would never pick
  // again — leaving picking stuck.
  const lastBotScheduleDeadlineRef = useRef(null);

  // Tracks every pending bot setTimeout (picks + votes) so we can cancel
  // them when the phase changes. Without this, a bot pick scheduled for
  // round 1 with a 7s delay could fire late — landing as a stale
  // submission in round 2 and inflating the snapple count for that round.
  const pendingBotTimeoutsRef = useRef([]);
  const cancelPendingBots = () => {
    pendingBotTimeoutsRef.current.forEach(id => clearTimeout(id));
    pendingBotTimeoutsRef.current = [];
  };
  useEffect(() => {
    cancelPendingBots();
  }, [game?.phase, game?.currentRound]);

  const hasDeck = mySnapples.length >= 6;

  // Schedule bot picks once per pickDeadline when PICKING is active —
  // bots fire on randomized 4-8s delays so the round doesn't slam shut.
  useEffect(() => {
    if (!gameId || !game) return;
    if (game.phase !== GAME_PHASES.PICKING) return;
    if (game.hostId !== user?.uid) return;
    if (!game.pickDeadline) return;
    if (lastBotScheduleDeadlineRef.current === game.pickDeadline) return;
    lastBotScheduleDeadlineRef.current = game.pickDeadline;
    const botPlayers = (game.players || []).filter(p => p.uid?.startsWith('bot_'));
    botPlayers.forEach(bot => scheduleBotPick(gameId, bot.uid));
  }, [gameId, game?.phase, game?.pickDeadline, game?.hostId, user?.uid]);

  // Reset the bot-schedule guard when leaving a game.
  useEffect(() => {
    if (!gameId) lastBotScheduleDeadlineRef.current = null;
  }, [gameId]);

  // Schedule bot votes when VOTING starts. Fires for any game with bot
  // players (practice OR custom-with-added-bots). Each bot gets a
  // random 3-12s delay so auras populate gradually instead of all
  // firing at once. Dedupe key is currentRound since voting fires once
  // per round.
  const lastBotVoteScheduleRoundRef = useRef(null);
  useEffect(() => {
    if (!gameId || !game) return;
    if (game.phase !== GAME_PHASES.VOTING) return;
    if (game.hostId !== user?.uid) return;
    if (lastBotVoteScheduleRoundRef.current === game.currentRound) return;
    lastBotVoteScheduleRoundRef.current = game.currentRound;

    const botPlayers = (game.players || []).filter(p => p.uid?.startsWith('bot_'));
    const allSubs = game.submissions || [];
    if (allSubs.length === 0) return;

    botPlayers.forEach(bot => {
      // Each bot can vote for anyone except themselves. Previously this
      // filtered to non-bot submissions, but in practice games the user
      // is usually the only human — so all bots ended up voting for the
      // same one card.
      const eligible = allSubs.filter(s => s.uid !== bot.uid);
      if (eligible.length === 0) return;
      const delay = 3000 + Math.floor(Math.random() * 9000);
      const tid = setTimeout(() => {
        const target = eligible[Math.floor(Math.random() * eligible.length)];
        gameService.castVote(gameId, bot.uid, target.uid).catch(() => {});
      }, delay);
      pendingBotTimeoutsRef.current.push(tid);
    });
  }, [gameId, game?.phase, game?.currentRound, game?.hostId, user?.uid]);

  useEffect(() => {
    if (!gameId) lastBotVoteScheduleRoundRef.current = null;
  }, [gameId]);

  // Schedule bot ready-ups when REVIEW (warmup) starts. Each bot rolls a
  // random 2-6s delay before flipping itself ready, so the auto-start
  // feels like real players acknowledging at their own pace. Same
  // cancellable-timeouts pattern as bot picks/votes — a stale ready
  // landing in the next round would harmlessly set a bot already-ready
  // again, but cancelling keeps things tidy.
  const lastBotReadyScheduleRef = useRef(null);
  useEffect(() => {
    if (!gameId || !game) return;
    if (game.phase !== GAME_PHASES.REVIEW) return;
    if (game.hostId !== user?.uid) return;
    const reviewKey = `${game.currentRound}-${game.reviewDeadline || ''}`;
    if (lastBotReadyScheduleRef.current === reviewKey) return;
    lastBotReadyScheduleRef.current = reviewKey;

    const botPlayers = (game.players || []).filter(p => p.uid?.startsWith('bot_'));
    botPlayers.forEach(bot => {
      const delay = 2000 + Math.floor(Math.random() * 4000);
      const tid = setTimeout(() => {
        gameService.setPlayerReady(gameId, bot.uid, true).catch(() => {});
      }, delay);
      pendingBotTimeoutsRef.current.push(tid);
    });
  }, [gameId, game?.phase, game?.currentRound, game?.reviewDeadline, game?.hostId, user?.uid]);

  useEffect(() => {
    if (!gameId) lastBotReadyScheduleRef.current = null;
  }, [gameId]);

  // Incremental video + thumbnail prefetch — concurrent (forEach
  // without await) so every new video starts downloading + its
  // first-frame extraction runs the instant a submission lands.
  // By the time we render the voting grid the poster frame is
  // already in-memory and the video's already on disk, so cards
  // pop in with zero shimmer/black flash. Both helpers dedupe
  // internally (in-flight promise + result cache), so repeated
  // effect runs on submissions.length changes are cheap.
  useEffect(() => {
    (game?.submissions || []).forEach(s => {
      if (s?.videoUrl) {
        prefetchVideo(s.videoUrl);
        thumbnailService.getThumbnail(s.videoUrl);
      }
    });
  }, [game?.submissions?.length]);

  // Same treatment for the user's own hand: video + thumbnail on
  // draw / refresh so the picking grid renders with everything
  // already loaded.
  useEffect(() => {
    hand.forEach(card => {
      if (card?.videoUrl) {
        prefetchVideo(card.videoUrl);
        thumbnailService.getThumbnail(card.videoUrl);
      }
    });
  }, [hand]);

  // Lookahead prefetch during idle wait screens (SCORE / voting).
  // handleNextRound draws a replacement card from the community
  // pool to fill the just-played slot, but the draw is random so
  // we can't know exactly which one — best-effort is to warm the
  // top ~10 candidates from the unused pool. Any that end up
  // getting drawn are already cached. Runs on any phase change so
  // it fires when SCORE opens and again when VOTING opens.
  useEffect(() => {
    const isIdleWait = game?.phase === GAME_PHASES.ROUND_RESULTS
      || game?.phase === GAME_PHASES.VOTING;
    if (!isIdleWait) return;
    const inHandIds = new Set(hand.map(h => h?.id).filter(Boolean));
    const pool = getHandSnapples().filter(s => !inHandIds.has(s.id)).slice(0, 10);
    pool.forEach(s => {
      if (s?.videoUrl) {
        prefetchVideo(s.videoUrl);
        thumbnailService.getThumbnail(s.videoUrl);
      }
    });
  }, [game?.phase, game?.currentRound]);

  // Reset per-round state for EVERY player whenever the round number changes.
  // Host-only handleNextRound also resets these, but guests never call it so
  // their hasVoted / selectedCard / favoriteCard would carry over between
  // rounds — leading to a stale "vote submitted" green check and ghost
  // selected borders. This effect fires on every client.
  useEffect(() => {
    if (!gameId || !game?.currentRound) return;
    setSelectedCard(null);
    setCurrentVoteIndex(0);
    setFavoriteCard(null);
    setHasVoted(false);
    setMulliganMode(false);
    setPreviewCard(null);
  }, [gameId, game?.currentRound]);

  // Close any open preview modal whenever the phase changes — otherwise
  // a preview opened on warmup could leak into picking, picking into
  // voting, etc. when the timer expires and force-advances mid-preview.
  useEffect(() => {
    setPreviewCard(null);
  }, [game?.phase]);

  // Draw a hand when warmup or picking begins and the hand is empty. Was
  // previously done with setState during render which racked up extra
  // renders and risked infinite-loop edge cases. Effect-based version
  // fires once per phase entry.
  useEffect(() => {
    if (!game?.phase) return;
    // LOADING included so we can prefetch the hand's videos before
    // the warmup timer starts; the hand persists straight through
    // into REVIEW/PICKING without being redrawn.
    const inDrawingPhase =
      game.phase === GAME_PHASES.LOADING ||
      game.phase === GAME_PHASES.REVIEW ||
      game.phase === GAME_PHASES.PICKING;
    if (!inDrawingPhase) return;
    if (hand.length > 0) return;
    if (mySnapples.length === 0 && allSnapples.length === 0) return;
    setHand(gameService.drawHand(getHandSnapples(), allSnapples));
  }, [game?.phase, game?.currentRound, mySnapples.length, allSnapples.length, hand.length]);

  // Admin shadow-ban auto-replace. When an admin excludes a snapple
  // mid-game, every client (admin + other players) gets the change via
  // game.recentlyExcludedSnappleIds. Each client drops the excluded
  // card from their own hand IF they don't own it, and pulls a fresh
  // replacement from the community pool. Owners keep their copy.
  useEffect(() => {
    const excluded = game?.recentlyExcludedSnappleIds || [];
    if (!excluded.length || !hand?.length) return;
    const ownedSet = new Set(userCurrency.ownedSnapples || userCurrency.ownedCards || []);
    const handIds = new Set((hand || []).map(h => h.id || h.snappleId).filter(Boolean));
    const replacementPool = (allSnapples || []).filter(s =>
      s?.id && !handIds.has(s.id) && !excluded.includes(s.id)
    );
    let poolIdx = 0;
    let changed = false;
    const next = (hand || []).map(card => {
      const id = card?.id || card?.snappleId;
      if (id && excluded.includes(id) && !ownedSet.has(id)) {
        changed = true;
        if (poolIdx < replacementPool.length) {
          return replacementPool[poolIdx++];
        }
        return null; // No replacement available — drop the slot
      }
      return card;
    }).filter(Boolean);
    if (changed) setHand(next);
  }, [game?.recentlyExcludedSnappleIds, allSnapples, userCurrency.ownedSnapples]);

  // Admin-only: exclude a snapple from the bot/practice pool with a
  // confirm dialog. Broadcasts to all players in the current game so
  // their hands auto-drop the card (unless they own it). Shared by the
  // in-game preview modals across all phases (warmup, picking, voting).
  // Tapped @username on a card → open that creator's profile so the
  // player can Follow them. Same navigation target as the Profile
  // tab uses. No-op if the card is missing creatorId (shouldn't
  // happen but keeps us safe from accidental navigate('undefined')).
  const handleCreatorPress = useCallback((creatorId) => {
    if (!creatorId) return;
    navigation.navigate('UserProfile', { userId: creatorId });
  }, [navigation]);

  const handleExcludeFromPool = useCallback((snappleId) => {
    if (!snappleId) return;
    showConfirm(
      'Exclude from Pool?',
      'This card will stop showing up in bot picks and fresh hands. ' +
      'Players who already own it keep it. Continue?',
      async () => {
        const r = await snappleService.setSnappleExcludeFromPool(
          snappleId, user?.uid, true,
        );
        if (!r?.success) {
          showError('Error', r?.error || 'Could not exclude');
          return;
        }
        // Best-effort broadcast — service write already succeeded so
        // the change is durable even if the broadcast fails.
        try { await gameService.broadcastSnappleExclusion(gameId, snappleId); } catch (e) {}
        showToast('info', 'Excluded from pool', "Bots won't draw this");
      },
    );
  }, [user?.uid, gameId, showConfirm, showError, showToast]);

  // Hide the bottom tab bar whenever the user is inside an active game so the
  // game UI gets full-screen real estate. setOptions targets THIS screen's
  // descriptor (which is what CustomTabBar reads via descriptors[focused.key]),
  // not the parent navigator.
  useEffect(() => {
    const inGame = !!gameId && !!game;
    navigation.setOptions({ tabBarStyle: inGame ? { display: 'none' } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation, gameId, game]);

  // Load snapples + check for active game on mount.
  useEffect(() => {
    loadSnapples();
    checkActiveGame();
  }, []);

  // Refetch snapples whenever GameScreen gains focus (e.g. user just
  // recorded a new one and came back). Without this, the deck stays
  // frozen at whatever was loaded the first time the screen mounted —
  // so new snapples never appeared in subsequent games. Skips while
  // a game is active to avoid changing mySnapples mid-round.
  useFocusEffect(
    useCallback(() => {
      if (!gameId) loadSnapples();
    }, [gameId])
  );

  // Detect an in-progress game to rejoin on app relaunch. Reads the
  // user doc's `activeGameId` (a single doc read regardless of how
  // many games exist in the collection — the old approach paginated
  // /games with a client-side `players.some(...)` filter, which did
  // not scale). Self-heals stale pointers: if the referenced game
  // doesn't exist, doesn't include us, is stale (>5 min), or is a
  // practice-with-bots game, we clear activeGameId and fall through
  // to the normal no-game-in-progress UI.
  const checkActiveGame = async () => {
    if (!user?.uid) return;
    try {
      const { doc: docRef, getDoc, updateDoc, deleteDoc, serverTimestamp } = require('firebase/firestore');
      const { db } = require('../services/firebase');

      const userRef = docRef(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const activeId = userSnap.exists() ? userSnap.data().activeGameId : null;
      if (!activeId) return;

      const gameRef = docRef(db, 'games', activeId);
      const gameSnap = await getDoc(gameRef);
      const clearPointer = () => updateDoc(userRef, {
        activeGameId: null,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      if (!gameSnap.exists()) {
        clearPointer();
        return;
      }

      const data = gameSnap.data();
      const stillIn = (data.players || []).some(p => p.uid === user.uid);
      if (!stillIn) {
        clearPointer();
        return;
      }

      // Stale = 5+ min no updates. Delete + clear.
      const updatedAt = data.updatedAt?.toDate?.() || new Date(data.updatedAt || 0);
      const staleMins = (Date.now() - updatedAt.getTime()) / (1000 * 60);
      if (staleMins > 5) {
        console.log('[GameScreen] Cleaning up stale game:', activeId);
        await deleteDoc(gameRef).catch(() => {});
        clearPointer();
        return;
      }

      // Practice games (bot players) don't restore — bots aren't real
      // clients driving the phase machine, so a restarted session
      // would sit forever. Nuke the game and start fresh next time.
      const hasBots = (data.players || []).some(p => p.uid?.startsWith('bot_'));
      if (hasBots) {
        await deleteDoc(gameRef).catch(() => {});
        clearPointer();
        return;
      }

      setGameId(activeId);
    } catch (e) {
      console.error('[GameScreen] Error checking active game:', e);
    }
  };

  // Phase timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (game?.phase === GAME_PHASES.REVIEW) {
      setTimer(60);
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return;
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // Host transitions to PICKING when review timer ends
            if (game.hostId === user?.uid) {
              gameService.startPicking(gameId);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (game?.phase === GAME_PHASES.PICKING) {
      setTimer(60);
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return;
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // No autopick — players who don't pick simply skip the round.
            // Host force-advances to voting when the timer expires so AFK
            // players don't stall the round. (Add isRanked branch back
            // here once ranked exists — there autopick is fair game.)
            if (game.hostId === user?.uid) {
              gameService.startVoting(gameId);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (game?.phase === GAME_PHASES.VOTING) {
      setTimer(60); // 60 seconds to vote
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return;
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // No auto-vote either. Host force-advances to results so the
            // round doesn't stall on AFK voters. Same scheduling guard as
            // the all-voted path so we don't double-fire finishRound.
            if (game.hostId === user?.uid &&
                finishScheduledRoundRef.current !== game.currentRound) {
              finishScheduledRoundRef.current = game.currentRound;
              setTimeout(() => gameService.finishRound(gameId), 1000);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (game?.phase === GAME_PHASES.SCORING) {
      // Brief breather between voting and the scoreboard so players can
      // see who won the round + voter attribution. Host auto-advances
      // to ROUND_RESULTS (or FINAL_RESULTS) when the timer runs out.
      setTimer(20);
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return;
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            if (game.hostId === user?.uid) {
              gameService.enterRoundResults(gameId);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (game?.phase === GAME_PHASES.ROUND_RESULTS) {
      // Reveal animation runs ~12.6s, then user gets ~25 seconds with the
      // scoreboard before host auto-advances. Bumped per user request to
      // give breathing room for ties + score swap animations.
      setTimer(37);
      timerRef.current = setInterval(() => {
        if (pausedRef.current) return;
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // Auto-advance to next round if host
            if (game.hostId === user?.uid) {
              handleNextRound();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimer(0);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [game?.phase, game?.currentRound]);

  // When all votes are in during VOTING, snap the visible timer down to
  // 5s so the on-screen countdown matches the actual time-to-finish
  // (instead of running a separate hidden setTimeout that desynced the
  // visible 30s timer and made results land while the timer still
  // showed seconds left).
  useEffect(() => {
    if (game?.phase !== GAME_PHASES.VOTING) return;
    const votedUids = new Set(Object.values(game.votes || {}).flat());
    const allVoted = (game.players || []).every(p => votedUids.has(p.uid));
    if (allVoted) {
      setTimer(prev => Math.min(prev, 5));
    }
  }, [game?.phase, game?.votes]);

  // Tracks whether finishRound has been scheduled this voting round so the
  // host doesn't double-fire the transition when multiple game-doc updates
  // come in during the 10s countdown.
  const finishScheduledRoundRef = useRef(null);

  // Subscribe to game updates
  useEffect(() => {
    if (gameId) {
      unsubscribeRef.current = gameService.subscribeToGame(gameId, (gameData) => {
        setGame(gameData);

        // Auto-advance: when everyone in REVIEW has hit Ready, the host
        // force-starts PICKING. The 60s warmup timer is the fallback.
        // Gated on pausedRef so bots pinging Ready during a tutorial tip
        // don't skip the user past the phase's intro.
        if (gameData.phase === GAME_PHASES.REVIEW && gameData.hostId === user?.uid && !pausedRef.current) {
          const ready = gameData.ready || {};
          const allReady = (gameData.players || []).length > 0 &&
            (gameData.players || []).every(p => ready[p.uid]);
          if (allReady) {
            gameService.startPicking(gameId);
          }
        }

        // Auto-advance: if all players submitted, move to voting.
        // Same paused gate so bots don't slam the phase forward while
        // the tutorial user is reading the picking tip.
        if (gameData.phase === GAME_PHASES.PICKING && !pausedRef.current) {
          const allSubmitted = gameData.players.every(p =>
            gameData.submissions.some(s => s.uid === p.uid)
          );
          if (allSubmitted && gameData.hostId === user?.uid) {
            gameService.startVoting(gameId);
          }
        }

        // All-voted handling lives in the timer-snap effect now (drops
        // the visible 30s countdown to 5s when everyone's in). The
        // host-side finishRound fires from the timer-hits-zero path so
        // the on-screen countdown matches the actual transition. No
        // separate setTimeout here — that desynced the visible timer
        // and the user saw results land before the timer hit 0.

        // Reset the guard once the round results phase clears so the next
        // round's vote-complete detection fires fresh.
        if (gameData.phase !== GAME_PHASES.VOTING) {
          if (finishScheduledRoundRef.current && finishScheduledRoundRef.current !== gameData.currentRound) {
            finishScheduledRoundRef.current = null;
          }
        }
      });
    }
    return () => unsubscribeRef.current?.();
  }, [gameId]);

  const loadSnapples = async () => {
    try {
      // Community pool — used for random-cards mode and bot picks.
      const allResult = await snappleService.getActiveSnapples(200);
      if (allResult.success) {
        setAllSnapples(allResult.snapples);
      }

      if (!user?.uid) return;

      // Build the user's playable deck: every snapple they created (no
      // global-cap eviction) plus every owned card by id. De-dupe by id.
      const created = await snappleService.getSnapplesByCreator(user.uid, 200);
      const ownedCardIds = userCurrency.ownedSnapples || userCurrency.ownedCards || [];

      const ownedCards = [];
      for (const id of ownedCardIds) {
        try {
          const r = await snappleService.getSnapple(id);
          if (r?.success && r.snapple) ownedCards.push(r.snapple);
        } catch (e) {}
      }

      const merged = [...(created.snapples || []), ...ownedCards];
      const uniqueById = Array.from(new Map(merged.map(s => [s.id, s])).values());
      setMySnapples(uniqueById);
    } catch (error) {
      console.error('[GameScreen] Error loading snapples:', error);
    }
  };

  // Hand-draw pool. Until the user has 100+ of their own snapples, we
  // always mix in the community pool so games never feel like the same
  // 6 cards every round. After 100 they have enough variety on their
  // own. Random-cards toggle still forces pure community.
  const getHandSnapples = () => {
    let source;
    if (useRandomCards) {
      source = allSnapples;
    } else if (mySnapples.length >= 100) {
      source = mySnapples;
    } else {
      const ownIds = new Set(mySnapples.map(s => s.id));
      const community = allSnapples.filter(s => !ownIds.has(s.id));
      source = [...mySnapples, ...community];
    }
    if (playedCardIds.length === 0) return source;
    return source.filter(s => !playedCardIds.includes(s.id));
  };

  // Schedule a bot pick with a random 4-8s delay. Reads allSnapples via a
  // ref so the snapshot is always current (the setTimeout closure used to
  // capture an empty array on slow Firestore loads and silently bail,
  // which froze picking until the user timer expired). If the pool is
  // still empty when the delay fires, retry every 1s up to 20s.
  const scheduleBotPick = (gid, botUid) => {
    const delay = 4000 + Math.floor(Math.random() * 4000);
    const tryPick = (retriesLeft) => {
      const pool = allSnapplesRef.current;
      if (pool && pool.length) {
        const botSnapple = pool[Math.floor(Math.random() * pool.length)];
        gameService.submitPick(gid, botUid, botSnapple).catch(() => {});
        return;
      }
      if (retriesLeft > 0) {
        const rid = setTimeout(() => tryPick(retriesLeft - 1), 1000);
        pendingBotTimeoutsRef.current.push(rid);
      }
    };
    const tid = setTimeout(() => tryPick(20), delay);
    pendingBotTimeoutsRef.current.push(tid);
  };

  const handleCreateGame = async () => {
    setIsLoading(true);
    try {
      const username = user?.username || user?.email?.split('@')[0] || 'Player';
      const result = await gameService.createGame(user.uid, username, selectedRounds);
      if (result.success) {
        setGameId(result.gameId);
      } else {
        showError('Error', result.error);
      }
    } catch (error) {
      showError('Error', 'Failed to create game');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindGame = async () => {
    setIsLoading(true);
    try {
      const findResult = await gameService.findOpenGame(user.uid);
      if (findResult.success) {
        const username = user?.username || user?.email?.split('@')[0] || 'Player';
        const joinResult = await gameService.joinGame(findResult.gameId, user.uid, username);
        if (joinResult.success) {
          setGameId(findResult.gameId);
        }
      } else {
        showAlert('No Games', 'No open games found. Create one!');
      }
    } catch (error) {
      showError('Error', 'Failed to find game');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddBot = async () => {
    if (!gameId || !game) return;
    const currentPlayers = game.players.length;
    if (currentPlayers >= gameService.MAX_PLAYERS) return;
    const botPool = ['SnapBot', 'VibeMaster', 'CardShark', 'PixelPro', 'ClipKing'];
    const existingBots = game.players.filter(p => p.uid?.startsWith('bot_')).length;
    const botName = botPool[existingBots] || `Bot${existingBots + 1}`;
    await gameService.joinGame(gameId, `bot_${botName}`, botName);
  };

  const handleStartGame = async () => {
    try {
      // Game length is now driven by play-to target points, not round
      // count, so we always seed a 25-prompt buffer; nextRound refills
      // if the game runs longer.
      const prompts = await gameService.getGamePrompts(25);
      const result = await gameService.startGame(gameId, user.uid, prompts);
      if (result.success) {
        // Hand is drawn by the phase-change effect once PICKING starts,
        // using the mixed pool from getHandSnapples(). Drawing here too
        // would race the effect and swap the visible cards mid-warmup.
        // Bots are scheduled by a phase-change effect once PICKING starts.
      } else {
        showError('Error', result.error);
      }
    } catch (error) {
      showError('Error', 'Failed to start game');
    }
  };

  const handlePractice = async () => {
    setIsLoading(true);
    setIsPractice(true);
    // Note: no longer force useRandomCards true here. Practice uses the
    // same always-mix pool (mySnapples + community) so the user's own
    // snapples show up in their hand alongside community cards.
    try {
      const username = user?.username || user?.email?.split('@')[0] || 'Player';
      const createResult = await gameService.createGame(user.uid, username, selectedRounds);
      if (!createResult.success) {
        showError('Error', createResult.error);
        return;
      }
      setGameId(createResult.gameId);

      // Add fake bot players
      // 5 bots + the user = 6 players total. Caps the picking-grid at
      // two rows of 3 cards — no awkward third row.
      const botNames = ['SnapBot', 'VibeMaster', 'CardShark', 'PromptKing', 'NoFilter'];
      for (const name of botNames) {
        await gameService.joinGame(createResult.gameId, `bot_${name}`, name);
      }

      // Start immediately. Always seed a 25-prompt buffer regardless
      // of target since game length is variable in vote-scoring mode.
      const prompts = await gameService.getGamePrompts(25);

      await gameService.startGame(createResult.gameId, user.uid, prompts);

      // Hand is drawn by the phase-change effect once PICKING starts,
      // using the mixed pool from getHandSnapples(). Drawing here too
      // would race the effect and the visible cards would swap during
      // warmup (community-only set X → mixed-pool set Y).
      // Bots are scheduled by a phase-change effect once PICKING starts.
    } catch (error) {
      showError('Error', 'Failed to start practice');
    } finally {
      setIsLoading(false);
    }
  };

  // Tutorial mode = practice game + tap-to-dismiss tip on each phase.
  // Same setup path as practice so bots + hand + prompts are identical.
  const handleTutorial = async () => {
    setIsTutorial(true);
    await handlePractice();
  };

  const handlePickCard = async (snapple) => {
    setSelectedCard(snapple);
    try {
      await gameService.submitPick(gameId, user.uid, snapple);
      setPlayedCardIds(prev => prev.includes(snapple.id) ? prev : [...prev, snapple.id]);
    } catch (error) {
      showError('Error', 'Failed to submit pick');
      setSelectedCard(null);
    }
  };

  // Mulligan swap — replaces a hand card with a random unplayed snapple
  // from the user's deck and decrements their inventory. Used inline by
  // PickingPhase via the onMulliganSwap prop.
  const handleMulliganSwap = async (card) => {
    const remaining = mySnapples.filter(s => !hand.some(h => h.id === s.id));
    if (remaining.length === 0) {
      showAlert('No Cards', 'No more cards to draw from your deck');
      setMulliganMode(false);
      return;
    }
    const newCard = remaining[Math.floor(Math.random() * remaining.length)];
    setHand(prev => prev.map(h => (h.id === card.id ? newCard : h)));
    setMulliganMode(false);
    try {
      const { doc: mDoc, updateDoc: mUpdate, increment: mInc } = await import('firebase/firestore');
      const { db: mDb } = await import('../services/firebase');
      await mUpdate(mDoc(mDb, 'users', user.uid), {
        'inventory.mulligans': mInc(-1),
      });
    } catch (e) {}
    showToast('reward', 'Mulligan!', 'Card swapped');
  };

  // Admin: replace the current round's prompt with a fresh one from
  // the pool and restart the picking phase. Round-local — the prompt
  // stays in Firestore, just gets swapped for this round.
  const handleDeletePrompt = async () => {
    setIsEditingPrompt(false);
    const result = await gameService.replaceAndRestartRound(gameId, game.currentRound - 1);
    if (!result?.success) showError('Error', result?.error || 'Failed to replace prompt');
  };

  // Admin: hard-delete the current prompt from the gamePrompts pool
  // AND swap in a fresh one for the round. Uses the current prompt
  // text to look up the doc since game.prompts stores plain strings.
  const handleTrueDeletePrompt = async () => {
    setIsEditingPrompt(false);
    const currentText = game?.prompts?.[game.currentRound - 1];
    try {
      if (currentText) {
        const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        const { deletePrompt } = await import('../services/promptAdminService');
        const q = query(
          collection(db, 'gamePrompts'),
          where('text', '==', currentText),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          await deletePrompt('gamePrompts', snap.docs[0].id);
        }
      }
    } catch (e) {
      // Non-fatal — still swap the prompt for the round so play
      // continues even if the pool delete failed.
      console.warn('[GameScreen] deletePrompt failed', e);
    }
    const result = await gameService.replaceAndRestartRound(gameId, game.currentRound - 1);
    if (!result?.success) showError('Error', result?.error || 'Failed to replace prompt');
  };

  // Admin: save the edited prompt text in place (no round restart).
  const handleSavePrompt = async () => {
    const text = editPromptText.trim();
    if (!text) return;
    setIsEditingPrompt(false);
    const result = await gameService.editRoundPrompt(gameId, game.currentRound - 1, text);
    if (!result?.success) showError('Error', result?.error || 'Failed to save prompt');
  };

  const [favoriteCard, setFavoriteCard] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);

  const handleSubmitVote = async () => {
    if (!game || !favoriteCard || hasVoted) return;

    // Submit vote first; only mark hasVoted on success so a network failure
    // doesn't lock the user into a fake "submitted" state. Bot votes are
    // scheduled separately by the phase=VOTING effect with random delays
    // so the auras pulse in over a few seconds instead of all at once.
    const result = await gameService.castVote(gameId, user.uid, favoriteCard.uid);
    if (!result?.success) {
      showError('Vote Failed', result?.error || 'Could not submit vote — try again.');
      return;
    }
    setHasVoted(true);
  };

  const handleNextRound = async () => {
    // Swap the just-played card for one new one from the unused pool — keeps
    // the rest of the hand intact between rounds rather than redrawing all 6.
    const playedThisRound = selectedCard;
    setSelectedCard(null);
    setCurrentVoteIndex(0);
    setFavoriteCard(null);
    setHasVoted(false);
    setMulliganMode(false);

    if (playedThisRound) {
      setHand(prev => {
        const inHandIds = new Set(prev.map(h => h.id));
        const pool = getHandSnapples().filter(s => !inHandIds.has(s.id));
        const replacement = pool[Math.floor(Math.random() * pool.length)];
        if (!replacement) return prev.filter(h => h.id !== playedThisRound.id);
        return prev.map(h => h.id === playedThisRound.id ? replacement : h);
      });
    }

    if (game.hostId === user.uid) {
      await gameService.nextRound(gameId);
      // Bots are scheduled by a phase-change effect once PICKING starts.
    }
  };

  const handleSpectate = async () => {
    setIsLoading(true);
    try {
      const result = await gameService.findActiveGames(10);
      if (result.success && result.games.length > 0) {
        // Join first active game as spectator
        setIsSpectating(true);
        setGameId(result.games[0].id);
      } else {
        showAlert('No Games', 'No active games to watch right now');
      }
    } catch (e) {
      showError('Error', 'Failed to find games');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveGame = async () => {
    unsubscribeRef.current?.();
    if (gameId && !isSpectating) {
      await gameService.leaveGame(gameId, user.uid);
    }
    setGameId(null);
    setGame(null);
    setHand([]);
    setSelectedCard(null);
    setCurrentVoteIndex(0);
    setIsSpectating(false);
    setPlayedCardIds([]);
    setMulliganMode(false);
  };

  const handleFinish = async () => {
    if (game && user?.uid) {
      const rewards = gameService.calculateRewards(game.players);
      const myReward = rewards.find(r => r.uid === user.uid);

      if (myReward) {
        try {
          const { default: levelService } = await import('../services/levelService');
          const myLevel = levelService.getLevelFromXP(user?.profile?.experience || 0);
          const opponentLevels = game.players
            .filter(p => p.uid !== user.uid && !p.uid?.startsWith('bot_'))
            .map(() => 1); // TODO: track player levels in game doc

          // XP only flows from ranked games. Same gating as trophies — until
          // ranked exists, custom + practice award nothing. When ranked ships,
          // condition this on a `ranked` flag stored on the game doc.
          let xpEarned = 0;
          // Trophies only flow from ranked games. Ranked isn't implemented yet
          // so for now: practice and custom both award zero. When ranked ships,
          // gate this on a `ranked` flag stored on the game doc.
          let trophiesEarned = 0;
          let coinsEarned = myReward.coinsEarned || 0;

          const { doc, updateDoc, increment, getDoc } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');

          // Check active boosts
          const boostSnap = await getDoc(doc(db, 'users', user.uid));
          const boosts = boostSnap.data()?.boosts || {};
          const now = new Date().toISOString();
          if (boosts.xpBoost && boosts.xpBoost > now) {
            xpEarned = xpEarned * 2;
          }
          if (boosts.trophyBoost && boosts.trophyBoost > now && trophiesEarned > 0) {
            trophiesEarned = trophiesEarned * 2;
          }

          // Check shield — block trophy loss
          const inventory = boostSnap.data()?.inventory || {};
          let shieldUsed = false;
          if (trophiesEarned < 0 && (inventory.shields || 0) > 0) {
            trophiesEarned = 0;
            shieldUsed = true;
          }

          // Build the commit function — runs at the apex of the fly animation
          // so resource bar values tick up as icons land. Uses Firestore
          // increments for atomicity (no read-then-write race when the user
          // currency listener is mid-update). All resource/stat changes go
          // through one updateDoc so the AuthContext listener fires once
          // with the full new state.
          const userRef = doc(db, 'users', user.uid);
          const commit = async () => {
            try {
              const updates = {
                'profile.experience': increment(xpEarned),
                'profile.xp': increment(xpEarned),
                'stats.gamesPlayed': increment(1),
                'stats.totalCoinsEarned': increment(coinsEarned),
              };
              if (myReward.placement === 1) {
                updates['stats.gamesWon'] = increment(1);
              }
              if (coinsEarned > 0) {
                updates['resources.coins'] = increment(coinsEarned);
              }
              if (trophiesEarned !== 0) {
                updates['resources.trophies'] = increment(trophiesEarned);
              }
              if (shieldUsed) {
                updates['inventory.shields'] = increment(-1);
              }
              await updateDoc(userRef, updates);

              // Win streak — read-then-write, separate doc update.
              if (myReward.placement === 1) {
                const afterSnap = await getDoc(userRef);
                const streak = (afterSnap.data()?.stats?.winStreak || 0) + 1;
                await updateDoc(userRef, { 'stats.winStreak': streak });
              } else {
                await updateDoc(userRef, { 'stats.winStreak': 0 });
              }
            } catch (e) {
              console.error('[GameScreen] commit error:', e);
            }
          };

          // Tear down the game first so the user lands on the lobby (with the
          // resource bar visible) BEFORE the claim modal opens. Otherwise the
          // fly icons have nowhere to land.
          unsubscribeRef.current?.();
          if (gameId && game) {
            try {
              const { doc: docRef, setDoc, deleteDoc } = await import('firebase/firestore');
              const { db: db2 } = await import('../services/firebase');
              await setDoc(docRef(db2, 'gameHistory', gameId), {
                ...game,
                finishedAt: new Date().toISOString(),
              });
              await deleteDoc(docRef(db2, 'games', gameId));
            } catch (e) {
              console.error('[GameScreen] Error archiving game:', e);
            }
          }
          setGameId(null);
          setGame(null);
          setHand([]);
          setSelectedCard(null);
          setCurrentVoteIndex(0);
          setIsSpectating(false);
          setIsPractice(false);
          setIsTutorial(false);
          setPlayedCardIds([]);
          setMulliganMode(false);

          // Brief beat so the lobby paints + resource bar mounts before the
          // claim modal opens on top of it.
          await new Promise(r => setTimeout(r, 250));

          await claimRewards({
            title: 'Game Over',
            subtitle: `#${myReward.placement} place`,
            rewards: {
              coins: coinsEarned,
              trophies: trophiesEarned,
              xp: xpEarned,
            },
            commit,
          });

          if (shieldUsed) {
            showToast('reward', 'Shield Used!', 'Trophy loss blocked');
          }

          // Level up check
          const afterLevel = levelService.getLevelFromXP((user?.profile?.experience || 0) + xpEarned);
          if (afterLevel > myLevel) {
            setTimeout(() => showToast('level_up', `Level ${afterLevel}!`, `${levelService.xpForLevel(afterLevel + 1)} XP to next level`), 400);
          }

          // Win streak toast
          if (myReward.placement === 1) {
            const afterSnap = await getDoc(userRef);
            const streak = (afterSnap.data()?.stats?.winStreak || 0);
            if (streak >= 3) {
              setTimeout(() => showToast('streak', `${streak} Win Streak!`, 'Keep it going!'), 1000);
            }
          }

          // Check achievements
          try {
            const { default: achievementService } = await import('../services/achievementService');
            const afterSnap = await getDoc(userRef);
            const afterData = afterSnap.data();
            const stats = {
              ...(afterData?.stats || {}),
              level: afterLevel,
              trophies: afterData?.resources?.trophies || 0,
            };
            const newAchievements = await achievementService.checkAndAward(user.uid, stats);
            newAchievements.forEach((a, i) => {
              const ach = [];
              if (a.coins) ach.push(`+${a.coins}c`);
              if (a.xp) ach.push(`+${a.xp}xp`);
              if (a.trophies) ach.push(`+${a.trophies}t`);
              setTimeout(() => showToast('achievement', a.name, ach.join(' ')), 1800 + i * 1500);
            });
          } catch (e) {}
        } catch (e) {
          console.error('[GameScreen] handleFinish error:', e);
        }
      }
    }
  };

  // ── RENDER PHASES ──

  // No game — show lobby options
  if (!gameId || !game) {
    return (
      <AppLayout navigation={navigation} active="play">
        <View style={styles.lobbyContent}>
          <Ionicons name="game-controller" size={64} color={theme.colors.vibeBlue} />
          <Text style={styles.lobbyTitle}>Snappled</Text>

          {/* Deck choice */}
          {hasDeck && (
            <View style={styles.deckChoice}>
              <Pressable
                style={[styles.deckOption, !useRandomCards && styles.deckOptionActive]}
                onPress={() => setUseRandomCards(false)}
              >
                <Text style={[styles.deckOptionText, !useRandomCards && styles.deckOptionTextActive]}>My Deck</Text>
              </Pressable>
              <Pressable
                style={[styles.deckOption, useRandomCards && styles.deckOptionActive]}
                onPress={() => setUseRandomCards(true)}
              >
                <Text style={[styles.deckOptionText, useRandomCards && styles.deckOptionTextActive]}>Random Cards</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.lobbyButtons}>
            <VibeButton
              label="Ranked"
              onPress={() => showAlert('Coming Soon', 'Ranked matches will be available soon!')}
              color="yellow"
            />
            <VibeButton
              label="Custom"
              onPress={() => showAlert(
                'Custom Game',
                'Create your own or find an open game.',
                [
                  { text: 'Create Game', onPress: handleCreateGame },
                  { text: 'Find Game', onPress: handleFindGame },
                ],
              )}
              variant="toggle"
              color="blue"
              disabled={isLoading}
            />
            <VibeButton
              label={isLoading ? "Loading..." : "Practice (Solo)"}
              onPress={handlePractice}
              variant="toggle"
              color="cyan"
              disabled={isLoading || allSnapples.length < 4}
            />
            <VibeButton
              label="How to Play (Tutorial)"
              onPress={handleTutorial}
              variant="toggle"
              color="pink"
              disabled={isLoading || allSnapples.length < 4}
            />
          </View>

          {allSnapples.length < 4 && (
            <Text style={styles.warningText}>
              Need at least 4 snapples in the community to play
            </Text>
          )}

          <Pressable style={styles.spectateBtn} onPress={handleSpectate}>
            <Ionicons name="eye" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.spectateText}>Spectate a Game</Text>
          </Pressable>
        </View>

      </AppLayout>
    );
  }

  // Lobby — waiting for players
  if (game.phase === GAME_PHASES.LOBBY) {
    return (
      <LobbyPhase
        game={game}
        gameId={gameId}
        isHost={game.hostId === user.uid}
        onLeave={handleLeaveGame}
        onAddBot={handleAddBot}
        onStartGame={handleStartGame}
        onSetRounds={(n) => gameService.setTotalRounds(gameId, n)}
      />
    );
  }

  // Loading phase — pre-download every video in the drawn hand so the
  // warmup timer isn't fighting for bandwidth with the video prefetch.
  // Only the host advances the doc to REVIEW; other clients wait for
  // the phase transition to propagate.
  if (game.phase === GAME_PHASES.LOADING) {
    const isHostClient = game.hostId === user?.uid;
    const advance = () => {
      if (isHostClient) gameService.startWarmup(gameId);
    };
    return (
      <LoadingPhase hand={hand} onLoaded={advance} />
    );
  }

  // Review phase — show the prompt + your hand before picking starts so
  // players can scout. Auto-advances to PICKING when the timer runs out;
  // host can also start early.
  if (game.phase === GAME_PHASES.REVIEW) {
    return (
      <>
        <WarmupPhase
          hand={hand}
          timer={timer}
          readyMap={game.ready || {}}
          players={game.players || []}
          selfUid={user?.uid}
          previewCard={previewCard}
          currentPrompt={game.prompts[game.currentRound - 1] || 'Show us something!'}
          onLeave={handleLeaveGame}
          onPreviewCard={(card) => setPreviewCard(card)}
          onClosePreview={() => setPreviewCard(null)}
          onToggleReady={(isReady) => gameService.setPlayerReady(gameId, user.uid, isReady)}
          onHelp={showPhaseHelp} onHelpEnd={hidePhaseHelp}
          onCreatorPress={handleCreatorPress}
          isAdmin={isAdmin}
          onExcludeFromPool={handleExcludeFromPool}
        />
        <RoundStartOverlay
          visible={!!roundAlert}
          title={roundAlert?.title}
          sub={roundAlert?.sub}
          bullets={roundAlert?.bullets}
          onDismiss={() => setRoundAlert(null)}
        />
        <TutorialOverlay tip={tutorialTip} onDismiss={dismissTutorialTip} />
      </>
    );
  }

  // Picking phase — choose a card from your hand
  if (game.phase === GAME_PHASES.PICKING) {
    return (
      <>
        <PickingPhase
        game={game}
        gameId={gameId}
        user={user}
        userCurrency={userCurrency}
        hand={hand}
        isAdmin={isAdmin}
        isHost={game.hostId === user.uid}
        isPractice={isPractice}
        timer={timer}
        selectedCard={selectedCard}
        previewCard={previewCard}
        mulliganMode={mulliganMode}
        isEditingPrompt={isEditingPrompt}
        editPromptText={editPromptText}
        showToast={showToast}
        showError={showError}
        onLeave={handleLeaveGame}
        onPreviewCard={(card) => setPreviewCard(card)}
        onClosePreview={() => setPreviewCard(null)}
        onSelectCard={(card) => setSelectedCard(card)}
        onPickCard={(card) => {
          handlePickCard(card);
          setPreviewCard(null);
        }}
        onCreatorPress={handleCreatorPress}
        onMulliganToggle={() => setMulliganMode(prev => !prev)}
        onMulliganSwap={handleMulliganSwap}
        onEditPromptOpen={(promptText) => {
          setEditPromptText(promptText);
          setIsEditingPrompt(true);
        }}
        onEditPromptClose={() => setIsEditingPrompt(false)}
        onEditPromptTextChange={setEditPromptText}
        onEditPromptSave={handleSavePrompt}
        onDeletePrompt={handleDeletePrompt}
        onTrueDeletePrompt={handleTrueDeletePrompt}
        onExcludeFromPool={handleExcludeFromPool}
        onHelp={showPhaseHelp} onHelpEnd={hidePhaseHelp}
        />
        <RoundStartOverlay
          visible={!!roundAlert}
          title={roundAlert?.title}
          sub={roundAlert?.sub}
          bullets={roundAlert?.bullets}
          onDismiss={() => setRoundAlert(null)}
        />
        <TutorialOverlay tip={tutorialTip} onDismiss={dismissTutorialTip} />
      </>
    );
  }

  // Voting phase — pick your favorite from all submissions
  if (game.phase === GAME_PHASES.VOTING) {
    const votableSubmissions = isSpectating
      ? game.submissions
      : game.submissions.filter(s => s.uid !== user.uid);

    return (
      <LinearGradient colors={theme.colors.gameBackgroundGradient} style={styles.container}>
        <RoundHeaderBar phase="voting" timerSec={timer} onHelp={showPhaseHelp} onHelpEnd={hidePhaseHelp} />
        {isSpectating && (
          <View style={styles.spectateBanner}>
            <Ionicons name="eye" size={14} color={theme.colors.vibeBlue} />
            <Text style={styles.spectateBannerText}>Spectating — {game.players.length} players</Text>
          </View>
        )}

        <RoundPromptBanner
          prompt={game.prompts[game.currentRound - 1]}
          round={game.currentRound}
          totalRounds={game.totalRounds || null}
        />

        {hasVoted ? (
          // Vote-submitted wait screen — unified grid of all snapples,
          // each card same size with a multi-color vote aura around its
          // video and colored-border name chips below. Auras populate as
          // bots/players cast votes (see scheduleBotVote effect). Self
          // always renders in vibeGreen so the user can spot their own
          // pick by the green stripe in its aura.
          (() => {
            const votedUids = new Set(Object.values(game.votes || {}).flat());
            const sortedPlayers = [...(game.players || [])].sort(
              (a, b) => (b.points || 0) - (a.points || 0)
            );

            // Per-player color map: self → vibeGreen, others cycle through
            // VOTER_PALETTE in players-array order.
            const playerColors = new Map();
            let paletteIdx = 0;
            (game.players || []).forEach(p => {
              if (p.uid === user?.uid) {
                playerColors.set(p.uid, theme.colors.vibeGreen);
              } else {
                playerColors.set(p.uid, VOTER_PALETTE[paletteIdx % VOTER_PALETTE.length]);
                paletteIdx++;
              }
            });

            const buildVoters = (subUid) => {
              const ids = (game.votes?.[subUid] || []);
              return ids.map(vid => ({
                uid: vid,
                name: (game.players || []).find(p => p.uid === vid)?.username || vid?.slice(0, 4),
                color: playerColors.get(vid) || theme.colors.textSecondary,
                isMe: vid === user?.uid,
              }));
            };

            const pending = (game.players || []).filter(p => !votedUids.has(p.uid));
            return (
              <View style={styles.pickedWaitWrap}>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.pickedWaitContent}
                  showsVerticalScrollIndicator={false}
                >
                  <VotingWaitGrid
                    submissions={game.submissions || []}
                    voters={buildVoters}
                    players={game.players || []}
                    playerColors={playerColors}
                    selfUid={user?.uid}
                    allVotedIn={votedUids.size === (game.players || []).length && (game.players || []).length > 0}
                    onPressCard={(sub) => setPreviewCard({ ...sub, _isVoting: true })}
                  />
                </ScrollView>

                {/* Pinned footer — outside the ScrollView so it stays
                    anchored to the bottom regardless of how many
                    snapples are in the grid. */}
                <View style={styles.waitingFooter}>
                  {pending.length > 0 && (
                    <View style={styles.waitingOnNames}>
                      <Text style={styles.waitingOnPrefix}>Waiting on </Text>
                      {pending.map((p, idx) => (
                        <Text
                          key={p.uid}
                          style={[
                            styles.waitingOnName,
                            { color: playerColors.get(p.uid) || theme.colors.textSecondary },
                          ]}
                        >
                          {p.username}{idx < pending.length - 1 ? ', ' : ''}
                        </Text>
                      ))}
                    </View>
                  )}
                  <View style={styles.waitingActionRow}>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => setShowScoreboard(true)}
                    >
                      <Ionicons name="menu" size={22} color={theme.colors.vibeBlue} />
                    </Pressable>
                    <Text style={styles.waitingOnLabel}>
                      {votedUids.size} of {(game.players || []).length} voted
                    </Text>
                    {game.hostId === user?.uid ? (
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => {
                          finishScheduledRoundRef.current = game.currentRound;
                          gameService.finishRound(gameId).catch(() => {});
                        }}
                      >
                        <Ionicons name="arrow-forward" size={22} color={theme.colors.vibeBlue} />
                      </Pressable>
                    ) : (
                      <View style={{ width: 40, height: 40 }} />
                    )}
                  </View>
                </View>
              </View>
            );
          })()
        ) : (
          <>
            {/* 2-col scroll grid using HandCardThumbnail — same shape
                as the picking hand so cards look identical across
                phases. Creator names are hidden during voting (kept
                anonymous with "@anon") and reveal on scoring. */}
            <ScrollView
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.votingGrid}>
                {votableSubmissions.map((item, i) => {
                  const isSelected = favoriteCard?.uid === item.uid;
                  // Key on the submitter's uid — snappleId collides
                  // when two players play the same snapple, and both
                  // cards' inline players would fire together.
                  const cardId = item?.uid || item?.snappleId || `vote-${i}`;
                  const isInlinePlaying = votingInlinePlaying.id === cardId;
                  return (
                    <View
                      key={cardId}
                      style={styles.votingCell}
                    >
                      <HandCardThumbnail
                        card={{
                          id: cardId,
                          videoUrl: item.videoUrl,
                          creatorId: item.creatorId,
                          creatorUsername: item.creatorUsername,
                          muted: item.muted,
                        }}
                        isSelected={isSelected}
                        isPlaying={isInlinePlaying}
                        playToken={isInlinePlaying ? votingInlinePlaying.token : 0}
                        onCreatorPress={handleCreatorPress}
                        onTogglePlay={() => {
                          // Select this card as the favorite AND
                          // play it inline once. Re-tap the same
                          // card pauses (unmounts the player).
                          setFavoriteCard(item);
                          setVotingInlinePlaying(prev => {
                            if (prev.id === cardId) return { id: null, token: prev.token };
                            return { id: cardId, token: prev.token + 1 };
                          });
                        }}
                        onFullscreen={() => {
                          setVotingInlinePlaying({ id: null, token: 0 });
                          setFavoriteCard(item);
                          setPreviewCard({ ...item, videoUrl: item.videoUrl, _isVoting: true });
                        }}
                      />
                    </View>
                  );
                })}
                {votableSubmissions.length % 2 === 1 && <View style={styles.votingCell} />}
              </View>
            </ScrollView>
            {favoriteCard ? (
              <View style={styles.actionRow}>
                <BackChunk
                  onPress={() => setFavoriteCard(null)}
                  style={styles.actionBackFlex}
                />
                <ShimmerBar
                  colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
                  label="SUBMIT VOTE"
                  onPress={handleSubmitVote}
                  style={styles.actionSubmitChunk}
                />
              </View>
            ) : (
              <ShimmerBar
                colors={[theme.colors.vibeBlue, theme.colors.vibeNeonPurple]}
                label="PICK A FAVORITE"
              />
            )}
          </>
        )}

        {/* Card Preview Modal — full-bleed video + fat cyan action bar.
            Voting variant swaps the CTA to PICK AS FAVORITE and hides
            it if the user has already voted. */}
        {previewCard && previewCard._isVoting && (
          <PreviewModal
            visible
            videoUrl={previewCard.videoUrl}
            muted={!!previewCard.muted}
            onClose={() => setPreviewCard(null)}
            primaryLabel={hasVoted ? null : 'PICK AS FAVORITE'}
            onPrimary={() => {
              setFavoriteCard(previewCard);
              setPreviewCard(null);
            }}
            topRightSlot={
              isAdmin && previewCard.snappleId ? (
                <Pressable
                  style={adminGameStyles.poolNukeBtn}
                  onPress={() => {
                    handleExcludeFromPool(previewCard.snappleId);
                    setPreviewCard(null);
                  }}
                >
                  <Ionicons name="eye-off" size={16} color={theme.colors.vibeRed} />
                  <Text style={adminGameStyles.poolNukeText}>Exclude</Text>
                </Pressable>
              ) : null
            }
            overlaySlot={
              <CreatorActionRow
                submission={previewCard}
                currentUser={user}
                ownedSnappleIds={userCurrency.ownedSnapples || []}
                wishlistedSnappleIds={userCurrency.wishlistedSnapples || []}
                showToast={showToast}
                showError={showError}
              />
            }
          />
        )}

        {/* Scoreboard modal — opens from the wait-screen Scoreboard
            button. Shows the current standings sorted by score, with a
            colored left-bar matching each player's vote color. Voted
            status shows a checkmark. */}
        {showScoreboard && (() => {
          const votedUidsSb = new Set(Object.values(game.votes || {}).flat());
          const scoreboardPlayers = [...(game.players || [])].sort(
            (a, b) => (b.points || 0) - (a.points || 0)
          );
          const colorsSb = new Map();
          let pi = 0;
          (game.players || []).forEach(p => {
            if (p.uid === user?.uid) {
              colorsSb.set(p.uid, theme.colors.vibeGreen);
            } else {
              colorsSb.set(p.uid, VOTER_PALETTE[pi % VOTER_PALETTE.length]);
              pi++;
            }
          });
          return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setShowScoreboard(false)}>
              <Pressable style={styles.scoreboardOverlay} onPress={() => setShowScoreboard(false)}>
                <Pressable style={styles.scoreboardCard} onPress={() => {}}>
                  <Text style={styles.scoreboardTitle}>SCOREBOARD</Text>
                  {scoreboardPlayers.map((p, i) => {
                    const color = colorsSb.get(p.uid) || theme.colors.textSecondary;
                    const voted = votedUidsSb.has(p.uid);
                    const isMe = p.uid === user?.uid;
                    return (
                      <View key={p.uid} style={[styles.scoreboardRow, { borderLeftColor: color }]}>
                        <Text style={styles.scoreboardPlace}>#{i + 1}</Text>
                        <Text style={[styles.scoreboardName, isMe && { color: theme.colors.vibeGreen }]} numberOfLines={1}>
                          {p.username}
                        </Text>
                        <Text style={styles.scoreboardPts}>{p.points || 0} pts</Text>
                        <Ionicons
                          name={voted ? 'checkmark-circle' : 'time-outline'}
                          size={16}
                          color={voted ? theme.colors.vibeGreen : theme.colors.textSecondary}
                        />
                      </View>
                    );
                  })}
                  <Pressable style={styles.scoreboardClose} onPress={() => setShowScoreboard(false)}>
                    <Text style={styles.scoreboardCloseText}>Close</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          );
        })()}
        <RoundStartOverlay
          visible={!!roundAlert}
          title={roundAlert?.title}
          sub={roundAlert?.sub}
          bullets={roundAlert?.bullets}
          onDismiss={() => setRoundAlert(null)}
        />
        <TutorialOverlay tip={tutorialTip} onDismiss={dismissTutorialTip} />
      </LinearGradient>
    );
  }

  // Scoring — breather between voting and the scoreboard. Reuses the
  // voting-wait grid (cards + voter auras + picker names already
  // visible at this point) but adds crowns on round-winning cards and
  // a "+N" chip on each card showing the points it earned. Gives
  // players time to see who voted for what before the scoreboard pops.
  if (game.phase === GAME_PHASES.SCORING) {
    const isHost = game.hostId === user?.uid;
    const lastRoundResult = game.roundResults?.[game.roundResults.length - 1];
    const rankings = lastRoundResult?.rankings || [];
    const winnerUids = new Set(rankings.filter(r => r.placement === 1).map(r => r.uid));
    const pointsByUid = new Map(rankings.map(r => [r.uid, r.pointsEarned || 0]));

    // Per-player color map mirrors the voting wait so chip / aura
    // colors stay consistent across the round.
    const playerColors = new Map();
    let paletteIdx = 0;
    (game.players || []).forEach(p => {
      if (p.uid === user?.uid) {
        playerColors.set(p.uid, theme.colors.vibeGreen);
      } else {
        playerColors.set(p.uid, VOTER_PALETTE[paletteIdx % VOTER_PALETTE.length]);
        paletteIdx++;
      }
    });

    const buildVoters = (subUid) => {
      const ids = (game.votes?.[subUid] || []);
      return ids.map(vid => ({
        uid: vid,
        name: (game.players || []).find(p => p.uid === vid)?.username || vid?.slice(0, 4),
        color: playerColors.get(vid) || theme.colors.textSecondary,
        isMe: vid === user?.uid,
      }));
    };

    const winnerNames = rankings
      .filter(r => r.placement === 1)
      .map(r => (game.players || []).find(p => p.uid === r.uid)?.username || 'Anon');
    const topVotes = rankings.find(r => r.placement === 1)?.votes ?? 0;

    return (
      <LinearGradient colors={theme.colors.gameBackgroundGradient} style={styles.container}>
        <RoundHeaderBar phase="scoring" timerSec={timer} onHelp={showPhaseHelp} onHelpEnd={hidePhaseHelp} />

        {/* Prompt banner during scoring — winner banner removed per
            user ask. The crown badge on the winning card + points
            chip already surface the winner without a duplicate
            headline. */}
        <RoundPromptBanner
          prompt={game.prompts[game.currentRound - 1]}
          round={game.currentRound}
          totalRounds={game.totalRounds || null}
        />

        <View style={styles.pickedWaitWrap}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.pickedWaitContent}
            showsVerticalScrollIndicator={false}
          >
            <VotingWaitGrid
              variant="large"
              submissions={game.submissions || []}
              voters={buildVoters}
              players={game.players || []}
              playerColors={playerColors}
              selfUid={user?.uid}
              allVotedIn={true}
              onPressCard={() => {}}
              winnerUids={winnerUids}
              pointsByUid={pointsByUid}
              inlinePlayingId={scoringInlinePlaying.id}
              playToken={scoringInlinePlaying.token}
              onTogglePlay={(sub) => {
                setScoringInlinePlaying(prev => {
                  if (prev.id === sub.uid) return { id: null, token: prev.token };
                  return { id: sub.uid, token: prev.token + 1 };
                });
              }}
              onFullscreen={(sub) => {
                setScoringInlinePlaying({ id: null, token: 0 });
                setPreviewCard({ ...sub, videoUrl: sub.videoUrl, _isVoting: true });
              }}
            />
          </ScrollView>
        </View>

        {/* Host skip — end the current round early instead of
            waiting out the scoring timer. Advances the game to the
            SCORE (round-results) phase. Uses the ShimmerBar CTA
            treatment (green → cyan, same palette as PLAY THIS CARD /
            SUBMIT VOTE) so the "ready to advance" energy is
            consistent across the game. */}
        {isHost && (
          <ShimmerBar
            colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
            label="END ROUND"
            onPress={() => gameService.enterRoundResults(gameId)}
          />
        )}

        {/* Scoreboard modal — opened from the header podium icon.
            Mirrors the VOTING phase's scoreboard so the look stays
            consistent across phases. */}
        {showScoreboard && (() => {
          const scoreboardPlayers = [...(game.players || [])].sort(
            (a, b) => (b.points || 0) - (a.points || 0)
          );
          return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setShowScoreboard(false)}>
              <Pressable style={styles.scoreboardOverlay} onPress={() => setShowScoreboard(false)}>
                <Pressable style={styles.scoreboardCard} onPress={() => {}}>
                  <Text style={styles.scoreboardTitle}>SCOREBOARD</Text>
                  {scoreboardPlayers.map((p, i) => {
                    const color = playerColors.get(p.uid) || theme.colors.textSecondary;
                    const isMe = p.uid === user?.uid;
                    return (
                      <View key={p.uid} style={[styles.scoreboardRow, { borderLeftColor: color }]}>
                        <Text style={styles.scoreboardPlace}>#{i + 1}</Text>
                        <Text style={[styles.scoreboardName, isMe && { color: theme.colors.vibeGreen }]} numberOfLines={1}>
                          {p.username}
                        </Text>
                        <Text style={styles.scoreboardPts}>{p.points || 0} pts</Text>
                      </View>
                    );
                  })}
                  <Pressable style={styles.scoreboardClose} onPress={() => setShowScoreboard(false)}>
                    <Text style={styles.scoreboardCloseText}>Close</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          );
        })()}
        {/* Fullscreen preview — mirrors the voting branch's modal so
            the scoring expand chip actually opens a full player with
            the follow/save/buy/report rail. `_isVoting: true` reuses
            the voting flow but with the CTA hidden (voting closed). */}
        {previewCard && previewCard._isVoting && (
          <PreviewModal
            visible
            videoUrl={previewCard.videoUrl}
            muted={!!previewCard.muted}
            onClose={() => setPreviewCard(null)}
            primaryLabel={null}
            topRightSlot={
              isAdmin && previewCard.snappleId ? (
                <Pressable
                  style={adminGameStyles.poolNukeBtn}
                  onPress={() => {
                    handleExcludeFromPool(previewCard.snappleId);
                    setPreviewCard(null);
                  }}
                >
                  <Ionicons name="eye-off" size={16} color={theme.colors.vibeRed} />
                  <Text style={adminGameStyles.poolNukeText}>Exclude</Text>
                </Pressable>
              ) : null
            }
            overlaySlot={
              <CreatorActionRow
                submission={previewCard}
                currentUser={user}
                ownedSnappleIds={userCurrency.ownedSnapples || []}
                wishlistedSnappleIds={userCurrency.wishlistedSnapples || []}
                showToast={showToast}
                showError={showError}
              />
            }
          />
        )}
        <RoundStartOverlay
          visible={!!roundAlert}
          title={roundAlert?.title}
          sub={roundAlert?.sub}
          bullets={roundAlert?.bullets}
          onDismiss={() => setRoundAlert(null)}
        />
        <TutorialOverlay tip={tutorialTip} onDismiss={dismissTutorialTip} />
      </LinearGradient>
    );
  }

  // Round results
  if (game.phase === GAME_PHASES.ROUND_RESULTS) {
    const isHost = game.hostId === user.uid;
    const lastRoundResult = game.roundResults[game.roundResults.length - 1];
    const sortedPlayers = [...game.players].sort((a, b) => b.points - a.points);
    const handleShareRound = async () => {
      try {
        const { Share } = require('react-native');
        const sharePrompt = game.prompts[game.currentRound - 1] || '';
        const winnerUid = lastRoundResult?.rankings?.[0]?.uid;
        const winningSub = game.submissions.find(s => s.uid === winnerUid);
        const videoUrl = winningSub?.videoUrl || '';
        await Share.share({
          message: `"${sharePrompt}" 🎬\n\nCheck out this round on Snappled!\n\n${videoUrl ? videoUrl + '\n\n' : ''}${sortedPlayers.map((p, i) => `#${i+1} ${p.username}`).join('\n')}\n\n🔥 Get Snappled — snappled://`,
        });
      } catch (e) {}
    };
    return (
      <>
        <RoundResultsReveal
          rankings={lastRoundResult?.rankings || []}
          players={game.players}
          submissions={game.submissions || []}
          prompt={game.prompts[game.currentRound - 1] || ''}
          currentRound={game.currentRound}
          totalRounds={game.totalRounds}
          timer={timer}
          isHost={isHost}
          isPractice={isPractice}
          selfUid={user?.uid}
          onNextRound={handleNextRound}
          onShare={handleShareRound}
          onEndGame={() => gameService.endGameEarly(gameId)}
          onLeave={handleLeaveGame}
          onHelp={showPhaseHelp} onHelpEnd={hidePhaseHelp}
          onQuitPractice={handleLeaveGame}
        />
        <RoundStartOverlay
          visible={!!roundAlert}
          title={roundAlert?.title}
          sub={roundAlert?.sub}
          bullets={roundAlert?.bullets}
          onDismiss={() => setRoundAlert(null)}
        />
      </>
    );
  }

  // Final results
  if (game.phase === GAME_PHASES.FINAL_RESULTS) {
    return <FinalResultsPhase game={game} selfUid={user?.uid} onDone={handleFinish} onLeave={handleLeaveGame} />;
  }

  return null;
}

// (Legacy quitPracticeStyles removed — the scoreboard's Quit / End
// Game actions are now BackChunk in a split action row with
// NEXT ROUND. The Quit-Practice-inside-game button still lives in
// its own place at the top of the game screen and uses its own
// inline style there.)

// Admin nuke button styling for the in-game card preview modal.
// Visually subdued + red so it can't be mistaken for a player action.
const adminGameStyles = StyleSheet.create({
  poolNukeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.5)',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  poolNukeText: {
    color: '#FF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

// Scoring-phase chrome — banner above the grid + host skip button.
// Kept separate from the main styles block so the SCORING render is
// trivially deletable / movable later without grep-and-prune.
const scoringStyles = StyleSheet.create({
  winnerBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  winnerLabel: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  winnerNames: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  winnerVotes: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  // Compact SCORING header — smaller title than the default so the
  // scoreboard podium icon + timer fit comfortably on the right.
  headerTitleCompact: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreboardIcon: {
    padding: 4,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0, 198, 255, 0.2)',
  },
  backBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.vibeBlue, fontSize: 20, fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timerText: {
    color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.fontWeights.bold,
    minWidth: 48, textAlign: 'center',
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    borderRadius: 8, borderWidth: 1, borderColor: theme.colors.vibeBlue,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  // Lobby
  lobbyContent: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 16, paddingBottom: 80, gap: 16,
  },
  lobbyTitle: {
    color: theme.colors.vibeBlue, fontSize: 32, fontWeight: theme.fontWeights.bold,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  lobbySubtitle: {
    color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20,
    maxWidth: 280,
  },
  deckChoice: {
    flexDirection: 'row', gap: 12, marginTop: 8,
  },
  deckOption: {
    paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  deckOptionActive: {
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.1)',
  },
  deckOptionText: {
    color: theme.colors.textSecondary, fontSize: 13, fontWeight: theme.fontWeights.semiBold,
  },
  deckOptionTextActive: {
    color: theme.colors.vibeBlue,
  },
  roundsPicker: {
    alignItems: 'center',
    marginTop: 4,
  },
  roundsPickerLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 6,
  },
  roundsPickerOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  roundsOption: {
    width: 40,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
  },
  roundsOptionActive: {
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.12)',
  },
  roundsOptionText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  roundsOptionTextActive: {
    color: theme.colors.vibeBlue,
  },
  spectateBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 8, paddingVertical: 6,
    backgroundColor: 'rgba(0,198,255,0.1)', borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.vibeBlue,
  },
  spectateBannerText: {
    color: theme.colors.vibeBlue, fontSize: 12, fontWeight: theme.fontWeights.semiBold,
  },
  spectateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, paddingVertical: 10,
  },
  spectateText: {
    color: theme.colors.textSecondary, fontSize: 14, fontWeight: theme.fontWeights.medium,
  },
  lobbyButtons: { width: '100%', gap: 12, marginTop: 16 },
  customMenu: { width: '100%', gap: 10, paddingLeft: 20 },
  warningText: {
    color: theme.colors.vibeRed, fontSize: 13, textAlign: 'center', marginTop: 8,
  },
  waitingText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 12 },
  // Picking
  promptBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 12, padding: 20, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  promptText: {
    color: 'white', fontSize: 18, fontWeight: theme.fontWeights.bold,
    textAlign: 'center', lineHeight: 24,
  },
  editPromptInput: {
    color: 'white',
    fontSize: 18,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    lineHeight: 24,
    minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 8,
  },
  promptAdminRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  promptAdminBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  promptAdminBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: 'bold',
  },
  editPromptCard: {
    width: '85%',
    backgroundColor: '#0A1A2A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    padding: 20,
  },
  editPromptTitle: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 1.5,
  },
  editPromptButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
  },
  editPromptBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
  },
  editPromptBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pickHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 8, gap: 12, paddingHorizontal: 16,
  },
  pickInstruction: {
    color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center',
  },
  pickedWaitWrap: {
    flex: 1,
  },
  pickedWaitContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  yourPickSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  yourPickLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  yourPickCard: {
    width: 130,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  yourPickCreator: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
  },
  pickProgressText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  playerStatusList: {
    gap: 6,
  },
  playerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  playerStatusName: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  playerStatusNameMe: {
    color: theme.colors.vibeBlue,
  },
  playerStatusLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  playerStatusLabelDone: {
    color: theme.colors.vibeGreen,
    fontWeight: 'bold',
  },
  playerStatusScore: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 50,
    textAlign: 'right',
  },
  // Scoreboard button — small pill on the voting wait screen that opens
  // the full standings modal.
  scoreboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.1)',
  },
  scoreboardBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  // Host-only "Skip Wait" — bypasses the 10s post-vote pause when bots
  // get hung up. Subtle styling so it doesn't compete with Scoreboard.
  skipWaitBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  skipWaitText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  // 5s reveal stage on round results — grid of submissions with picker
  // names + colors underneath.
  revealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  revealCardWrap: {
    width: 100,
    alignItems: 'center',
    margin: 4,
  },
  revealCard: {
    width: 100,
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 3,
    backgroundColor: '#000',
  },
  revealCardWinner: {
    borderWidth: 4,
    shadowColor: theme.colors.vibeYellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
  },
  revealWinnerBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
  },
  revealWinnerText: {
    color: theme.colors.vibeYellow,
    fontSize: 13,
    fontWeight: 'bold',
  },
  revealPtsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
  },
  revealPtsText: {
    color: theme.colors.vibeGreen,
    fontSize: 10,
    fontWeight: 'bold',
  },
  revealPicker: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  standingsLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  // "Waiting on …" row at the bottom of the voting wait screen.
  // Pinned footer — sits below the scrolling snapples grid so the
  // hamburger / count / skip arrow stay anchored even when the grid
  // overflows. Includes the "Waiting on …" line above the action row.
  waitingFooter: {
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // Bottom action row on the voting wait screen — hamburger + count
  // + skip arrow on a single line. iconBtn doubles as a spacer when
  // the host's skip arrow shouldn't render (to keep the count centered).
  waitingActionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,198,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,198,255,0.4)',
  },
  waitingOnLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  waitingOnAllIn: {
    color: theme.colors.vibeGreen,
    fontSize: 12,
    fontWeight: 'bold',
  },
  waitingOnNames: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  waitingOnPrefix: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  waitingOnName: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Scoreboard modal
  scoreboardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scoreboardCard: {
    width: '100%',
    backgroundColor: '#0A1A2A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    padding: 20,
  },
  scoreboardTitle: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 14,
  },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderLeftWidth: 5,
    marginBottom: 6,
  },
  scoreboardPlace: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    width: 28,
  },
  scoreboardName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  scoreboardPts: {
    color: theme.colors.vibeBlue,
    fontSize: 13,
    fontWeight: 'bold',
    minWidth: 50,
    textAlign: 'right',
  },
  scoreboardClose: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  scoreboardCloseText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  allSnapplesLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  allSnapplesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  // Small-mode cell for the voting-wait screen — keeps the old
  // fixed-width cards. VoteAuraCard fills the cell, so we set the
  // width here instead of in the card.
  auraCellSmall: {
    width: 100,
    margin: 6,
  },
  // Large-mode cell for the SCORING screen — 2-col grid matching
  // the picking/voting hand layout. Cell padding drops to 10pt
  // each side so cards get closer to the picking-hand size (only
  // ~14pt narrower). 6-ring vote piles still clear the neighbor.
  auraGridLarge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  auraCellLarge: {
    width: '50%',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  // Vote-wait top row: YOUR VOTE on the left, aura grid wrapping on the
  // right. Pulls all videos up next to the user's pick so eyes don't have
  // to drag down past stats to watch the action.
  voteTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  yourVoteCol: {
    alignItems: 'center',
  },
  allSnapplesGridInline: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: 4,
  },
  mulliganBtnBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeGreen,
  },
  mulliganBtnBottomActive: {
    borderColor: theme.colors.vibeRed,
    backgroundColor: 'rgba(255, 80, 80, 0.12)',
  },
  handCardMulligan: {
    borderColor: theme.colors.vibeRed,
    borderWidth: 3,
  },
  mulliganBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,255,65,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,255,65,0.3)',
  },
  mulliganText: {
    color: theme.colors.vibeGreen, fontSize: 12, fontWeight: 'bold',
  },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingHand: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingHandText: { color: theme.colors.textSecondary, fontSize: 14 },
  submittedCount: { color: theme.colors.vibeBlue, fontSize: 16, fontWeight: 'bold' },
  revealGrid: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  revealCard: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  revealCardLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  revealCardName: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  spotlightOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  voterLabel: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  voterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  voterChip: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  voterChipText: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
  },
  voterChipTextMe: {
    color: theme.colors.vibeGreen,
  },
  scorePillLabel: {
    color: theme.colors.vibeGreen,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  reviewBanner: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  reviewLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  handGrid: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  reviewCard: {
    width: (screenWidth - 32 - 12) / 2,
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reviewFooter: {
    padding: 16,
    paddingBottom: 24,
  },
  waitingArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  waitingHeader: {
    color: theme.colors.vibeBlue,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  waitingSub: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 18,
  },
  placeholderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  slot: {
    width: (screenWidth - 40 - 24) / 3,
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  slotPending: {
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
  },
  slotFilled: {
    borderColor: theme.colors.vibeBlue,
  },
  slotEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotNameWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  slotName: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Flex-fill 3 rows × 2 columns. Container claims the space between
  // the prompt banner and the Submit Vote button below.
  handGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  handCard: {
    width: '50%',
    height: '33.333%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  // Inner selection ring for the picked-favorite card in voting. Kept
  // as an absolute overlay so it doesn't offset the tiled grid.
  handSelectionRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 4,
    borderColor: theme.colors.vibeGreen,
  },
  handCardSelected: { borderColor: theme.colors.vibeGreen, borderWidth: 3 },
  handCardEmpty: {
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  handCardEmptyInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  handCardVideo: { flex: 1 },
  favoriteTag: {
    position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, padding: 3,
  },
  // (Legacy hostAdvanceBar / hostAdvanceBarText removed — the END
  // ROUND host-skip button is now the shared <ShimmerBar>.)
  // Flush action bar — green because it's the selection CTA
  // (matches PLAY THIS CARD in picking). Consistent selection color
  // across the whole game.
  // (Legacy submitVoteBar / submitVoteBarDisabled removed — the
  // voting CTA is now the shared <ShimmerBar>.)
  // Two-chunk submit row: 1/4 back button, 3/4 primary CTA. Same
  // full-width footprint as the plain submit bar, split by a
  // hairline black divider so both chunks read as one bar.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  // Matches PreviewModal's BACK chunk — solid cyan + white text.
  // All BACK buttons across the game read as the same action now.
  // (Legacy actionBackChunk / actionBackText removed — BACK is now
  // the shared <BackChunk> component.)
  actionBackFlex: {
    flex: 1,
  },
  actionSubmitChunk: {
    flex: 3,
    borderTopWidth: 0,
  },
  // 2-col voting grid — mirrors PickingPhase's grid so the two
  // phases feel like the same screen with a different title.
  votingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  votingCell: {
    width: '50%',
    padding: 4,
  },
  swipeHints: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%',
    paddingHorizontal: 32, marginTop: 16,
  },
  swipeHintLeft: { color: theme.colors.vibeRed, fontSize: 14, fontWeight: 'bold' },
  swipeHintRight: { color: theme.colors.vibeGreen, fontSize: 14, fontWeight: 'bold' },
  voteCounter: { color: theme.colors.textSecondary, fontSize: 14 },
  // Results
  resultsContent: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  resultsScrollContent: { paddingBottom: 40 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 12,
    marginBottom: 8,
  },
  resultPlacement: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: 'bold', width: 36 },
  resultInfo: { flex: 1 },
  resultName: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.fontWeights.semiBold },
  resultCard: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
  resultRoundPts: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: 'bold' },
  resultRoundPtsEarned: { color: theme.colors.vibeGreen, fontSize: 16 },
  resultTotal: { color: theme.colors.vibeBlue, fontSize: 14, fontWeight: 'bold' },
  resultCoins: { color: theme.colors.vibeYellow, fontSize: 14, fontWeight: 'bold' },
  resultsActions: { marginTop: 24, gap: 12 },
  shareResultsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: theme.colors.vibeBlue,
  },
  shareResultsText: { color: theme.colors.vibeBlue, fontSize: 14, fontWeight: theme.fontWeights.semiBold },
});
