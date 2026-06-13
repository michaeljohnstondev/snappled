// useAppUpdate.js
// Checks for an EAS over-the-air update on app launch (and again any
// time the app returns to the foreground). When an update is available
// it's silently downloaded; the hook then exposes `isUpdateReady` so
// the UI can prompt the user to restart. The actual restart is done
// via `applyUpdate()`, which calls `Updates.reloadAsync()` — this
// guarantees new users land on the latest JS bundle rather than
// silently running stale code shipped before the OTA.

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Returns { isUpdateReady, applyUpdate }. isUpdateReady flips to true
// once a new bundle has been fetched and is ready to run. applyUpdate
// reloads the app into the new bundle.
export function useAppUpdate() {
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const checkingRef = useRef(false);

  // Runs one full check → fetch cycle. Guarded so concurrent triggers
  // (mount + foreground in the same instant) collapse into a single
  // network call.
  const checkAndFetch = useCallback(async () => {
    if (checkingRef.current) return;
    // In dev (Expo Go / local server) Updates is disabled and would
    // throw on every call. Skip cleanly so dev sessions aren't noisy.
    if (!Updates.isEnabled || __DEV__) return;
    checkingRef.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result?.isAvailable) {
        await Updates.fetchUpdateAsync();
        setIsUpdateReady(true);
      }
    } catch (err) {
      // Network blip / no update / disabled — non-fatal. The next
      // foreground transition will retry.
      console.log('[useAppUpdate] check skipped:', err?.message || err);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkAndFetch();

    // Re-check whenever the user returns to the app from background —
    // catches updates that shipped while they were away without
    // forcing a full quit/relaunch.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndFetch();
    });
    return () => sub.remove();
  }, [checkAndFetch]);

  // Reload into the newly-downloaded bundle. Called from the
  // UpdateBanner's Restart button.
  const applyUpdate = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (err) {
      console.error('[useAppUpdate] reload failed:', err);
    }
  }, []);

  return { isUpdateReady, applyUpdate };
}

export default useAppUpdate;
