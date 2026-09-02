// UpdateRequiredScreen — full-bleed gate rendered when the installed
// native build is below the min supported version. Blocks all app
// interaction and offers one action: open the Play Store / App Store.
//
// Punk-theme styling matches the rest of the app (spray-paint gradient
// backdrop, thick neon UPDATE bar). No dismiss / skip — this gate is
// only shown when it's genuinely time to force an update. If you need
// to unblock users temporarily, lower minRuntimeVersion in the
// system/appConfig Firestore doc.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// Fire the OS store deep link. Falls back to the web store URL if the
// native store app can't handle the market:// scheme (rare — happens
// on emulators or if the Play Store app is disabled).
async function openStore(androidStoreUrl, iosStoreUrl) {
  const primary = Platform.OS === 'ios' ? iosStoreUrl : androidStoreUrl;
  if (!primary) return;
  try {
    const supported = await Linking.canOpenURL(primary);
    if (supported) {
      await Linking.openURL(primary);
      return;
    }
  } catch (e) {}
  // Fallback: strip the market:// / itms-apps:// prefix and try https.
  const webFallback = primary
    .replace('market://details', 'https://play.google.com/store/apps/details')
    .replace('itms-apps://', 'https://');
  try { await Linking.openURL(webFallback); } catch (e) {}
}

export default function UpdateRequiredScreen({
  currentVersion,
  minVersion,
  message,
  androidStoreUrl,
  iosStoreUrl,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <LinearGradient colors={t.colors.backgroundGradient} style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download" size={56} color={theme.colors.vibeBlue} />
        </View>

        <Text style={styles.title}>UPDATE REQUIRED</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.versionRow}>
          <View style={styles.versionChip}>
            <Text style={styles.versionChipLabel}>You have</Text>
            <Text style={styles.versionChipValue}>v{currentVersion}</Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={t.colors.textSecondary} />
          <View style={[styles.versionChip, styles.versionChipTarget]}>
            <Text style={styles.versionChipLabel}>Need</Text>
            <Text style={[styles.versionChipValue, { color: theme.colors.vibeGreen }]}>
              v{minVersion}+
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.updateBtn}
          onPress={() => openStore(androidStoreUrl, iosStoreUrl)}
        >
          <LinearGradient
            colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.updateBtnInner}
          >
            <Ionicons name="cloud-download" size={20} color="#fff" />
            <Text style={styles.updateBtnText}>UPDATE NOW</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0, 198, 255, 0.12)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    color: t.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 12,
  },
  message: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 26,
  },
  versionChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: t.colors.inputBackground,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
  },
  versionChipTarget: {
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0, 255, 65, 0.08)',
  },
  versionChipLabel: {
    color: t.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  versionChipValue: {
    color: t.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  updateBtn: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
  },
  updateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  updateBtnText: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
  },
});
