// versionGate.js
// Reads the min-supported-version config from Firestore
// (`system/appConfig`) and compares against the runtime version baked
// into the currently installed native binary. If installed < min, the
// caller renders a full-screen "Update Required" gate that deep-links
// to the Play Store / App Store.
//
// Fail-open: any error (offline, Firestore down, missing doc) resolves
// as "not blocked" so a backend hiccup can't lock every user out of
// the app. The gate is a safety net, not a source of downtime.
//
// Uses `expo-updates` (already installed) instead of `expo-application`
// so it works without a fresh native build — runtimeVersion is baked
// into the native binary at build time and never changes across OTAs.

import * as Updates from 'expo-updates';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const APP_CONFIG_COLLECTION = 'system';
const APP_CONFIG_DOC = 'appConfig';

// compareVersions — semver-lite comparator. Parses 'a.b.c' style
// strings into integer arrays and compares component-by-component.
// Returns <0 if a is older, 0 if equal, >0 if a is newer. Missing
// components default to 0 ("1.0" == "1.0.0"). Non-numeric chunks
// fall back to 0 so a garbled remote value can't block the user.
function compareVersions(a, b) {
  const parse = (v) => (v || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] || 0;
    const bv = pb[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// getCurrentRuntimeVersion — the runtime version baked into the
// currently installed native binary. Reliable across OTAs (an OTA
// bundle can never change this — it reflects what was compiled into
// the APK/IPA the user actually installed from the store).
export function getCurrentRuntimeVersion() {
  return Updates.runtimeVersion || '0.0.0';
}

// checkVersionGate — main entry point. Resolves with either
// { blocked: false } or { blocked: true, currentVersion, minVersion,
// message, androidStoreUrl, iosStoreUrl }. Never throws — errors
// resolve as not-blocked so an outage doesn't lock the app.
export async function checkVersionGate() {
  try {
    const configDoc = await getDoc(doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC));
    if (!configDoc.exists()) return { blocked: false };

    const config = configDoc.data() || {};
    const minVersion = config.minRuntimeVersion;
    if (!minVersion) return { blocked: false };

    const currentVersion = getCurrentRuntimeVersion();
    if (compareVersions(currentVersion, minVersion) >= 0) {
      return { blocked: false };
    }

    return {
      blocked: true,
      currentVersion,
      minVersion,
      message: config.updateMessage
        || 'A new version of Snappled is required. Please update from the store to keep playing.',
      androidStoreUrl: config.androidStoreUrl
        || 'market://details?id=com.bigvibestudios.snappled',
      iosStoreUrl: config.iosStoreUrl || null,
    };
  } catch (err) {
    console.warn('[versionGate] check failed, allowing through:', err?.message || err);
    return { blocked: false };
  }
}
