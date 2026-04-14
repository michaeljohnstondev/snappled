import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { userService } from "../services/userService";
import { achievementService } from "../services/achievementService";
import { levelService } from "../services/levelService";

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);

      // Clean up previous user doc listener
      if (unsubUserDoc.current) {
        unsubUserDoc.current();
        unsubUserDoc.current = null;
      }

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
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              ...userData,
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
              ownedCards: userData.ownedCards || [],
            });
            setIsAuthenticated(true);

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

  const clearPendingAchievements = () => setPendingAchievements([]);

  const value = {
    user,
    userCurrency,
    isLoading,
    isAuthenticated,
    refreshUserCurrency,
    updateUserCurrency,
    pendingAchievements,
    clearPendingAchievements,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
