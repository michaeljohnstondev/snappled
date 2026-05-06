import React, { useEffect, useRef } from "react";
import { View, StatusBar, Platform, LogBox, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
enableScreens(false);
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider } from "./src/store/ModalContext";

LogBox.ignoreLogs([
  "SafeAreaView has been deprecated",
]);

export default function App() {
  const navRef = useRef(null);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: "#001020" }}>
        <StatusBar hidden translucent backgroundColor="transparent" />
        <AuthProvider>
          <ModalProvider>
            <NavigationContainer ref={navRef}>
              <Navigation />
            </NavigationContainer>
          </ModalProvider>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}
