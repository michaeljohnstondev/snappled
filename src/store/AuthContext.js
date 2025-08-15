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
          // Load user data from our service
          const userData = await userService.getUserData(firebaseUser.uid);
          if (userData) {
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              ...userData,
            });
            setUserCurrency({
              userId: firebaseUser.uid,
              coins: userData.coins || 0,
              trophies: userData.tickets || 0, // Convert tickets to trophies
              topicTokens: userData.topicTokens || 0,
              ownedSnapples: userData.ownedSnapples || [],
              wishlistedSnapples: userData.wishlistedSnapples || [],
              ownedCards: userData.ownedCards || [],
            });
            setIsAuthenticated(true);
          } else {
            // User exists in Firebase Auth but not in our database
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
          coins: userData.coins || 0,
          trophies: userData.tickets || 0, // Convert tickets to trophies
          topicTokens: userData.topicTokens || 0,
          ownedSnapples: userData.ownedSnapples || [],
          wishlistedSnapples: userData.wishlistedSnapples || [],
          ownedCards: userData.ownedCards || [],
        });
      }
    } catch (error) {
      console.error("Error refreshing user currency:", error);
    }
  };

  // Function to update user currency locally (for immediate UI updates)
  const updateUserCurrency = (updates) => {
    setUserCurrency((prev) => ({ ...prev, ...updates }));
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
