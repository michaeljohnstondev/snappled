import "./src/lib/polyfills";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider } from "./src/store/ModalContext";
import { useEffect } from "react";
import { setStatusBarHidden } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";

export default function App() {
  useEffect(() => {
    // Hide status bar completely
    setStatusBarHidden(true, "none");
    
    // Hide Android navigation bar
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBackgroundColorAsync("#080B1E");
  }, []);

  return (
    <View style={{ flex: 1 }}>
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
