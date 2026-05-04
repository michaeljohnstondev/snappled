import React, { useEffect, useRef } from "react";
import { View, StatusBar, Platform, LogBox, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider } from "./src/store/ModalContext";

LogBox.ignoreLogs([
  "SafeAreaView has been deprecated",
]);

const hideNavBar = () => {
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
    if (Platform.OS === "android") {
      setTimeout(hideNavBar, 1000);

      // Re-hide whenever app returns to foreground
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") setTimeout(hideNavBar, 100);
      });
      return () => sub.remove();
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#001020" }}>
      <StatusBar hidden translucent backgroundColor="transparent" />
      <AuthProvider>
        <ModalProvider>
          <NavigationContainer
            ref={navRef}
            onStateChange={() => setTimeout(hideNavBar, 50)}
          >
            <Navigation />
          </NavigationContainer>
        </ModalProvider>
      </AuthProvider>
    </View>
  );
}
