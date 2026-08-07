import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { userService } from "../services/userService";
import { achievementService } from "../services/achievementService";
import { levelService } from "../services/levelService";
import { fcmService } from "../services/fcmServiceWrapper";

const AuthContext = createContext({});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userCurrency, setUserCurrency] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pendingAchievements, setPendingAchievements] = useState([]);

  const unsubUserDoc = useRef(null);
  // Track the last-authenticated uid so logout can clear the FCM
  // token off the correct user doc even after Firebase Auth has
  // already dropped the credential.
  const lastAuthedUidRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);

      // Clean up previous user doc listener
      if (unsubUserDoc.current) {
        unsubUserDoc.current();
        unsubUserDoc.current = null;
      }

      // If we're transitioning from an authed user → logged out (or
      // switching accounts), clear the FCM token off the OLD user doc
      // so their device doesn't keep receiving pushes for the previous
      // account. Fire-and-forget — non-fatal if it fails.
      if (lastAuthedUidRef.current && lastAuthedUidRef.current !== firebaseUser?.uid) {
        const previousUid = lastAuthedUidRef.current;
        fcmService.removeTokenForUser(previousUid).catch((e) => {
          console.warn('[AuthContext] FCM token cleanup failed:', e);
        });
      }
      lastAuthedUidRef.current = firebaseUser?.uid || null;

      if (firebaseUser) {
        try {
          // Load user data from our service with retry for new users
          console.log('[AuthContext] Loading user data for:', firebaseUser.uid);
          let userData = await userService.getUserData(firebaseUser.uid);

          // If user data not found, retry once after a short delay (for new users)
          if (!userData) {
            console.log('[AuthContext] User data not found, retrying in 1 second...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            userData = await userService.getUserData(firebaseUser.uid);
          }

          console.log('[AuthContext] User data loaded:', !!userData);
          if (userData) {
            // Spread userData FIRST so authoritative Firebase Auth
            // fields (uid, email, displayName) always win — a stale
            // or empty-string field on the Firestore doc used to
            // clobber them and break every downstream username /
            // email lookup (including snapple.creatorUsername).
            setUser({
              ...userData,
              uid: firebaseUser.uid,
              email: firebaseUser.email || userData.email,
              displayName: firebaseUser.displayName || userData.displayName,
            });
            setUserCurrency({
              userId: firebaseUser.uid,
              coins: userData.resources?.coins || userData.coins || 0,
              tokens: userData.resources?.tokens || userData.topicTokens || 0,
              trophies: userData.resources?.trophies || userData.tickets || 0,
              level: userData.profile?.level || 1,
              xp: userData.profile?.xp || 0,
              ownedSnapples: userData.ownedSnapples || [],
              wishlistedSnapples: userData.wishlistedSnapples || [],
              likedSnapples: userData.likedSnapples || [],
              dislikedSnapples: userData.dislikedSnapples || [],
              ownedCards: userData.ownedCards || [],
            });
            setIsAuthenticated(true);

            // Register FCM token for push notifications. Contextual —
            // requestPermission() prompts the OS dialog the first time,
            // then the token gets written to deviceInfo.fcmToken so
            // Cloud Functions can push to this device. Silent no-op
            // in Expo Go (fcmServiceWrapper picks the fallback there).
            fcmService.registerTokenForUser(firebaseUser.uid).catch((e) => {
              console.warn('[AuthContext] FCM token registration failed:', e);
            });

            // Real-time listener for resource bar updates
            unsubUserDoc.current = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
              if (!snap.exists()) return;
              const d = snap.data();
              setUserCurrency(prev => ({
                ...prev,
                coins: d.resources?.coins || d.coins || 0,
                tokens: d.resources?.tokens || d.topicTokens || 0,
                trophies: d.resources?.trophies || d.tickets || 0,
                level: d.profile?.level || 1,
                xp: d.profile?.xp || 0,
                ownedSnapples: d.ownedSnapples || [],
                wishlistedSnapples: d.wishlistedSnapples || [],
                likedSnapples: d.likedSnapples || [],
                dislikedSnapples: d.dislikedSnapples || [],
                ownedCards: d.ownedCards || [],
              }));
              setUser(prev => prev ? ({
                ...prev,
                inventory: d.inventory || {},
                boosts: d.boosts || {},
                upgrades: d.upgrades || {},
              }) : prev);
            });

            // Check achievements on login (delayed so it doesn't block render)
            setTimeout(async () => {
              try {
                const savedStats = userData.stats || {};
                let totalLikes = 0, maxLikesOnOne = 0, uniquePrompts = new Set();
                try {
                  const snapQ = query(collection(db, 'snapples'), where('creatorId', '==', firebaseUser.uid));
                  const snapSnap = await getDocs(snapQ);
                  snapSnap.forEach(d => {
                    const s = d.data();
                    const likes = s.likes || s.likeCount || 0;
                    totalLikes += likes;
                    if (likes > maxLikesOnOne) maxLikesOnOne = likes;
                    if (s.promptId) uniquePrompts.add(s.promptId);
                  });
                } catch (e) {}
                const stats = {
                  ...savedStats,
                  totalLikesReceived: totalLikes,
                  maxLikesOnOne,
                  uniquePromptsUsed: uniquePrompts.size,
                  level: levelService.getLevelFromXP(userData.profile?.xp || userData.profile?.experience || 0),
                  trophies: userData.resources?.trophies || 0,
                };
                const newAchievements = await achievementService.checkAndAward(firebaseUser.uid, stats);
                if (newAchievements.length > 0) {
                  setPendingAchievements(newAchievements);
                }
              } catch (e) {
                console.error('[AuthContext] Achievement check error:', e);
              }
            }, 3000);
          } else {
            console.log('[AuthContext] User data not found in database for:', firebaseUser.uid);
            setUser(null);
            setUserCurrency({});
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error("Error loading user data:", error);
          setUser(null);
          setUserCurrency({});
          setIsAuthenticated(false);
        }
      } else {
        setUser(null);
        setUserCurrency({});
        setIsAuthenticated(false);
      }

      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubUserDoc.current) unsubUserDoc.current();
    };
  }, []);

  // Function to refresh user currency
  const refreshUserCurrency = async () => {
    if (!user?.uid) return;

    try {
      const userData = await userService.getUserData(user.uid);
      if (userData) {
        setUserCurrency({
          userId: user.uid,
          coins: userData.resources?.coins || userData.coins || 0,
          tokens: userData.resources?.tokens || userData.topicTokens || 0,
          trophies: userData.resources?.trophies || userData.tickets || 0,
          level: userData.profile?.level || 1,
          ownedSnapples: userData.ownedSnapples || [],
          wishlistedSnapples: userData.wishlistedSnapples || [],
          likedSnapples: userData.likedSnapples || [],
          dislikedSnapples: userData.dislikedSnapples || [],
          ownedCards: userData.ownedCards || [],
        });
      }
    } catch (error) {
      console.error("Error refreshing user currency:", error);
    }
  };

  // Function to update user currency locally and persist to database
  const updateUserCurrency = async (updates) => {
    if (!user?.uid) return;

    // Update local state immediately for responsive UI
    setUserCurrency((prev) => ({ ...prev, ...updates }));

    try {
      // Persist changes to database
      await userService.updateUserResources(user.uid, updates);
    } catch (error) {
      console.error("Error updating user currency in database:", error);
      // Optionally refresh from database to ensure consistency
      await refreshUserCurrency();
    }
  };

  // Local-only variant — updates state without touching Firestore.
  // Use this for OPTIMISTIC updates when a Cloud Function (or
  // batched arrayUnion write) is the authoritative persistence
  // path. If we ALSO called updateUserResources here, its whole-
  // array SET semantics would race the CF's arrayUnion writes and
  // clobber concurrent state (this is what broke the buy flow —
  // the rollback SET-wrote a stale ownedSnapples array back to
  // the server and wiped legitimate ownership).
  const updateUserCurrencyLocal = (updates) => {
    setUserCurrency((prev) => ({ ...prev, ...updates }));
  };

  const clearPendingAchievements = () => setPendingAchievements([]);

  const value = {
    user,
    userCurrency,
    updateUserCurrencyLocal,
    isLoading,
    isAuthenticated,
    refreshUserCurrency,
    updateUserCurrency,
    pendingAchievements,
    clearPendingAchievements,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
