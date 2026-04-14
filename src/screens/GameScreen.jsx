import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Dimensions,
  ActivityIndicator, Animated, PanResponder, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { gameService, GAME_PHASES } from '../services/gameService';
import SnappleThumbnailImg from '../components/ui/SnappleThumbnail';
import { snappleService } from '../services/snappleService';
import VibeButton from '../components/ui/VibeButton';
import ButtonContainer from '../components/ui/navigation/ButtonContainer';
import NavButton from '../components/ui/navigation/NavButton';
import theme from '../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ── Thumbnail for hand cards (with delayed mount) ──
function CardThumbnailDelayed({ videoUrl, delay = 0 }) {
  const [mounted, setMounted] = useState(delay === 0);

  useEffect(() => {
    if (delay > 0) {
      const t = setTimeout(() => setMounted(true), delay);
      return () => clearTimeout(t);
    }
  }, []);

  if (!mounted) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,198,255,0.05)', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color={theme.colors.vibeBlue} />
      </View>
    );
  }

  return <CardThumbnail videoUrl={videoUrl} />;
}

function CardThumbnail({ videoUrl }) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.pause();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      fullscreenOptions={{ enabled: false }}
      showsPlaybackControls={false}
      nativeControls={false}
    />
  );
}

// ── Preview player for hand cards ──
function PreviewPlayer({ videoUrl }) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      fullscreenOptions={{ enabled: false }}
      showsPlaybackControls={false}
      nativeControls={false}
    />
  );
}

// ── Swipeable video card ──
function SwipeCard({ submission, onSwipeRight, onSwipeLeft, onBuy, onReport, onProfilePress }) {
  const [paused, setPaused] = useState(false);
  const player = useVideoPlayer(submission.videoUrl, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      pan.x.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5) {
        // Tap — toggle pause
        if (paused) { player.play(); setPaused(false); }
        else { player.pause(); setPaused(true); }
        return;
      }
      if (g.dx > 50 || (g.dx > 20 && g.vx > 0.5)) {
        Animated.timing(pan.x, { toValue: screenWidth, duration: 200, useNativeDriver: false })
          .start(() => {
            onSwipeRight();
            pan.setValue({ x: 0, y: 0 });
          });
      } else if (g.dx < -50 || (g.dx < -20 && g.vx < -0.5)) {
        Animated.timing(pan.x, { toValue: -screenWidth, duration: 200, useNativeDriver: false })
          .start(() => {
            onSwipeLeft();
            pan.setValue({ x: 0, y: 0 });
          });
      } else {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      }
    },
  })).current;

  const rotate = pan.x.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}

      style={[
        styles.swipeCard,
        { transform: [{ translateX: pan.x }, { rotate }] },
      ]}
    >
      <View pointerEvents="none" style={styles.swipeVideo}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          fullscreenOptions={{ enabled: false }}
          showsPlaybackControls={false}
          nativeControls={false}
        />
        {paused && (
          <View style={styles.pausedOverlay}>
            <Ionicons name="play" size={40} color="white" />
          </View>
        )}
      </View>
      {/* Labels */}
      <Animated.View style={[styles.swipeLabel, styles.swipeLabelRight, {
        opacity: pan.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' }),
      }]}>
        <Text style={styles.swipeLabelText}>VOTE</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeLabel, styles.swipeLabelLeft, {
        opacity: pan.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
      }]}>
        <Text style={styles.swipeLabelText}>SKIP</Text>
      </Animated.View>

      {/* Bottom info */}
      <View style={styles.swipeInfo}>
        <Pressable onPress={() => onProfilePress?.(submission.uid)}>
          <Text style={styles.swipeCreator}>@{submission.creatorUsername}</Text>
        </Pressable>
        <View style={styles.swipeActions}>
          {onBuy && (
            <Pressable style={styles.swipeBuyBtn} onPress={() => onBuy(submission)}>
              <Ionicons name="diamond" size={14} color={theme.colors.vibeBlue} />
              <Text style={styles.swipeBuyText}>Buy</Text>
            </Pressable>
          )}
          {onReport && (
            <Pressable style={styles.swipeReportBtn} onPress={() => onReport(submission)}>
              <Ionicons name="flag" size={14} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── Main Game Screen ──
export default function GameScreen({ navigation }) {
  const { user, userCurrency } = useAuth();
  const { showAlert, showError, showConfirm, showToast } = useModal();
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [currentVoteIndex, setCurrentVoteIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [mySnapples, setMySnapples] = useState([]);
  const [allSnapples, setAllSnapples] = useState([]);
  const [useRandomCards, setUseRandomCards] = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  const [isSpectating, setIsSpectating] = useState(false);
  const [timer, setTimer] = useState(0);
  const [previewCard, setPreviewCard] = useState(null);
  const timerRef = useRef(null);
  const unsubscribeRef = useRef(null);

  const hasDeck = mySnapples.length >= 6;

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

    if (game?.phase === GAME_PHASES.PICKING) {
      setTimer(30);
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
      setTimer(15); // 15 seconds per card
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            // Auto-skip when time runs out on this card
            advanceVote();
            return 15; // Reset for next card
          }
          return prev - 1;
        });
      }, 1000);
    } else if (game?.phase === GAME_PHASES.ROUND_RESULTS) {
      setTimer(10); // 10 seconds to view results
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
      });
    }
    return () => unsubscribeRef.current?.();
  }, [gameId]);

  const loadSnapples = async () => {
    try {
      const result = await snappleService.getActiveSnapples(100);
      if (result.success) {
        setAllSnapples(result.snapples);
        const deckIds = userCurrency.ownedCards || [];
        const deckSnapples = result.snapples.filter(s =>
          deckIds.includes(s.id) || s.creatorId === user?.uid
        );
        setMySnapples(deckSnapples);
      }
    } catch (error) {
      console.error('[GameScreen] Error loading snapples:', error);
    }
  };

  const getHandSnapples = () => {
    return useRandomCards ? allSnapples : mySnapples;
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

        // Bots auto-submit random cards
        const botPlayers = (game?.players || []).filter(p => p.uid?.startsWith('bot_'));
        for (const bot of botPlayers) {
          const botSnapple = allSnapples[Math.floor(Math.random() * allSnapples.length)];
          if (botSnapple) {
            await gameService.submitPick(gameId, bot.uid, botSnapple);
          }
        }
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
      const botNames = ['SnapBot', 'VibeMaster', 'CardShark'];
      for (const name of botNames) {
        await gameService.joinGame(createResult.gameId, `bot_${name}`, name);
      }

      // Start immediately
      const prompts = await gameService.getGamePrompts(gameService.ROUNDS_PER_GAME);

      await gameService.startGame(createResult.gameId, user.uid, prompts);

      // Bots auto-submit random snapples
      for (const name of botNames) {
        const botSnapple = allSnapples[Math.floor(Math.random() * allSnapples.length)];
        if (botSnapple) {
          await gameService.submitPick(createResult.gameId, `bot_${name}`, botSnapple);
        }
      }

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
    } catch (error) {
      showError('Error', 'Failed to submit pick');
      setSelectedCard(null);
    }
  };

  const handleSwipeRight = async () => {
    if (!game) return;
    const submission = game.submissions[currentVoteIndex];
    if (submission && submission.uid !== user.uid) {
      await gameService.castVote(gameId, user.uid, submission.uid);
    }
    advanceVote();
  };

  const handleSwipeLeft = () => {
    advanceVote();
  };

  const advanceVote = () => {
    if (!game) return;
    setTimer(15); // Reset per-card timer
    const votable = game.submissions.filter(s => s.uid !== user.uid);
    const nextIndex = currentVoteIndex + 1;
    if (nextIndex >= votable.length) {
      // Done voting — finish round (in practice, we're always host)
      if (game.hostId === user.uid) {
        // In practice, bots cast random votes
        if (isPractice) {
          const botPlayers = (game?.players || []).filter(p => p.uid?.startsWith('bot_'));
          const nonBotSubmissions = game.submissions.filter(s => !s.uid.startsWith('bot_'));
          botPlayers.forEach(bot => {
            if (nonBotSubmissions.length > 0) {
              const randomSub = nonBotSubmissions[Math.floor(Math.random() * nonBotSubmissions.length)];
              gameService.castVote(gameId, bot.uid, randomSub.uid);
            }
          });
        }
        setTimeout(() => gameService.finishRound(gameId), isPractice ? 500 : 0);
      }
    } else {
      setCurrentVoteIndex(nextIndex);
    }
  };

  const handleNextRound = async () => {
    setSelectedCard(null);
    setCurrentVoteIndex(0);
    const drawnHand = gameService.drawHand(getHandSnapples(), allSnapples);
    setHand(drawnHand);
    if (game.hostId === user.uid) {
      await gameService.nextRound(gameId);

      // Bots auto-submit each round
      const botPlayers = (game?.players || []).filter(p => p.uid?.startsWith('bot_'));
      for (const bot of botPlayers) {
        const botSnapple = allSnapples[Math.floor(Math.random() * allSnapples.length)];
        if (botSnapple) {
          await gameService.submitPick(gameId, bot.uid, botSnapple);
        }
      }
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

          let xpEarned = levelService.calculateGameXP(myReward.placement, opponentLevels, myLevel);
          let trophiesEarned = levelService.calculateTrophies(myReward.placement);

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
          if (trophiesEarned < 0 && (inventory.shields || 0) > 0) {
            trophiesEarned = 0;
            await updateDoc(doc(db, 'users', user.uid), {
              'inventory.shields': increment(-1),
            });
            showToast('reward', 'Shield Used!', 'Trophy loss blocked');
          }

          await updateUserCurrency({
            coins: (userCurrency.coins || 0) + myReward.coinsEarned,
          });

          const userRef = doc(db, 'users', user.uid);
          const updates = {
            'profile.experience': increment(xpEarned),
            'profile.xp': increment(xpEarned),
            'stats.gamesPlayed': increment(1),
            'stats.gamesWon': myReward.placement === 1 ? increment(1) : increment(0),
            'stats.totalCoinsEarned': increment(myReward.coinsEarned),
          };
          if (trophiesEarned !== 0) {
            updates['resources.trophies'] = increment(trophiesEarned);
          }
          await updateDoc(userRef, updates).catch(() => {});

          // Show game over
          const parts = [`#${myReward.placement}`];
          if (myReward.coinsEarned > 0) parts.push(`${myReward.coinsEarned} coins`);
          parts.push(`${xpEarned} XP`);
          if (trophiesEarned > 0) parts.push(`+${trophiesEarned} trophies`);
          if (trophiesEarned < 0) parts.push(`${trophiesEarned} trophies`);

          showAlert('Game Over!', parts.join(' — '));

          // Level up check
          const afterLevel = levelService.getLevelFromXP((user?.profile?.experience || 0) + xpEarned);
          if (afterLevel > myLevel) {
            setTimeout(() => showToast('level_up', `Level ${afterLevel}!`, `${levelService.xpForLevel(afterLevel + 1)} XP to next level`), 1000);
          }

          // Win streak toast
          if (myReward.placement === 1) {
            const afterSnap = await getDoc(userRef);
            const streak = (afterSnap.data()?.stats?.winStreak || 0) + 1;
            await updateDoc(userRef, { 'stats.winStreak': streak }).catch(() => {});
            if (streak >= 3) {
              setTimeout(() => showToast('streak', `${streak} Win Streak!`, 'Keep it going!'), 2000);
            }
          } else {
            await updateDoc(userRef, { 'stats.winStreak': 0 }).catch(() => {});
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
              const rewards = [];
              if (a.coins) rewards.push(`+${a.coins}c`);
              if (a.xp) rewards.push(`+${a.xp}xp`);
              if (a.trophies) rewards.push(`+${a.trophies}t`);
              setTimeout(() => showToast('achievement', a.name, rewards.join(' ')), 3500 + i * 1500);
            });
          } catch (e) {}
        } catch (e) {
          showAlert('Game Over', `You placed #${myReward.placement}`);
        }
      }
    }

    // Unsubscribe from game updates
    unsubscribeRef.current?.();

    // Archive the game then clean up
    if (gameId && game) {
      try {
        const { doc: docRef, setDoc, deleteDoc } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        // Archive to gameHistory
        await setDoc(docRef(db, 'gameHistory', gameId), {
          ...game,
          finishedAt: new Date().toISOString(),
        });
        // Delete from active games
        await deleteDoc(docRef(db, 'games', gameId));
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
  };

  // ── RENDER PHASES ──

  // No game — show lobby options
  if (!gameId || !game) {
    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
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
              onPress={() => setShowCustomMenu(prev => !prev)}
              variant="toggle"
              color="blue"
            />
            {showCustomMenu && (
              <View style={styles.customMenu}>
                <VibeButton
                  label={isLoading ? "Searching..." : "Find Game"}
                  onPress={handleFindGame}
                  variant="toggle"
                  color="green"
                  disabled={isLoading}
                />
                <VibeButton
                  label="Create Game"
                  onPress={handleCreateGame}
                  variant="toggle"
                  color="blue"
                  disabled={isLoading}
                />
              </View>
            )}
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

        <ButtonContainer>
          <NavButton title="Prompts" onPress={() => navigation.navigate('Home')} />
          <NavButton title="Deck" onPress={() => navigation.navigate('DeckBuilder')} />
          <NavButton title="Play" onPress={() => navigation.navigate('Game')} active />
          <NavButton title="Profile" onPress={() => navigation.navigate('UserProfile', { userId: user?.uid })} />
          <NavButton title="Store" onPress={() => navigation.navigate('Store')} />
        </ButtonContainer>
      </LinearGradient>
    );
  }

  // Lobby — waiting for players
  if (game.phase === GAME_PHASES.LOBBY) {
    const isHost = game.hostId === user.uid;
    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleLeaveGame}>
            <View style={styles.backBg}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </View>
          </Pressable>
          <Text style={styles.headerTitle}>Lobby</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.lobbyContent}>
          <Text style={styles.lobbyTitle}>Waiting for Players</Text>
          <Text style={styles.lobbySubtitle}>{game.players.length}/{gameService.MAX_PLAYERS} players</Text>

          <View style={styles.playerList}>
            {game.players.map((p, i) => (
              <View key={p.uid} style={styles.playerRow}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{p.username.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.playerName}>@{p.username}</Text>
                {p.uid === game.hostId && <Text style={styles.hostBadge}>HOST</Text>}
              </View>
            ))}
          </View>

          {isHost && (
            <View style={styles.lobbyButtons}>
              {game.players.length < gameService.MAX_PLAYERS && (
                <VibeButton label="+ Add Bot" onPress={handleAddBot} variant="toggle" color="cyan" />
              )}
              {game.players.length >= 2 ? (
                <VibeButton label="Start Game" onPress={handleStartGame} />
              ) : (
                <Text style={styles.waitingText}>Need at least 2 players to start</Text>
              )}
            </View>
          )}

          <Text style={styles.gameCode}>Game ID: {gameId.slice(0, 6).toUpperCase()}</Text>
        </View>
      </LinearGradient>
    );
  }

  // Picking phase — choose a card from your hand
  if (game.phase === GAME_PHASES.PICKING) {
    const currentPrompt = game.prompts[game.currentRound - 1] || 'Show us something!';
    const alreadyPicked = game.submissions.some(s => s.uid === user.uid);

    // Draw hand if empty
    if (hand.length === 0 && mySnapples.length > 0) {
      setHand(gameService.drawHand(mySnapples, allSnapples));
    }

    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleLeaveGame}>
            <View style={styles.backBg}>
              <Ionicons name="close" size={18} color="white" />
            </View>
          </Pressable>
          <Text style={styles.headerTitle}>Round {game.currentRound}/{game.totalRounds}</Text>
          <Text style={styles.timerText}>{timer}s</Text>
        </View>

        {/* Prompt */}
        <View style={styles.promptBanner}>
          <Text style={styles.promptText}>{currentPrompt}</Text>
        </View>

        {alreadyPicked ? (
          <View style={styles.centerContent}>
            <Ionicons name="checkmark-circle" size={48} color={theme.colors.vibeGreen} />
            <Text style={styles.waitingText}>Card submitted! Waiting for others...</Text>
            <Text style={styles.submittedCount}>
              {game.submissions.length}/{game.players.length} submitted
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.pickHeader}>
              <Text style={styles.pickInstruction}>Tap a card to preview, then play it</Text>
              {(user?.inventory?.mulligans || 0) > 0 && (
                <Pressable style={styles.mulliganBtn} onPress={async () => {
                  if (hand.length === 0) return;
                  // Remove worst card, draw a new one
                  const remaining = mySnapples.filter(s => !hand.some(h => h.id === s.id));
                  if (remaining.length === 0) {
                    showAlert('No Cards', 'No more cards to draw from your deck');
                    return;
                  }
                  const newCard = remaining[Math.floor(Math.random() * remaining.length)];
                  const newHand = [...hand];
                  newHand[newHand.length - 1] = newCard;
                  setHand(newHand);
                  try {
                    const { doc: mDoc, updateDoc: mUpdate, increment: mInc } = await import('firebase/firestore');
                    const { db: mDb } = await import('../services/firebase');
                    await mUpdate(mDoc(mDb, 'users', user.uid), {
                      'inventory.mulligans': mInc(-1),
                    });
                  } catch (e) {}
                  showToast('reward', 'Mulligan!', 'Card swapped');
                }}>
                  <Ionicons name="refresh" size={16} color={theme.colors.vibeGreen} />
                  <Text style={styles.mulliganText}>Mulligan ({user?.inventory?.mulligans || 0})</Text>
                </Pressable>
              )}
            </View>
            <FlatList
              data={hand}
              keyExtractor={(item, i) => item?.id || `hand-${i}`}
              numColumns={3}
              columnWrapperStyle={styles.handRow}
              contentContainerStyle={styles.handContainer}
              renderItem={({ item, index }) => (
                <Pressable
                  style={[styles.handCard, selectedCard?.id === item.id && styles.handCardSelected]}
                  onPress={() => setPreviewCard(item)}
                >
                  <View style={styles.handCardVideo}>
                    {item.videoUrl ? <SnappleThumbnailImg videoUrl={item.videoUrl} /> : null}
                  </View>
                </Pressable>
              )}
            />
          </>
        )}

        {/* Card Preview Modal */}
        {previewCard && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewCard(null)}>
            <View style={styles.previewOverlay}>
              <View style={styles.previewCard}>
                <PreviewPlayer videoUrl={previewCard.videoUrl} />

                <View style={styles.previewInfo}>
                  <Text style={styles.previewCreator}>@{previewCard.creatorUsername || 'anonymous'}</Text>
                  <Text style={styles.previewPromptLabel}>{previewCard.prompt}</Text>
                </View>

                <View style={styles.previewButtons}>
                  <Pressable style={styles.previewCancel} onPress={() => setPreviewCard(null)}>
                    <Text style={styles.previewCancelText}>Back</Text>
                  </Pressable>
                  <Pressable style={styles.previewPlay} onPress={() => {
                    handlePickCard(previewCard);
                    setPreviewCard(null);
                  }}>
                    <Text style={styles.previewPlayText}>Play This Card</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </LinearGradient>
    );
  }

  // Voting phase — swipe through submissions (skip own unless spectating)
  if (game.phase === GAME_PHASES.VOTING) {
    const votableSubmissions = isSpectating
      ? game.submissions
      : game.submissions.filter(s => s.uid !== user.uid);
    const currentSubmission = votableSubmissions[currentVoteIndex];
    const doneVoting = currentVoteIndex >= votableSubmissions.length;

    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleLeaveGame}>
            <View style={styles.backBg}>
              <Ionicons name="close" size={18} color="white" />
            </View>
          </Pressable>
          <Text style={styles.headerTitle}>{isSpectating ? 'Watching' : 'Vote'} — Round {game.currentRound}</Text>
          {!isSpectating && <Text style={styles.timerText}>{timer}s</Text>}
          {isSpectating && (
            <Pressable onPress={handleLeaveGame}>
              <View style={styles.backBg}>
                <Ionicons name="close" size={18} color="white" />
              </View>
            </Pressable>
          )}
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

        {doneVoting ? (
          <View style={styles.centerContent}>
            <Text style={styles.waitingText}>Votes are in! Tallying results...</Text>
            <ActivityIndicator color={theme.colors.vibeBlue} style={{ marginTop: 16 }} />
          </View>
        ) : (
          <View style={styles.swipeContainer}>
            <SwipeCard
              key={currentVoteIndex}
              submission={currentSubmission}
              onSwipeRight={handleSwipeRight}
              onSwipeLeft={handleSwipeLeft}
              onBuy={(sub) => {
                showConfirm(
                  'Buy Snapple',
                  `Add this snapple to your collection?`,
                  async () => {
                    try {
                      await snappleService.purchaseSnapple(sub.snappleId, user.uid);
                    } catch (e) {}
                  }
                );
              }}
              onReport={(sub) => {
                showConfirm(
                  'Report Snapple',
                  'Report this content as inappropriate?',
                  async () => {
                    try {
                      await snappleService.reportSnapple(sub.snappleId, user.uid, 'inappropriate');
                    } catch (e) {}
                  }
                );
              }}
              onProfilePress={(uid) => {
                navigation.navigate('UserProfile', { userId: uid });
              }}
            />

            <View style={styles.swipeHints}>
              <Text style={styles.swipeHintLeft}>← SKIP</Text>
              <Text style={styles.voteCounter}>{currentVoteIndex + 1}/{votableSubmissions.length}</Text>
              <Text style={styles.swipeHintRight}>VOTE →</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    );
  }

  // Round results
  if (game.phase === GAME_PHASES.ROUND_RESULTS) {
    const isHost = game.hostId === user.uid;
    const sortedPlayers = [...game.players].sort((a, b) => b.points - a.points);
    const lastRoundResult = game.roundResults[game.roundResults.length - 1];

    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 36 }} />
          <Text style={styles.headerTitle}>Round {game.currentRound} Results</Text>
          <Text style={styles.timerText}>{timer}s</Text>
        </View>

        <View style={styles.resultsContent}>
          {sortedPlayers.map((p, i) => {
            const roundPts = lastRoundResult?.rankings?.find(r => r.uid === p.uid);
            const playerSub = game.submissions.find(s => s.uid === p.uid);
            return (
              <View key={p.uid} style={[styles.resultRow, i === 0 && styles.resultRowFirst]}>
                <Text style={styles.resultPlacement}>#{i + 1}</Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName}>@{p.username}</Text>
                  {playerSub && (
                    <Text style={styles.resultCard} numberOfLines={1}>
                      Played: {playerSub.prompt || playerSub.creatorUsername || 'a snapple'}
                    </Text>
                  )}
                </View>
                <Text style={styles.resultRoundPts}>+{roundPts?.pointsEarned || 0}</Text>
                <Text style={styles.resultTotal}>{p.points} pts</Text>
              </View>
            );
          })}

          <View style={styles.resultsActions}>
            {isHost && (
              <VibeButton label="Next Round" onPress={handleNextRound} />
            )}
            {!isHost && (
              <Text style={styles.waitingText}>Next round in {timer}s...</Text>
            )}
            <Pressable style={styles.shareResultsBtn} onPress={async () => {
              try {
                const { Share } = require('react-native');
                const prompt = game.prompts[game.currentRound - 1] || '';
                // Find the winning submission's video
                const winnerUid = lastRoundResult?.rankings?.[0]?.uid;
                const winningSub = game.submissions.find(s => s.uid === winnerUid);
                const videoUrl = winningSub?.videoUrl || '';

                await Share.share({
                  message: `"${prompt}" 🎬\n\nCheck out this round on Snappled!\n\n${videoUrl ? videoUrl + '\n\n' : ''}${sortedPlayers.map((p, i) => `#${i+1} @${p.username}`).join('\n')}\n\n🔥 Get Snappled — snappled://`,
                });
              } catch (e) {}
            }}>
              <Ionicons name="share-social" size={16} color={theme.colors.vibeBlue} />
              <Text style={styles.shareResultsText}>Share Round</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    );
  }

  // Final results
  if (game.phase === GAME_PHASES.FINAL_RESULTS) {
    const rewards = gameService.calculateRewards(game.players);

    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 36 }} />
          <Text style={styles.headerTitle}>Final Results</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.resultsContent}>
          {rewards.map((p, i) => (
            <View key={p.uid} style={[styles.resultRow, i === 0 && styles.resultRowFirst]}>
              <Text style={styles.resultPlacement}>#{p.placement}</Text>
              <Text style={styles.resultName}>@{p.username}</Text>
              <Text style={styles.resultTotal}>{p.points} pts</Text>
              <Text style={styles.resultCoins}>+{p.coinsEarned} 🪙</Text>
            </View>
          ))}

          <View style={styles.resultsActions}>
            <VibeButton label="Done" onPress={handleFinish} />
            <Pressable style={styles.shareResultsBtn} onPress={async () => {
              try {
                const { Share } = require('react-native');
                const winner = rewards[0];
                const winningSub = game.submissions.find(s => s.uid === winner?.uid);
                await Share.share({
                  message: `🏆 Game Over on Snappled!\n\nWinner: @${winner?.username}\n${winningSub?.videoUrl ? winningSub.videoUrl + '\n\n' : '\n'}${rewards.map(p => `#${p.placement} @${p.username} — ${p.points} pts`).join('\n')}\n\n🔥 Get Snappled — snappled://`,
                });
              } catch (e) {}
            }}>
              <Ionicons name="share-social" size={16} color={theme.colors.vibeBlue} />
              <Text style={styles.shareResultsText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    );
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
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 80, gap: 16,
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
  playerList: { width: '100%', gap: 12, marginTop: 16 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 12,
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
  },
  playerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,198,255,0.1)',
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    justifyContent: 'center', alignItems: 'center',
  },
  playerAvatarText: { color: theme.colors.vibeBlue, fontSize: 16, fontWeight: 'bold' },
  playerName: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.fontWeights.semiBold, flex: 1 },
  hostBadge: {
    color: theme.colors.vibeYellow, fontSize: 10, fontWeight: 'bold',
    backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  gameCode: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 16 },
  waitingText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 12 },
  // Picking
  promptBanner: {
    marginHorizontal: 16, marginTop: 12, padding: 20, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  promptText: {
    color: 'white', fontSize: 18, fontWeight: theme.fontWeights.bold,
    textAlign: 'center', lineHeight: 24,
  },
  pickHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 8, gap: 12, paddingHorizontal: 16,
  },
  pickInstruction: {
    color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center',
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
  submittedCount: { color: theme.colors.vibeBlue, fontSize: 16, fontWeight: 'bold' },
  handContainer: { paddingHorizontal: 12, paddingBottom: 40 },
  handRow: { gap: 8, marginBottom: 8 },
  handCard: {
    width: (screenWidth - 40) / 3, aspectRatio: 9 / 16, borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.colors.vibeBlue, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  handCardSelected: { borderColor: theme.colors.vibeGreen, borderWidth: 3 },
  handCardVideo: { flex: 1 },
  // Voting
  swipeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  swipeCard: {
    width: screenWidth - 48, height: screenHeight * 0.55, borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: theme.colors.vibeBlue, backgroundColor: '#000',
  },
  swipeVideo: { flex: 1 },
  swipeLabel: {
    position: 'absolute', top: 24, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 3,
  },
  swipeLabelRight: {
    right: 16, borderColor: theme.colors.vibeGreen, backgroundColor: 'rgba(0,255,65,0.2)',
  },
  swipeLabelLeft: {
    left: 16, borderColor: theme.colors.vibeRed, backgroundColor: 'rgba(255,68,68,0.2)',
  },
  swipeLabelText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  swipeInfo: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  swipeCreator: {
    color: 'white', fontSize: 14, fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  swipeActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  swipeBuyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: theme.colors.vibeBlue,
  },
  swipeBuyText: {
    color: theme.colors.vibeBlue, fontSize: 12, fontWeight: 'bold',
  },
  swipeReportBtn: {
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 6,
    borderRadius: 12,
  },
  replayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  replayButton: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
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
  resultRoundPts: { color: theme.colors.vibeGreen, fontSize: 14, fontWeight: 'bold' },
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
