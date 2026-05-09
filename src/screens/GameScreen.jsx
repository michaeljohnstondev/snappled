import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Dimensions,
  ActivityIndicator, Animated, Modal, TextInput, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { LinearTransition } from 'react-native-reanimated';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { useRewardClaim } from '../store/RewardClaimContext';
import { prefetchVideo } from '../services/videoCache';
import { gameService, GAME_PHASES } from '../services/gameService';
import SnappleThumbnailImg from '../components/ui/SnappleThumbnail';
import { snappleService } from '../services/snappleService';
import { userService } from '../services/userService';
import VibeButton from '../components/ui/VibeButton';
import AppLayout from '../components/ui/layout/AppLayout';
import { CardThumbnailDelayed } from '../components/game/CardThumbnail';
import PreviewPlayer from '../components/game/PreviewPlayer';
import VoteAuraCard from '../components/game/VoteAuraCard';
import CreatorActionRow from '../components/game/CreatorActionRow';
import WinnerSpotlightCard from '../components/game/WinnerSpotlightCard';
import LobbyPhase from '../components/game/phases/LobbyPhase';
import WarmupPhase from '../components/game/phases/WarmupPhase';
import FinalResultsPhase from '../components/game/phases/FinalResultsPhase';
import PickingPhase from '../components/game/phases/PickingPhase';
import theme from '../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ── Round results reveal — staged animation: grid → spotlight → shrink → scoreboard ──
// Layout: scoreboard is the base layer (always rendered) so we can measure
// each player's row Y in screen coords. The reveal grid + winner spotlight
// are an overlay on top. During shrink each winner card scales down and
// translates toward its actual row in the scoreboard.
// Palette assigned to non-self players in voter-order. Self always shows
// in vibeGreen so the user can spot their own vote at a glance.
const VOTER_PALETTE = [
  theme.colors.vibeBlue,
  theme.colors.vibeCyan,
  theme.colors.vibePurple,
  theme.colors.vibePink,
  theme.colors.vibeYellow,
  theme.colors.vibeOrange,
  theme.colors.vibeAqua,
  theme.colors.vibeTeal,
];

// Segmented aura rendered around a card — one stripe per voter, in their
// assigned color. Stripes wrap each side of the card so the colors are
// visible regardless of orientation. If no voters, just renders children.
function VoteAura({ voters, thickness = 3, radius = 10, children }) {
  if (!voters || voters.length === 0) return children;
  const colors = voters.map(v => v.color);
  return (
    <View style={{ padding: thickness, borderRadius: radius + thickness, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: thickness, flexDirection: 'row' }}>
        {colors.map((c, i) => <View key={`t-${i}`} style={{ flex: 1, backgroundColor: c }} />)}
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: thickness, flexDirection: 'row' }}>
        {colors.map((c, i) => <View key={`b-${i}`} style={{ flex: 1, backgroundColor: c }} />)}
      </View>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: thickness, flexDirection: 'column' }}>
        {colors.map((c, i) => <View key={`l-${i}`} style={{ flex: 1, backgroundColor: c }} />)}
      </View>
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: thickness, flexDirection: 'column' }}>
        {colors.map((c, i) => <View key={`r-${i}`} style={{ flex: 1, backgroundColor: c }} />)}
      </View>
      {children}
    </View>
  );
}

function RoundResultsReveal({
  submissions, rankings, players, votes, prompt,
  currentRound, totalRounds, timer,
  isHost, onNextRound, onShare, selfUid,
}) {
  // Per-player color assignment. Self locks to vibeGreen, others get a
  // palette color in player-order so the same person stays the same color
  // across all cards' auras + voter-name chips.
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

  // Resolve voters for a submission as { name, color, isMe } objects so
  // both aura stripes and name chips can render in the same colors.
  const votersFor = (subUid) => {
    const voterIds = votes?.[subUid] || [];
    return voterIds.map(vid => ({
      uid: vid,
      name: players?.find(p => p.uid === vid)?.username || vid?.slice(0, 4),
      color: playerColors.get(vid) || theme.colors.textSecondary,
      isMe: vid === selfUid,
    }));
  };
  const winners = (rankings || []).filter(r => r.placement === 1);
  const winnerUids = useRef(new Set(winners.map(w => w.uid))).current;
  // 1 winner → 1.5x. 2-tie → 1.2x side-by-side. 3+ tie → 0.9x to fit.
  const winnerTargetScale = winners.length === 1 ? 1.5 : winners.length === 2 ? 1.2 : 0.9;

  // earnedByUid lookup so the row can show +N this round.
  const earnedByUid = {};
  (rankings || []).forEach(r => { earnedByUid[r.uid] = r.pointsEarned || 0; });

  // Displayed points per player — start at "before this round" total. Tick up
  // to the post-round total when stage hits shrink. Sorting is driven by these
  // displayed values so rank swaps happen mid-animation.
  const [displayedPoints, setDisplayedPoints] = useState(() =>
    Object.fromEntries(
      (players || []).map(p => {
        const ranking = (rankings || []).find(r => r.uid === p.uid);
        const earned = ranking?.pointsEarned || 0;
        return [p.uid, Math.max(0, p.points - earned)];
      })
    )
  );

  const orderedPlayers = [...(players || [])].sort((a, b) => {
    const aPts = displayedPoints[a.uid] ?? a.points;
    const bPts = displayedPoints[b.uid] ?? b.points;
    return bPts - aPts;
  });

  const [stage, setStage] = useState('reveal');
  const losersOpacity = useRef(new Animated.Value(1)).current;
  const losersScale = useRef(new Animated.Value(1)).current;
  const overlayBgOpacity = useRef(new Animated.Value(1)).current;
  const scoreboardOpacity = useRef(new Animated.Value(0.15)).current;
  // Drives the per-card jiggle during the reveal stage.
  const wobble = useRef(new Animated.Value(0)).current;

  // Per-winner animated values. Map to support 2+ way ties cleanly. Spread
  // is handled by flex layout in spotlightOverlay (row direction with gap).
  const winnerAnimsRef = useRef(new Map());
  winners.forEach((w) => {
    if (!winnerAnimsRef.current.has(w.uid)) {
      winnerAnimsRef.current.set(w.uid, {
        scale: new Animated.Value(0.6),
        opacity: new Animated.Value(0),
        translateY: new Animated.Value(0),
      });
    }
  });

  // Row screen Y positions, populated as scoreboard rows mount.
  const rowScreenYsRef = useRef({});
  const rowRefs = useRef({});
  const handleRowRef = (uid) => (ref) => {
    rowRefs.current[uid] = ref;
    if (ref) {
      setTimeout(() => {
        ref.measureInWindow?.((x, y, w, h) => {
          rowScreenYsRef.current[uid] = y + h / 2;
        });
      }, 80);
    }
  };

  // Random card wobble — instead of every card jiggling in sync, one
  // random card wobbles, pause ~3-5s, then a different one. Feels alive
  // without being chaotic. Initial 1.8s delay keeps the first beat calm.
  const [wobbleIdx, setWobbleIdx] = useState(null);
  useEffect(() => {
    if (stage !== 'reveal') return;
    let timeoutId;
    const trigger = () => {
      const len = (submissions || []).length;
      if (len === 0) {
        timeoutId = setTimeout(trigger, 2000);
        return;
      }
      const idx = Math.floor(Math.random() * len);
      setWobbleIdx(idx);
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -1, duration: 440, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setWobbleIdx(null);
        timeoutId = setTimeout(trigger, 3000 + Math.random() * 2000);
      });
    };
    timeoutId = setTimeout(trigger, 1800);
    return () => clearTimeout(timeoutId);
  }, [stage, submissions?.length]);

  // Random card pulse — same idea but on a different cadence and offset
  // so the wobble + pulse never fire simultaneously on the same beat.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [pulseIdx, setPulseIdx] = useState(null);
  useEffect(() => {
    if (stage !== 'reveal') return;
    let timeoutId;
    const trigger = () => {
      const len = (submissions || []).length;
      if (len === 0) {
        timeoutId = setTimeout(trigger, 2000);
        return;
      }
      const idx = Math.floor(Math.random() * len);
      setPulseIdx(idx);
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start(() => {
        setPulseIdx(null);
        timeoutId = setTimeout(trigger, 4000 + Math.random() * 2500);
      });
    };
    timeoutId = setTimeout(trigger, 2600);
    return () => clearTimeout(timeoutId);
  }, [stage, submissions?.length]);

  // Refs so we can clear timers if the user taps the spotlight to skip ahead.
  const t2Ref = useRef(null);
  const t3Ref = useRef(null);

  // Run shrink animations. fastMode=true fires when the user taps to skip —
  // shorter durations so the dismiss feels snappy.
  const runShrinkAnims = (fastMode) => {
    const screenH = Dimensions.get('window').height;
    const centerY = screenH / 2;
    const dur = fastMode ? 350 : 800;
    const overlayDur = fastMode ? 350 : 700;
    const sbDur = fastMode ? 300 : 600;
    const anims = [
      Animated.timing(overlayBgOpacity, { toValue: 0, duration: overlayDur, useNativeDriver: true }),
      Animated.timing(scoreboardOpacity, { toValue: 1, duration: sbDur, useNativeDriver: true }),
    ];
    winners.forEach(w => {
      const a = winnerAnimsRef.current.get(w.uid);
      if (!a) return; // guard against missing anim entry on tie reveal
      const targetY = rowScreenYsRef.current[w.uid];
      const translateY = (targetY != null ? (targetY - centerY) : -260);
      anims.push(
        Animated.timing(a.scale, { toValue: 0.15, duration: dur, useNativeDriver: true }),
        Animated.timing(a.translateY, { toValue: translateY, duration: dur, useNativeDriver: true }),
        Animated.timing(a.opacity, { toValue: 0, duration: dur, useNativeDriver: true }),
      );
    });
    try {
      Animated.parallel(anims).start();
    } catch (e) {
      console.error('[RoundResults] runShrinkAnims failed:', e);
    }
  };

  // Tap on the spotlight area → skip ahead to scoreboard, faster shrink.
  const handleSpotlightTap = () => {
    if (stage !== 'spotlight') return;
    if (t2Ref.current) clearTimeout(t2Ref.current);
    if (t3Ref.current) clearTimeout(t3Ref.current);
    setStage('shrink');
    runShrinkAnims(true);
    t3Ref.current = setTimeout(() => setStage('scoreboard'), 400);
  };

  useEffect(() => {
    const t1 = setTimeout(() => {
      setStage('spotlight');
      const anims = [
        // Losers fully fade and shrink — out of sight by spotlight peak.
        Animated.timing(losersOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(losersScale, { toValue: 0.5, duration: 600, useNativeDriver: true }),
        Animated.timing(scoreboardOpacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ];
      winners.forEach(w => {
        const a = winnerAnimsRef.current.get(w.uid);
        if (!a) return; // guard against missing anim entry on tie reveal
        anims.push(
          Animated.spring(a.scale, { toValue: winnerTargetScale, tension: 60, friction: 8, useNativeDriver: true }),
          Animated.timing(a.opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        );
      });
      try {
        Animated.parallel(anims).start();
      } catch (e) {
        console.error('[RoundResults] spotlight anim failed:', e);
      }
    }, 2800);

    t2Ref.current = setTimeout(() => {
      setStage('shrink');
      runShrinkAnims(false);
    }, 11800);
    // Bumped from 12600 to 13000 so the shrink animation has a small buffer
    // to fully settle before the overlay (and its video players) unmount —
    // simultaneous unmount of multiple expo-video instances on tie reveal
    // was a suspect in the crash.
    t3Ref.current = setTimeout(() => setStage('scoreboard'), 13000);
    return () => {
      clearTimeout(t1);
      if (t2Ref.current) clearTimeout(t2Ref.current);
      if (t3Ref.current) clearTimeout(t3Ref.current);
    };
  }, []);

  const showWinnerOverlay = stage === 'spotlight' || stage === 'shrink';
  const showOverlay = stage !== 'scoreboard';

  // Tick displayed points up to actual when shrink starts; the orderedPlayers
  // sort below is driven by displayedPoints, so reanimated LinearTransition
  // animates the row swap whenever someone overtakes another player mid-tick.
  useEffect(() => {
    if (stage !== 'shrink') return;
    const targets = {};
    (players || []).forEach(p => { targets[p.uid] = p.points; });
    const startVals = { ...displayedPoints };
    const duration = 2200;
    const steps = 24;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const t = Math.min(i / steps, 1);
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
  }, [stage]);

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>Round {currentRound} Results</Text>
        <Text style={styles.timerText}>{stage === 'scoreboard' ? `${timer}s` : ''}</Text>
      </View>

      <View style={styles.promptBanner}>
        <Text style={styles.promptText} numberOfLines={2}>{prompt}</Text>
      </View>

      {/* BASE LAYER: scoreboard. Visible behind the overlay during reveal so
          the user sees where the winner card ultimately lands. Rows are
          ordered by displayedPoints so they swap mid-tick when ranks
          change; reanimated LinearTransition animates the swap. Wrapped
          in a ScrollView so 6-8 player games can scroll past the fold. */}
      <Animated.View style={[styles.resultsContent, { opacity: scoreboardOpacity }]}>
        <ScrollView
          contentContainerStyle={styles.resultsScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {orderedPlayers.map((p, i) => {
            const earned = earnedByUid[p.uid] || 0;
            const playerSub = (submissions || []).find(s => s.uid === p.uid);
            const displayed = displayedPoints[p.uid] ?? p.points;
            return (
              <Reanimated.View
                key={p.uid}
                layout={LinearTransition.springify().damping(12).stiffness(90)}
                ref={handleRowRef(p.uid)}
                collapsable={false}
                style={[styles.resultRow, i === 0 && styles.resultRowFirst]}
              >
                <Text style={styles.resultPlacement}>#{i + 1}</Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName}>{p.username}</Text>
                </View>
                <Text style={[styles.resultRoundPts, earned > 0 && styles.resultRoundPtsEarned]}>
                  +{earned}
                </Text>
                <Text style={styles.resultTotal}>{displayed} pts</Text>
              </Reanimated.View>
            );
          })}

          {stage === 'scoreboard' && (
            <View style={styles.resultsActions}>
              {isHost ? (
                <VibeButton label="Next Round" onPress={onNextRound} />
              ) : (
                <Text style={styles.waitingText}>Next round in {timer}s...</Text>
              )}
              <Pressable style={styles.shareResultsBtn} onPress={onShare}>
                <Ionicons name="share-social" size={16} color={theme.colors.vibeBlue} />
                <Text style={styles.shareResultsText}>Share Round</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* OVERLAY: card grid + winner spotlight. Fades out during shrink. */}
      {showOverlay && (
        <Animated.View
          // Outer overlay no longer blocks all touches — spotlight is tappable
          // (skip-ahead). Loser grid below sets its own pointerEvents="none".
          style={[StyleSheet.absoluteFill, { opacity: overlayBgOpacity }]}
        >
          {/* Spacer to roughly match header + prompt banner heights so the
              grid sits where it would on the picking/voting screens. */}
          <View style={{ height: 120 }} />
          <FlatList
            data={submissions || []}
            keyExtractor={(item, i) => item?.snappleId || `sub-${i}`}
            numColumns={3}
            columnWrapperStyle={styles.handRow}
            contentContainerStyle={styles.handContainer}
            scrollEnabled={false}
            pointerEvents="none"
            renderItem={({ item, index }) => {
              // Only the wobble-target card rotates; only the pulse-target
              // card scales. Everyone else sits still, so the grid feels
              // alive but not seizure-inducing.
              const wobbleMag = ((index * 7) % 5) + 4;
              const cardRotate = wobble.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [`-${wobbleMag}deg`, '0deg', `${wobbleMag}deg`],
              });
              const cardPulse = pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.12],
              });
              const inReveal = stage === 'reveal';
              const isWobbleTarget = inReveal && wobbleIdx === index;
              const isPulseTarget = inReveal && pulseIdx === index;
              return (
                <Animated.View
                  style={{
                    opacity: losersOpacity,
                    transform: [
                      { scale: losersScale },
                      ...(isWobbleTarget ? [{ rotate: cardRotate }] : []),
                      ...(isPulseTarget ? [{ scale: cardPulse }] : []),
                    ],
                  }}
                >
                  {/* Card with a segmented vote-aura around it — one
                      stripe per voter in their assigned color. Voters
                      are surfaced as colored-border name chips below. */}
                  {(() => {
                    const voters = stage === 'reveal' || stage === 'spotlight'
                      ? votersFor(item.uid)
                      : [];
                    const ranking = (rankings || []).find(r => r.uid === item.uid);
                    const pts = ranking?.pointsEarned || 0;
                    const placement = ranking?.placement;
                    return (
                      <>
                        <VoteAura voters={voters} thickness={3} radius={10}>
                          <View style={styles.handCard}>
                            <View style={styles.handCardVideo}>
                              <CardThumbnailDelayed videoUrl={item.videoUrl} delay={index * 80} />
                            </View>
                          </View>
                        </VoteAura>
                        {voters.length > 0 && (
                          <View style={styles.voterChipRow}>
                            {voters.map((v, i) => (
                              <View
                                key={`${v.uid}-${i}`}
                                style={[styles.voterChip, { borderColor: v.color }]}
                              >
                                <Text
                                  style={[styles.voterChipText, v.isMe && styles.voterChipTextMe]}
                                  numberOfLines={1}
                                >
                                  {v.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {pts > 0 && (
                          <Text style={styles.scorePillLabel} numberOfLines={1}>
                            #{placement} · +{pts} pts
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </Animated.View>
              );
            }}
          />

          {showWinnerOverlay && (
            <Pressable style={styles.spotlightOverlay} onPress={handleSpotlightTap}>
              {winners.map(w => {
                const sub = (submissions || []).find(s => s.uid === w.uid);
                const player = (players || []).find(p => p.uid === w.uid);
                const anim = winnerAnimsRef.current.get(w.uid);
                if (!anim) return null;
                return (
                  <WinnerSpotlightCard
                    key={w.uid}
                    submission={sub}
                    player={player}
                    isTie={winners.length > 1}
                    anim={anim}
                    voters={votersFor(w.uid)}
                  />
                );
              })}
            </Pressable>
          )}
        </Animated.View>
      )}
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
  const [isSpectating, setIsSpectating] = useState(false);
  const [timer, setTimer] = useState(0);
  const [previewCard, setPreviewCard] = useState(null);
  // IDs of snapples this user has already played in the current game — used to
  // filter the hand pool so each round reveals unseen cards.
  const [playedCardIds, setPlayedCardIds] = useState([]);
  // When true, tapping a card in the hand replaces it instead of previewing.
  const [mulliganMode, setMulliganMode] = useState(false);
  const timerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  // pickDeadline we last scheduled bot picks against — guards against
  // duplicate schedules. Switched from currentRound because admin's
  // Replace & Restart keeps the same round but stamps a new pickDeadline,
  // so the old guard would skip rescheduling and bots would never pick
  // again — leaving picking stuck.
  const lastBotScheduleDeadlineRef = useRef(null);

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

  // Incremental video prefetch — concurrent (forEach without await), so
  // every new video starts downloading immediately. By the time we need
  // them in voting / reveal, they're cached.
  useEffect(() => {
    (game?.submissions || []).forEach(s => {
      if (s?.videoUrl) prefetchVideo(s.videoUrl);
    });
  }, [game?.submissions?.length]);

  // Same for the user's own hand: as soon as a hand is drawn (or refreshed
  // after a played card swap), prefetch all 6 cards in parallel.
  useEffect(() => {
    hand.forEach(card => {
      if (card?.videoUrl) prefetchVideo(card.videoUrl);
    });
  }, [hand]);

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

  // Draw a hand when warmup or picking begins and the hand is empty. Was
  // previously done with setState during render which racked up extra
  // renders and risked infinite-loop edge cases. Effect-based version
  // fires once per phase entry.
  useEffect(() => {
    if (!game?.phase) return;
    const inDrawingPhase =
      game.phase === GAME_PHASES.REVIEW || game.phase === GAME_PHASES.PICKING;
    if (!inDrawingPhase) return;
    if (hand.length > 0) return;
    if (mySnapples.length === 0 && allSnapples.length === 0) return;
    setHand(gameService.drawHand(getHandSnapples(), allSnapples));
  }, [game?.phase, game?.currentRound, mySnapples.length, allSnapples.length, hand.length]);

  // Hide the bottom tab bar whenever the user is inside an active game so the
  // game UI gets full-screen real estate. setOptions targets THIS screen's
  // descriptor (which is what CustomTabBar reads via descriptors[focused.key]),
  // not the parent navigator.
  useEffect(() => {
    const inGame = !!gameId && !!game;
    navigation.setOptions({ tabBarStyle: inGame ? { display: 'none' } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation, gameId, game]);

  // Load snapples + check for active game
  useEffect(() => {
    loadSnapples();
    checkActiveGame();
  }, []);

  const checkActiveGame = async () => {
    if (!user?.uid) return;
    try {
      const { collection: col, query: q, where, getDocs, limit: lim, deleteDoc, doc: docRef } = require('firebase/firestore');
      const { db } = require('../services/firebase');
      const gamesQuery = q(
        col(db, 'games'),
        where('phase', 'in', ['lobby', 'picking', 'voting', 'roundResults']),
        lim(5)
      );
      const snapshot = await getDocs(gamesQuery);
      for (const gameDoc of snapshot.docs) {
        const data = gameDoc.data();
        if (data.players?.some(p => p.uid === user.uid)) {
          // Check if game is stale (older than 5 minutes with no update)
          const updatedAt = data.updatedAt?.toDate?.() || new Date(data.updatedAt || 0);
          const staleMins = (Date.now() - updatedAt.getTime()) / (1000 * 60);

          if (staleMins > 5) {
            console.log('[GameScreen] Cleaning up stale game:', gameDoc.id);
            await deleteDoc(docRef(db, 'games', gameDoc.id));
            continue;
          }

          // Active game — rejoin (but not practice bot games)
          const hasBots = data.players.some(p => p.uid?.startsWith('bot_'));
          if (hasBots) {
            await deleteDoc(docRef(db, 'games', gameDoc.id));
            continue;
          }

          setGameId(gameDoc.id);
          return;
        }
      }
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
      setTimer(45);
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // Auto-submit random card if time runs out
            if (!game.submissions.some(s => s.uid === user.uid) && hand.length > 0) {
              const randomCard = hand[Math.floor(Math.random() * hand.length)];
              handlePickCard(randomCard);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (game?.phase === GAME_PHASES.VOTING) {
      setTimer(30); // 30 seconds to pick a favorite
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            // Auto-pick random if they haven't voted. The all-voted
            // detection in subscribeToGame handles the eventual finishRound
            // after a 10s wait — no need to fire it here too.
            if (!hasVoted) {
              const votable = game.submissions.filter(s => s.uid !== user.uid);
              if (votable.length > 0) {
                const random = votable[Math.floor(Math.random() * votable.length)];
                setFavoriteCard(random);
                gameService.castVote(gameId, user.uid, random.uid);
                setHasVoted(true);
                if (game.hostId === user.uid && isPractice) {
                  const botPlayers = (game?.players || []).filter(p => p.uid?.startsWith('bot_'));
                  const nonBotSubmissions = game.submissions.filter(s => !s.uid.startsWith('bot_'));
                  botPlayers.forEach(bot => {
                    if (nonBotSubmissions.length > 0) {
                      const randomSub = nonBotSubmissions[Math.floor(Math.random() * nonBotSubmissions.length)];
                      gameService.castVote(gameId, bot.uid, randomSub.uid);
                    }
                  });
                }
              }
            }
            clearInterval(timerRef.current);
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

  // Tracks whether finishRound has been scheduled this voting round so the
  // host doesn't double-fire the transition when multiple game-doc updates
  // come in during the 10s countdown.
  const finishScheduledRoundRef = useRef(null);

  // Subscribe to game updates
  useEffect(() => {
    if (gameId) {
      unsubscribeRef.current = gameService.subscribeToGame(gameId, (gameData) => {
        setGame(gameData);

        // Auto-advance: if all players submitted, move to voting
        if (gameData.phase === GAME_PHASES.PICKING) {
          const allSubmitted = gameData.players.every(p =>
            gameData.submissions.some(s => s.uid === p.uid)
          );
          if (allSubmitted && gameData.hostId === user?.uid) {
            gameService.startVoting(gameId);
          }
        }

        // Auto-advance: when all players have voted, host schedules
        // finishRound after 10s — gives everyone a beat to watch the
        // aura-pulse wait screen instead of jumping straight to results.
        if (gameData.phase === GAME_PHASES.VOTING && gameData.hostId === user?.uid) {
          const votedUids = new Set(Object.values(gameData.votes || {}).flat());
          const allVoted = (gameData.players || []).every(p => votedUids.has(p.uid));
          if (allVoted && finishScheduledRoundRef.current !== gameData.currentRound) {
            finishScheduledRoundRef.current = gameData.currentRound;
            setTimeout(() => gameService.finishRound(gameId), 10000);
          }
        }

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

  const getHandSnapples = () => {
    const source = useRandomCards ? allSnapples : mySnapples;
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
      if (retriesLeft > 0) setTimeout(() => tryPick(retriesLeft - 1), 1000);
    };
    setTimeout(() => tryPick(20), delay);
  };

  const handleCreateGame = async () => {
    setIsLoading(true);
    try {
      const username = user?.username || user?.email?.split('@')[0] || 'Player';
      const result = await gameService.createGame(user.uid, username);
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
      const prompts = await gameService.getGamePrompts(gameService.ROUNDS_PER_GAME);
      const result = await gameService.startGame(gameId, user.uid, prompts);
      if (result.success) {
        const drawnHand = gameService.drawHand(getHandSnapples(), allSnapples);
        setHand(drawnHand);
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
    setUseRandomCards(true);
    try {
      const username = user?.username || user?.email?.split('@')[0] || 'Player';
      const createResult = await gameService.createGame(user.uid, username);
      if (!createResult.success) {
        showError('Error', createResult.error);
        return;
      }
      setGameId(createResult.gameId);

      // Add fake bot players
      const botNames = ['SnapBot', 'VibeMaster', 'CardShark', 'PromptKing', 'NoFilter', 'BigVibe'];
      for (const name of botNames) {
        await gameService.joinGame(createResult.gameId, `bot_${name}`, name);
      }

      // Start immediately
      const prompts = await gameService.getGamePrompts(gameService.ROUNDS_PER_GAME);

      await gameService.startGame(createResult.gameId, user.uid, prompts);

      // Bots are scheduled by a phase-change effect once PICKING starts.
      const drawnHand = gameService.drawHand(allSnapples, allSnapples);
      setHand(drawnHand);
    } catch (error) {
      showError('Error', 'Failed to start practice');
    } finally {
      setIsLoading(false);
    }
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

  // Admin: replace the current round's prompt with a fresh one from the
  // pool and restart the picking phase. Used by Delete button on banner
  // and the modal's Replace & Restart action.
  const handleDeletePrompt = async () => {
    setIsEditingPrompt(false);
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
    // doesn't lock the user into a fake "submitted" state.
    const result = await gameService.castVote(gameId, user.uid, favoriteCard.uid);
    if (!result?.success) {
      showError('Vote Failed', result?.error || 'Could not submit vote — try again.');
      return;
    }
    setHasVoted(true);

    // If host in practice, kick bot votes too. The actual finishRound is
    // scheduled in subscribeToGame once all-voted is detected (10s after).
    if (game.hostId === user.uid && isPractice) {
      const botPlayers = (game?.players || []).filter(p => p.uid?.startsWith('bot_'));
      const nonBotSubmissions = game.submissions.filter(s => !s.uid.startsWith('bot_'));
      botPlayers.forEach(bot => {
        if (nonBotSubmissions.length > 0) {
          const randomSub = nonBotSubmissions[Math.floor(Math.random() * nonBotSubmissions.length)];
          gameService.castVote(gameId, bot.uid, randomSub.uid);
        }
      });
    }
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
          <Text style={styles.lobbySubtitle}>Pick your best snapple for each prompt. Swipe to vote!</Text>

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
      />
    );
  }

  // Review phase — show the prompt + your hand before picking starts so
  // players can scout. Auto-advances to PICKING when the timer runs out;
  // host can also start early.
  if (game.phase === GAME_PHASES.REVIEW) {
    return (
      <WarmupPhase
        hand={hand}
        isHost={game.hostId === user.uid}
        timer={timer}
        onLeave={handleLeaveGame}
        onPreviewCard={(card) => setPreviewCard(card)}
        onStartRound={() => gameService.startPicking(gameId)}
      />
    );
  }

  // Picking phase — choose a card from your hand
  if (game.phase === GAME_PHASES.PICKING) {
    return (
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
        onPickCard={(card) => {
          handlePickCard(card);
          setPreviewCard(null);
        }}
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
      />
    );
  }

  // Voting phase — pick your favorite from all submissions
  if (game.phase === GAME_PHASES.VOTING) {
    const votableSubmissions = isSpectating
      ? game.submissions
      : game.submissions.filter(s => s.uid !== user.uid);

    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleLeaveGame}>
            <View style={styles.backBg}>
              <Ionicons name="close" size={18} color="white" />
            </View>
          </Pressable>
          <Text style={styles.headerTitle}>{isSpectating ? 'Watching' : 'Vote'}</Text>
          {!isSpectating && <Text style={styles.timerText}>{timer}s</Text>}
        </View>

        {isSpectating && (
          <View style={styles.spectateBanner}>
            <Ionicons name="eye" size={14} color={theme.colors.vibeBlue} />
            <Text style={styles.spectateBannerText}>Spectating — {game.players.length} players</Text>
          </View>
        )}

        <View style={styles.promptBanner}>
          <Text style={styles.promptText}>{game.prompts[game.currentRound - 1]}</Text>
        </View>

        {hasVoted ? (
          // Vote-submitted wait screen — replaces the lone green checkmark
          // with: YOUR VOTE thumbnail + creator credit, current standings
          // with per-player voted/voting status, and the full snapple grid
          // (anonymous, tap to re-watch). Mirrors the post-pick screen.
          (() => {
            const votedUids = new Set(Object.values(game.votes || {}).flat());
            const sortedPlayers = [...(game.players || [])].sort(
              (a, b) => (b.points || 0) - (a.points || 0)
            );
            return (
              <ScrollView
                style={styles.pickedWaitWrap}
                contentContainerStyle={styles.pickedWaitContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Top row: YOUR VOTE thumbnail flanked by the auras grid so
                    the user's eyes stay on the videos as votes pulse in. */}
                <View style={styles.voteTopRow}>
                  <View style={styles.yourVoteCol}>
                    <Text style={styles.yourPickLabel}>YOUR VOTE</Text>
                    <View style={styles.yourPickCard}>
                      {favoriteCard?.videoUrl ? (
                        <SnappleThumbnailImg videoUrl={favoriteCard.videoUrl} />
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.allSnapplesGridInline}>
                    {(game.submissions || []).map((sub, i) => {
                      const auraCount = (game.votes?.[sub.uid] || []).length;
                      return (
                        <VoteAuraCard
                          key={sub.snappleId || `sub-${i}`}
                          submission={sub}
                          voteCount={auraCount}
                          onPress={() => setPreviewCard({ ...sub, _isVoting: true })}
                        />
                      );
                    })}
                  </View>
                </View>

                <Text style={styles.pickProgressText}>
                  {votedUids.size} of {(game.players || []).length} voted
                </Text>

                <View style={styles.playerStatusList}>
                  {sortedPlayers.map(p => {
                    const voted = votedUids.has(p.uid);
                    const isMe = p.uid === user.uid;
                    return (
                      <View key={p.uid} style={styles.playerStatusRow}>
                        <Ionicons
                          name={voted ? 'checkmark-circle' : 'time-outline'}
                          size={18}
                          color={voted ? theme.colors.vibeGreen : theme.colors.textSecondary}
                        />
                        <Text style={[styles.playerStatusName, isMe && styles.playerStatusNameMe]}>
                          {p.username}{isMe ? ' (you)' : ''}
                        </Text>
                        <Text style={styles.playerStatusScore}>{p.points || 0} pts</Text>
                        <Text style={[styles.playerStatusLabel, voted && styles.playerStatusLabelDone]}>
                          {voted ? 'voted' : 'voting...'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            );
          })()
        ) : (
          <>
            <FlatList
              data={votableSubmissions}
              keyExtractor={(item, i) => item?.snappleId || `vote-${i}`}
              numColumns={3}
              columnWrapperStyle={styles.handRow}
              contentContainerStyle={styles.handContainer}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.handCard, favoriteCard?.uid === item.uid && styles.handCardSelected]}
                  onPress={() => setPreviewCard({ ...item, videoUrl: item.videoUrl, _isVoting: true })}
                >
                  <View style={styles.handCardVideo}>
                    {item.videoUrl ? <SnappleThumbnailImg videoUrl={item.videoUrl} /> : null}
                  </View>
                </Pressable>
              )}
            />
            {favoriteCard && (
              <Pressable style={styles.submitVoteBtn} onPress={handleSubmitVote}>
                <Text style={styles.submitVoteText}>Submit Vote</Text>
              </Pressable>
            )}
          </>
        )}

        {/* Card Preview Modal — reused for voting */}
        {previewCard && previewCard._isVoting && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewCard(null)}>
            <View style={styles.previewOverlay}>
              <View style={styles.previewCard}>
                <PreviewPlayer videoUrl={previewCard.videoUrl} muted={!!previewCard.muted} />

                <CreatorActionRow
                  submission={previewCard}
                  currentUser={user}
                  ownedSnappleIds={userCurrency.ownedSnapples || []}
                  showToast={showToast}
                  showError={showError}
                />

                <View style={styles.previewButtons}>
                  <Pressable style={styles.previewCancel} onPress={() => setPreviewCard(null)}>
                    <Text style={styles.previewCancelText}>Back</Text>
                  </Pressable>
                  {!hasVoted && (
                    <Pressable style={styles.previewPlay} onPress={() => {
                      setFavoriteCard(previewCard);
                      setPreviewCard(null);
                    }}>
                      <Text style={styles.previewPlayText}>Pick as Favorite</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        )}
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
      <RoundResultsReveal
        submissions={game.submissions}
        rankings={lastRoundResult?.rankings || []}
        players={game.players}
        votes={game.votes || {}}
        prompt={game.prompts[game.currentRound - 1] || ''}
        currentRound={game.currentRound}
        totalRounds={game.totalRounds}
        timer={timer}
        isHost={isHost}
        selfUid={user?.uid}
        onNextRound={handleNextRound}
        onShare={handleShareRound}
      />
    );
  }

  // Final results
  if (game.phase === GAME_PHASES.FINAL_RESULTS) {
    return <FinalResultsPhase game={game} onDone={handleFinish} />;
  }

  return null;
}

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
    paddingHorizontal: 20,
  },
  pickedWaitContent: {
    paddingTop: 8,
    paddingBottom: 40,
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
  handContainer: { paddingHorizontal: 12, paddingBottom: 40 },
  handRow: { gap: 8, marginBottom: 8 },
  handCard: {
    width: (screenWidth - 40) / 3, aspectRatio: 9 / 16, borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.colors.vibeBlue, backgroundColor: 'rgba(0,0,0,0.3)',
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
  submitVoteBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 16,
  },
  submitVoteText: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },
  // Card preview modal
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  previewCard: {
    width: screenWidth - 48, height: screenHeight * 0.6,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: theme.colors.vibeBlue, backgroundColor: '#000',
  },
  previewInfo: {
    position: 'absolute', bottom: 60, left: 16, right: 16,
  },
  previewCreator: {
    color: 'white', fontSize: 16, fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
    marginBottom: 4,
  },
  previewPromptLabel: {
    color: 'rgba(255,255,255,0.8)', fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  previewButtons: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', height: 50,
  },
  previewCancel: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  previewCancelText: {
    color: theme.colors.textSecondary, fontSize: 14, fontWeight: theme.fontWeights.semiBold,
  },
  previewPlay: {
    flex: 2, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0, 198, 255, 0.2)',
  },
  previewPlayText: {
    color: theme.colors.vibeBlue, fontSize: 16, fontWeight: theme.fontWeights.bold,
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
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 8,
  },
  resultRowFirst: {
    borderColor: theme.colors.vibeYellow, borderWidth: 3,
    backgroundColor: 'rgba(255,215,0,0.1)',
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
