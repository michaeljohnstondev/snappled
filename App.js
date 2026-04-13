import React, { useEffect } from "react";
import { View, StatusBar, Platform, LogBox } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider } from "./src/store/ModalContext";

LogBox.ignoreLogs([
  "SafeAreaView has been deprecated",
]);

export default function App() {
  useEffect(() => {
    if (Platform.OS === "android") {
      setTimeout(() => {
        try {
          const NavigationBar = require("expo-navigation-bar");
          NavigationBar.setVisibilityAsync("hidden").catch(() => {});
        } catch (e) {}
      }, 1000);
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#001020" }}>
      <StatusBar hidden translucent backgroundColor="transparent" />
      <AuthProvider>
        <ModalProvider>
          <NavigationContainer>
            <Navigation />
          </NavigationContainer>
        </ModalProvider>
      </AuthProvider>
    </View>
  );
}
