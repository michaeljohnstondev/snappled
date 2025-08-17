import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../services/firebase";
import { userService } from "../services/userService";

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);

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
              ownedSnapples: userData.ownedSnapples || [],
              wishlistedSnapples: userData.wishlistedSnapples || [],
              ownedCards: userData.ownedCards || [],
            });
            setIsAuthenticated(true);
          } else {
            // User exists in Firebase Auth but not in our database
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

  const value = {
    user,
    userCurrency,
    isLoading,
    isAuthenticated,
    refreshUserCurrency,
    updateUserCurrency,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
