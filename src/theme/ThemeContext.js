import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, darkTheme } from './themes';

const KEY = '@snappled:theme.v1';

/**
 * Three selectable modes: 'dark', 'light', and 'system' (follow the OS).
 * Default is 'dark' — the app has always looked that way, so a user who never
 * touches the toggle should see no change at all.
 */
const MODES = ['dark', 'light', 'system'];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');
  const systemScheme = useColorScheme();

  // Restore the saved choice. Children render immediately against the dark
  // default rather than waiting — a blank frame is worse than a brief one in
  // the wrong theme, and the wrong theme only shows for a user who has
  // actually switched away from the default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (!cancelled && MODES.includes(saved)) setModeState(saved);
      } catch {
        // A missing or unreadable preference is not worth failing over —
        // the dark default is already correct.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next) => {
    if (!MODES.includes(next)) return;
    setModeState(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  // Resolve 'system' down to a concrete theme. useColorScheme re-renders on
  // its own when the OS setting flips, so this stays live without a listener.
  const resolved = mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
  const theme = themes[resolved] || darkTheme;

  // Cycles dark -> light -> dark. 'system' is reachable via setMode, but the
  // toggle itself stays a two-state thing so a demo tap is predictable.
  const toggleTheme = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const value = useMemo(
    () => ({ theme, mode, resolvedMode: resolved, isDark: theme.isDark, setMode, toggleTheme }),
    [theme, mode, resolved, setMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  // Falling back to the dark theme keeps any component usable outside a
  // provider — tests, storybook-style previews, the error boundary that has
  // to render when the tree above it has already failed.
  if (!ctx) {
    return {
      theme: darkTheme,
      mode: 'dark',
      resolvedMode: 'dark',
      isDark: true,
      setMode: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

/**
 * Style factories, cached per (factory, theme).
 *
 * The old pattern — `const styles = StyleSheet.create({...})` at module scope
 * — bakes the colours in at import time, which is exactly why a runtime switch
 * used to be impossible. Move the object into a factory and call it here:
 *
 *   const makeStyles = (t) => ({ card: { backgroundColor: t.semantic.surface } });
 *   ...
 *   const styles = useThemedStyles(makeStyles);
 *
 * The factory must be defined at module scope (a stable identity), not inline
 * in the component, or the cache misses on every render.
 */
const styleCache = new WeakMap();

export function useThemedStyles(factory) {
  const { theme } = useTheme();
  return useMemo(() => {
    let perTheme = styleCache.get(factory);
    if (!perTheme) {
      perTheme = new Map();
      styleCache.set(factory, perTheme);
    }
    let styles = perTheme.get(theme);
    if (!styles) {
      // There are only two theme objects and both are module constants, so
      // this Map holds at most two entries per factory.
      styles = StyleSheet.create(factory(theme));
      perTheme.set(theme, styles);
    }
    return styles;
  }, [factory, theme]);
}
