import { Platform } from 'react-native';

const theme = {
  colors: {
    background: "#080B1E",
    backgroundGradient: ["#080B1E", "#0B1125", "#1A053E"],
    buttonGradient: ["#8B00FF", "#00C6FF"],
    buttonGradientAlt: ["#00FF41", "#00C6FF"],
    buttonGradientCyan: ["#00FFFF", "#8B00FF"],
    buttonGradientMatrix: ["#00FF41", "#008000"],
    
    baseColors: ["#8B00FF", "#00C6FF", "#00FFFF"],
    textPrimary: "#FFFFFF",
    textSecondary: "#778DA9",
    inputBorder: "#555",
    inputBackground: "rgba(255,255,255,0.05)",
    shadowGlow: "#00FFFF",
    accentBorder: "rgba(255, 16, 240, 0.3)",
    pinkGlow: "rgba(255, 16, 240, 0.4)",
    alertButton: "#00c6ff",

    //vibeColors
    vibeBlue: "#00C6FF",
    vibeGreen: "#00FF41",
    vibeOrange: "#fd7e14",
    vibePurple: "#8B00FF",
    vibeYellow: "#FFFF00",
    vibePink: "#FF10F0",

    // VibeBackgroundColors
    vibeBackgroundBlue: "rgba(0, 198, 255, 0.1)",
    vibeBackgroundGreen: "rgba(0, 255, 65, 0.1)",
    vibeBackgroundOrange: "rgba(253, 126, 20, 0.1)",
    vibeBackgroundPurple: "rgba(139, 0, 255, 0.1)",
    vibeBackgroundYellow: "rgba(255, 255, 0, 0.1)",
    vibeBackgroundPink: "rgba(255, 16, 240, 0.1)",
    
    // Button gradient
    buttonGradientCyan: ["rgba(0, 255, 255, 0.1)", "rgba(0, 255, 255, 0.05)", "rgba(255, 255, 255, 0.05)"],
  },
  fonts: {
    main: Platform.select({
      ios: "System",
      android: "Roboto",
      web: "system-ui, -apple-system, sans-serif",
      default: "sans-serif"
    }),
    bold: Platform.select({
      ios: "System",
      android: "Roboto",
      web: "system-ui, -apple-system, sans-serif",
      default: "sans-serif"
    }),
    light: Platform.select({
      ios: "System",
      android: "Roboto",
      web: "system-ui, -apple-system, sans-serif",
      default: "sans-serif"
    }),
  },
  fontWeights: {
    light: "300",
    regular: "400",
    medium: "500",
    semiBold: "600",
    bold: "700",
    extraBold: "800"
  },
  sizes: {
    borderRadius: 12,
    buttonRadius: 12,
    inputPadding: 16,
  },
  shadows: {
    textGlow: {
      textShadowColor: "#00FFFF",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 30,
    },
  },
};

export default theme;
