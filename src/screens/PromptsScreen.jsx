import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, ScrollView, View, Text, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppLayout from '../components/ui/layout/AppLayout';
import PromptInfoOverlay from '../components/ui/modals/PromptInfoOverlay';
import SnappleOverlay from '../components/ui/modals/SnappleOverlay';
import GamePromptsPanel from '../components/ui/GamePromptsPanel';
import SectionTabs from '../components/ui/SectionTabs';
import CreatePromptCard from '../components/ui/CreatePromptCard';
import SwipeToRate from '../components/ui/SwipeToRate';
import SnappleThumbnail from '../components/ui/SnappleThumbnail';
import RoundStartOverlay from '../components/game/RoundStartOverlay';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { promptService } from '../services/promptService';
import { promptVoteService } from '../services/promptVoteService';
import { snappleService } from '../services/snappleService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { promptRotationService } from '../services/promptRotationService';
import { userService } from '../services/userService';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';


// Bumping this string re-shows the intro to everyone, which is the
// only way to reintroduce the screen if its copy ever changes
// meaningfully.
const PROMPTS_INTRO_KEY = 'promptsIntroSeen:v1';

// What the "?" explains, per tab. Both tabs answer to one button in the
// tab row rather than each growing its own - the help is always in the
// same place, and what it says follows the tab you are on.
const HELP = {
  snapple: {
    title: 'Snapple Prompts',
    bullets: [
      'Prompts are ideas for making snapples',
      'Tap one to browse the snapples answering it',
      'Swipe a prompt right if it is good, left if it is weak',
      'Hit CREATE A PROMPT to add your own',
      'Each prompt is live for 24 hours, then a new one takes over',
    ],
  },
  game: {
    title: 'Game Prompts',
    bullets: [
      'These are what each round asks the room',
      'Swipe right to keep a prompt, left to cut it',
      'Suggest your own \u2014 the best-ranked make the deck',
      'Tap the flag to report one',
    ],
  },
};

// How many snapples the pool draws. Twelve is four rows of three -
// enough to show the place is alive without turning a screen about
// prompts into a gallery.
const POOL_SHOWN = 12;

export default function PromptsScreen({ navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, userCurrency, pendingAchievements, clearPendingAchievements } = useAuth();
  // Snapple prompts are the live rotation you record against; game
  // prompts are what a round asks the room. Two different things that
  // were never presented as such - the game ones had no screen at all.
  const [section, setSection] = useState('snapple');
  const { showToast } = useModal();

  // Show pending achievements from login check
  useEffect(() => {
    if (pendingAchievements.length > 0) {
      pendingAchievements.forEach((a, i) => {
        const rewards = [];
        if (a.coins) rewards.push(`+${a.coins}c`);
        if (a.xp) rewards.push(`+${a.xp}xp`);
        if (a.trophies) rewards.push(`+${a.trophies}t`);
        setTimeout(() => showToast('achievement', a.name, rewards.join(' ')), 1000 + i * 1500);
      });
      clearPendingAchievements();
    }
  }, [pendingAchievements]);

  // State
  const [prompts, setPrompts] = useState([]);
  // The browse pool under the prompts. Loaded once per visit; the
  // shuffle lives in the service so it is different each time.
  const [pool, setPool] = useState([]);
  // promptId -> 1 | -1, this user's own ratings of the LIVE prompts.
  const [myVotes, setMyVotes] = useState({});
  const [poolIndex, setPoolIndex] = useState(0);
  const [poolOpen, setPoolOpen] = useState(false);

  // Only the newest handful are drawn. The full list still feeds the
  // per-prompt counts below - a grid of everything turned the prompts
  // screen into a gallery, and the point of the pool is to show that
  // snapples exist, not to be the destination.
  const poolShown = useMemo(() => pool.slice(0, POOL_SHOWN), [pool]);

  // How many snapples answer each prompt, derived from the pool rather
  // than queried.
  //
  // Indexed by promptId AND by prompt text, because that is how
  // getSnapplesByPrompt finds them and the number has to agree with the
  // list it is advertising. A prompt that expires and comes back gets a
  // NEW activePrompts doc id while the snapples keep pointing at the old
  // one - so an id-only count went blank on every recycled prompt even
  // though tapping it still listed them. Only one of the 24 live prompts
  // had an id that any snapple still matched.
  //
  // Sets of ids, not tallies: a snapple matching on both keys must not
  // be counted twice.
  const snappleIndex = useMemo(() => {
    const byId = new Map();
    const byText = new Map();
    const add = (map, key, id) => {
      if (!key) return;
      const set = map.get(key);
      if (set) set.add(id);
      else map.set(key, new Set([id]));
    };
    pool.forEach((snap) => {
      add(byId, snap.promptId, snap.id);
      add(byText, snap.prompt || snap.promptText, snap.id);
    });
    return { byId, byText };
  }, [pool]);

  // Exact text match, not the normalised key, because that is what
  // getSnapplesByPrompt uses. A cleverer match here would make the chip
  // promise more snapples than the list can show.
  const countFor = useCallback((prompt) => {
    const byId = snappleIndex.byId.get(prompt?.id);
    const byText = snappleIndex.byText.get(prompt?.text);
    if (!byId) return byText ? byText.size : 0;
    if (!byText) return byId.size;
    const union = new Set(byId);
    byText.forEach(id => union.add(id));
    return union.size;
  }, [snappleIndex]);

  // One-line intro, the same idea as the in-game phase intros. Shown
  // ONCE EVER rather than once per session: unlike a round, this screen
  // is somewhere you return to constantly, and a tap-to-dismiss card on
  // every visit is a toll rather than an explanation.
  // null, or which tab's help is open.
  const [help, setHelp] = useState(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PROMPTS_INTRO_KEY)
      .then((seen) => { if (!seen && !cancelled) setHelp('snapple'); })
      // Storage unavailable just means it is not shown. Better than
      // showing it forever on a device that cannot remember.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The game tab explains itself the first time it is opened each
  // session, the way a game shows a phase intro on round one rather than
  // every round. The "?" brings it back after that.
  const gameHelpSeen = useRef(false);
  useEffect(() => {
    if (section !== 'game' || gameHelpSeen.current) return;
    gameHelpSeen.current = true;
    setHelp('game');
  }, [section]);

  // Once the game tab has been opened it stays mounted, hidden rather
  // than unmounted, for the rest of the visit.
  const [gameOpened, setGameOpened] = useState(false);
  useEffect(() => { if (section === 'game') setGameOpened(true); }, [section]);

  const dismissIntro = () => {
    setHelp(null);
    AsyncStorage.setItem(PROMPTS_INTRO_KEY, '1').catch(() => {});
  };
  const [selectedPromptForInfo, setSelectedPromptForInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Reload when the hour turns. This used to also drive a visible
  // countdown, but how long a prompt lasts is a fact you need once and
  // it is in the help now - so the minute-by-minute state that only
  // existed to render it is gone, and the reload it was sharing an
  // interval with is all that remains.
  useEffect(() => {
    const interval = setInterval(() => {
      if (new Date().getMinutes() === 0) loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seededRef = useRef(false);

  // Real-time listener for prompts
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      promptRotationService.seedPromptPool();
    }

    const unsubscribe = promptRotationService.subscribeToActivePrompts((livePrompts) => {
      setPrompts(livePrompts);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    // Started BEFORE the prompts are awaited, not after. The chips are
    // drawn from this, so sequencing it behind the prompt fetch is what
    // made them show up a beat after the cards they belong to.
    const poolPromise = snappleService.getPoolSnapples()
      .then(r => (r?.success ? r.snapples || [] : []))
      .catch(() => []);

    const { prompts: allPrompts } = await promptRotationService.getActivePrompts();
    setPrompts(allPrompts);

    // Fetched by document id for exactly the prompts on screen, so the
    // cost is one small read per visible card rather than one per vote
    // this person has ever cast.
    if (user?.uid && allPrompts?.length) {
      promptVoteService
        .getMyVotes(user.uid, 'activePrompts', allPrompts.map(p => p.id))
        .then(setMyVotes)
        .catch(() => {});
    }

    // Best-effort: a pool that fails to load costs nothing but itself.
    setPool(await poolPromise);
  };

  const handlePromptPress = (prompt, index) => {
    navigation.navigate('Snapples', { promptId: prompt.id, promptIndex: index });
  };

  const handlePromptLongPress = (prompt) => {
    setSelectedPromptForInfo(prompt);
  };

  const handlePromptInfoClose = () => {
    setSelectedPromptForInfo(null);
  };

  const handlePromptLike = async (promptId) => {
    if (!user?.uid) return;
    // Was promptService.likePrompt, which read the doc and then pushed
    // the uid into a `likes[]` array on it. That array is capped by
    // Firestore's 1 MiB document limit at roughly 31,000 voters, the
    // read-then-write could lose a concurrent vote, and every voter on a
    // prompt wrote to the SAME document - about 1 write/second before
    // contention. A vote is now its own doc and a trigger owns the count.
    const result = await promptVoteService.vote(promptId, user.uid, 1, 'activePrompts');
    
    // Update the prompt in local state if successful
    if (result?.success) {
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            const wasDisliked = prompt.dislikes?.includes(user.uid);
            return {
              ...prompt,
              likeCount: (prompt.likeCount || 0) + 1,
              dislikeCount: wasDisliked ? (prompt.dislikeCount || 0) - 1 : (prompt.dislikeCount || 0),
              likes: [...(prompt.likes || []), user.uid],
              dislikes: (prompt.dislikes || []).filter(id => id !== user.uid)
            };
          }
          return prompt;
        })
      );
    }
    
    return result;
  };

  const handlePromptDislike = async (promptId) => {
    if (!user?.uid) return;
    const result = await promptVoteService.vote(promptId, user.uid, -1, 'activePrompts');
    
    // Update the prompt in local state if successful
    if (result?.success) {
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            const wasLiked = prompt.likes?.includes(user.uid);
            return {
              ...prompt,
              dislikeCount: (prompt.dislikeCount || 0) + 1,
              likeCount: wasLiked ? (prompt.likeCount || 0) - 1 : (prompt.likeCount || 0),
              dislikes: [...(prompt.dislikes || []), user.uid],
              likes: (prompt.likes || []).filter(id => id !== user.uid)
            };
          }
          return prompt;
        })
      );
    }
    
    return result;
  };

  // Optimistic: the stamp lands under the thumb and the write follows.
  // The vote document is idempotent and keyed to this user, so a failed
  // write costs one rating rather than corrupting a count - and swiping
  // the other way later just overwrites it.
  const handlePromptRate = (promptId, value) => {
    if (!user?.uid) return;
    setMyVotes(prev => (prev[promptId] === value
      ? prev
      : { ...prev, [promptId]: value }));
    promptVoteService.vote(promptId, user.uid, value, 'activePrompts');
  };

  const handlePromptReport = async (promptId, reason) => {
    if (!user?.uid) return;
    const result = await promptService.reportPrompt(promptId, user.uid, reason);
    
    // Update the prompt in local state if successful
    if (result?.success) {
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            return {
              ...prompt,
              reportCount: (prompt.reportCount || 0) + 1,
              reports: [...(prompt.reports || []), user.uid]
            };
          }
          return prompt;
        })
      );
    }
    
    return result;
  };

  const handlePromptView = async (promptId) => {
    try {
      await promptService.incrementViews(promptId, 'activePrompts');
      
      // Update local state optimistically
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            return {
              ...prompt,
              totalViews: (prompt.totalViews || 0) + 1
            };
          }
          return prompt;
        })
      );
    } catch (error) {
      console.error('[PromptsScreen] Error tracking view:', error);
    }
  };

  const handleVisitProfile = (userId) => {
    // TODO: Navigate to user profile screen
    console.log('Visit profile for user:', userId);
  };

  const handleFollowUser = async (userId) => {
    console.log('[PromptsScreen] handleFollowUser called', {
      currentUser: user?.uid,
      targetUser: userId,
      userAuthenticated: !!user?.uid
    });

    if (!user?.uid) {
      console.error('[PromptsScreen] User not authenticated');
      return {
        success: false,
        error: 'User not authenticated'
      };
    }

    try {
      console.log('[PromptsScreen] Calling userService.toggleFollow');
      const result = await userService.toggleFollow(user.uid, userId);
      console.log('[PromptsScreen] toggleFollow result:', result);
      
      if (result.success) {
        console.log(`[PromptsScreen] ${result.isFollowing ? 'Followed' : 'Unfollowed'} user:`, userId);
      } else {
        console.error('[PromptsScreen] Follow operation failed:', result.error);
      }
      return result;
    } catch (error) {
      console.error('[PromptsScreen] Error in follow operation:', error);
      return {
        success: false,
        error: 'Failed to update follow status'
      };
    }
  };

  const handleCreatePrompt = () => {
    navigation.navigate('CreatePrompt');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getPromptGradient = (index) => {
    // Every pair has to travel a real distance in hue, or the card
    // reads as one flat colour. vibeOrange (#FFCC66) to vibeYellow
    // (#FFD700) was the odd one out - two pale golds a few percent
    // apart, so that card looked like a solid yellow-orange while the
    // rest visibly graded. Paired with red instead, which is what
    // PromptCarousel already does with the same orange.
    const gradients = [
      [theme.colors.vibeBlue, theme.colors.vibeGreen],
      [theme.colors.vibePurple, theme.colors.vibePink],
      [theme.colors.vibeOrange, theme.colors.vibeRed],
      [theme.colors.vibePink, theme.colors.vibeBlue],
      [theme.colors.vibeGreen, theme.colors.vibeOrange],
    ];
    return gradients[index % gradients.length];
  };

  const userStats = {
    tokens: userCurrency.tokens || 0,
    coins: userCurrency.coins || 0,
    trophies: userCurrency.trophies || 0,
    level: userCurrency.level || 1,
    xp: user?.profile?.experience || 0,
    username: user?.username || user?.email?.split('@')[0] || 'Player'
  };

  const showLoadingState = isLoading && prompts.length === 0;

  return (
    <AppLayout navigation={navigation} active="prompts">

        {/* Nothing above the tabs. A masthead here was tried and looked
            wrong: on the play screen the wordmark is the whole point of
            the screen, over a list it is just a band of logo you scroll
            past. The tabs and the nav bar already say where you are. */}
        <View style={styles.tabRow}>
          <SectionTabs
            options={[
              { label: 'Snapple Prompts', value: 'snapple' },
              { label: 'Game Prompts', value: 'game' },
            ]}
            value={section}
            onChange={setSection}
            style={styles.tabsFlex}
          />
          {/* The same "?" the game header uses. */}
          <Pressable style={styles.helpBtn} onPress={() => setHelp(section)} hitSlop={8}>
            <Text style={styles.helpText}>?</Text>
          </Pressable>
        </View>

        {/* Both tabs stay mounted and the inactive one is hidden, rather
            than swapping one out for the other. Unmounting threw away
            everything the tab had loaded, so coming back re-read the
            whole game prompt collection - about 151 documents to show
            ten cards - and dealt you a fresh stack from the top. Hidden,
            a return costs nothing and you are still on the card you were
            looking at. */}
        <View style={[styles.pane, section !== 'snapple' && styles.paneHidden]}>
        {showLoadingState ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
            <Text style={{ color: t.colors.textSecondary, fontSize: 14 }}>Loading prompts...</Text>
          </View>
        ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.vibeBlue}
            />
          }
        >
          <View style={styles.promptsList}>
            <CreatePromptCard label="Create a Prompt" onPress={handleCreatePrompt} />

            {prompts.map((prompt, index) => (
              // Rating lived inside PromptInfoOverlay, which you had to
              // open first - most of why live prompts were never rated.
              // A verdict you can give with your thumb, without leaving
              // the list, is one people will actually give.
              <SwipeToRate
                key={prompt.id || index}
                value={myVotes[prompt.id] ?? null}
                onRate={(v) => handlePromptRate(prompt.id, v)}
              >
              <Pressable
                style={styles.promptCard}
                onPress={() => handlePromptPress(prompt, index)}
                onLongPress={() => handlePromptLongPress(prompt)}
              >
                <LinearGradient
                  colors={getPromptGradient(index)}
                  style={styles.cardGradient}
                >
                  {/* How many snapples answer this prompt. Hidden at
                      zero rather than showing "0": most prompts have
                      none, and a wall of zeroes advertises how empty
                      the library is. A number that only appears when
                      there is something to see turns the card into a
                      reason to tap it.
                      Counted from the pool already loaded for the grid
                      below, so it costs no extra read. */}
                  {countFor(prompt) > 0 && (
                    <View style={styles.countChip}>
                      <Text style={styles.countChipText}>
                        {countFor(prompt)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardContent}>
                    {prompt.lockoutAt && new Date().toISOString() >= prompt.lockoutAt && (
                      <Text style={styles.lockoutBadge}>CLOSING SOON</Text>
                    )}
                    <Text style={styles.promptText} numberOfLines={3}>
                      {prompt.text || prompt.prompt || 'Create something amazing!'}
                    </Text>
                  </View>
                </LinearGradient>
              </Pressable>
              </SwipeToRate>
            ))}
          </View>

          {/* Browse pool.
              Global rather than per prompt, which was the obvious
              alternative and the wrong one: of 347 prompts only 48 have
              a snapple at all and 43 of those have exactly one, so a
              per-prompt pool would be an empty box nearly every time
              you opened it. Drawing from every snapple sidesteps the
              distribution entirely.
              Cheap to show: these are the stored ~30KB tiles, so the
              grid costs almost nothing until someone taps play. */}
          {poolShown.length > 0 && (
            <View style={styles.poolSection}>
              <Text style={styles.poolLabel}>SNAPPLE POOL</Text>
              <View style={styles.poolGrid}>
                {poolShown.map((snap, i) => (
                  <Pressable
                    key={snap.id}
                    style={styles.poolCell}
                    onPress={() => { setPoolIndex(i); setPoolOpen(true); }}
                  >
                    <View style={styles.poolTile}>
                      <SnappleThumbnail
                        videoUrl={snap.videoUrl}
                        thumbUrl={snap.gridThumbUrl}
                      />
                    </View>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.poolEnd}>
                {pool.length > POOL_SHOWN
                  ? `newest ${POOL_SHOWN} of ${pool.length}`
                  : 'newest snapples'}
              </Text>
            </View>
          )}
        </ScrollView>
        )}
        </View>

        {/* Mounted only after the tab is first opened, so someone who
            never visits it never pays for it. */}
        {gameOpened && (
          <View style={[styles.pane, section !== 'game' && styles.paneHidden]}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              <GamePromptsPanel user={user} tickets={userCurrency?.tokens || 0} />
            </ScrollView>
          </View>
        )}

        {/* How long a prompt lasts is said once, in here. It was a live
            countdown pinned above the list, which is a lot of permanent
            furniture for a fact you need once. */}
        <RoundStartOverlay
          visible={!!help}
          title={HELP[help]?.title}
          bullets={HELP[help]?.bullets}
          onDismiss={dismissIntro}
        />

        <SnappleOverlay
          visible={poolOpen}
          snapple={pool[poolIndex]}
          snapples={pool}
          initialIndex={poolIndex}
          onClose={() => setPoolOpen(false)}
          navigation={navigation}
        />

        {/* Prompt Info Overlay */}
        <PromptInfoOverlay
          visible={!!selectedPromptForInfo}
          prompt={selectedPromptForInfo}
          onClose={handlePromptInfoClose}
          onLike={handlePromptLike}
          onDislike={handlePromptDislike}
          onReport={handlePromptReport}
          onCreateSnapple={(prompt) => navigation.navigate('Record', { prompt })}
          onCreatePrompt={handleCreatePrompt}
          onView={handlePromptView}
          onVisitProfile={handleVisitProfile}
          onFollowUser={handleFollowUser}
          navigation={navigation}
          onRefresh={loadData}
        />

    </AppLayout>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingBottom: 80,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  tabsFlex: { flex: 1 },
  pane: { flex: 1 },
  // display:none keeps the subtree mounted and its state intact while
  // taking it out of the layout entirely.
  paneHidden: { display: 'none' },
  // Matches the in-game help button in RoundHeaderBar.
  helpBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  helpText: { color: 'white', fontSize: 13, fontWeight: '900', lineHeight: 15 },
  scrollView: {
    flex: 1,
  },
  countChip: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    zIndex: 2,
  },
  countChipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  poolSection: {
    marginTop: 28,
    paddingHorizontal: 12,
  },
  poolLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  poolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Three across. Two would make each tile as big as a prompt card and
  // turn the pool into the point of the screen; three reads as a
  // gallery you dip into.
  poolCell: {
    width: '33.333%',
    padding: 3,
  },
  poolTile: {
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  poolEnd: {
    color: t.colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  promptsList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  promptCard: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptText: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.medium,
    lineHeight: 20,
    textAlign: 'center',
    // No marginBottom. cardContent centres its children, so a bottom
    // margin got centred WITH the text and pushed the visible line up
    // by half of it - the card read as very slightly high. Nothing sits
    // under the text any more for the margin to hold off.
  },
  lockoutBadge: {
    color: theme.colors.vibeRed,
    fontSize: 10,
    fontWeight: theme.fontWeights.bold,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
    textAlign: 'center',
  },
});