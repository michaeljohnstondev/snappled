import React, { useEffect, useRef } from "react";
import { View, StatusBar, Platform, LogBox, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider } from "./src/store/ModalContext";
import { RewardClaimProvider } from "./src/store/RewardClaimContext";
import { UploadQueueProvider } from "./src/store/UploadQueueContext";

LogBox.ignoreLogs([
  "SafeAreaView has been deprecated",
]);

const hideAndroidNavBar = () => {
  if (Platform.OS !== "android") return;
  try {
    const NavigationBar = require("expo-navigation-bar");
    NavigationBar.setVisibilityAsync("hidden").catch(() => {});
    NavigationBar.setBehaviorAsync("overlay-swipe").catch(() => {});
  } catch (e) {}
};

export default function App() {
  const navRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const t = setTimeout(hideAndroidNavBar, 500);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setTimeout(hideAndroidNavBar, 100);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: "#001020" }}>
          <StatusBar hidden translucent backgroundColor="transparent" />
          <AuthProvider>
            <ModalProvider>
              <RewardClaimProvider>
                <UploadQueueProvider>
                  <NavigationContainer ref={navRef}>
                    <Navigation />
                  </NavigationContainer>
                </UploadQueueProvider>
              </RewardClaimProvider>
            </ModalProvider>
          </AuthProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
