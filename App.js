import "./src/lib/polyfills";
import { View, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider } from "./src/store/ModalContext";
import { useEffect, useState } from "react";

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <NavigationContainer>
          <Navigation />
        </NavigationContainer>
      </ModalProvider>
    </AuthProvider>
  );
}
