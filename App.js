import React, { useEffect, useRef } from "react";
import { View, StatusBar, Platform, LogBox, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Navigation from "./Navigation";
import { AuthProvider } from "./src/store/AuthContext";
import { ModalProvider, useModal } from "./src/store/ModalContext";
import { RewardClaimProvider } from "./src/store/RewardClaimContext";
import { UploadQueueProvider } from "./src/store/UploadQueueContext";
import { useVersionGate } from "./src/hooks/useVersionGate";
import UpdateRequiredScreen from "./src/components/ui/UpdateRequiredScreen";
import { fcmService } from "./src/services/fcmServiceWrapper";
import { notificationDisplayService } from "./src/services/notificationDisplayService";

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

// FcmDisplayBridge — wires notificationDisplayService.setToast to
// ModalContext's showToast so foreground FCM messages can render as
// in-app toasts. Lives inside ModalProvider (needs the context) but
// renders nothing.
function FcmDisplayBridge() {
  const { showToast } = useModal();
  useEffect(() => {
    notificationDisplayService.setToast(showToast);
    fcmService.initialize().catch((e) => console.warn("[App] fcmService init failed:", e));
    return () => {
      notificationDisplayService.setToast(null);
    };
  }, [showToast]);
  return null;
}

export default function App() {
  const navRef = useRef(null);
  // Version gate — checks Firestore for a min supported runtime version
  // and blocks the app if the installed native build is below it. Fails
  // open on error so a Firestore outage doesn't lock everyone out.
  const { loading: gateLoading, gateResult } = useVersionGate();

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
          {gateLoading ? (
            // Splash-quiet: no auth / navigation loaded yet. The gate
            // check is a single Firestore read — usually well under 1s.
            null
          ) : gateResult.blocked ? (
            <UpdateRequiredScreen
              currentVersion={gateResult.currentVersion}
              minVersion={gateResult.minVersion}
              message={gateResult.message}
              androidStoreUrl={gateResult.androidStoreUrl}
              iosStoreUrl={gateResult.iosStoreUrl}
            />
          ) : (
            <AuthProvider>
              <ModalProvider>
                <FcmDisplayBridge />
                <RewardClaimProvider>
                  <UploadQueueProvider>
                    <NavigationContainer
                      ref={navRef}
                      onReady={() => fcmService.setNavigationRef(navRef.current)}
                    >
                      <Navigation />
                    </NavigationContainer>
                  </UploadQueueProvider>
                </RewardClaimProvider>
              </ModalProvider>
            </AuthProvider>
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
