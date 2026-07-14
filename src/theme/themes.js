import { Platform } from 'react-native';

const theme = {
  colors: {
    background: '#001020',
    backgroundGradient: ['#001020', '#001840', '#002060'],
    // Flatter, darker gradient used inside a round (picking / voting /
    // scoring / round results / warmup) so the card surface #141A33
    // reads as a lift off the background instead of blending into
    // the bluer default gradient.
    gameBackgroundGradient: ['#05080F', '#0A0E1F', '#0F1229'],
    buttonGradient: ['#00c6ff', '#0072ff'],
    royalPurpleGradient: ['#4B0082', '#0066FF', '#4B0082', '#0066FF', '#4B0082'],
    // Modal background — deeper than backgroundGradient, with a vibeBlue
    // glow corner so overlay modals don't read as plain dark slabs.
    modalGradient: ['#0A0420', '#1A0840', '#06182E', '#001020'],

    textPrimary: '#FFFFFF',
    textSecondary: '#778DA9',
    inputBorder: '#555',
    inputBackground: 'rgba(255,255,255,0.05)',
    alertButton: '#00c6ff',

    //vibeColors
    vibeBlue: '#00C6FF',
    vibeGreen: '#00FF41',
    vibeForest: '#228B22',
    vibeOrange: '#FFCC66',
    vibePurple: '#6B00CC',
    // Deep neon purple used for card accent borders on the game
    // screens — saturated enough to feel like a real neon line
    // against the #141A33 card surface without going lavender.
    vibeNeonPurple: '#7B2CBF',
    vibeYellow: '#FFD700',
    vibePink: '#FF10F0',
    vibeRed: '#FF4444',
    vibeCyan: '#00FFFF',
    vibeTurquoise: '#40E0D0',
    vibeAqua: '#00FFF7',
    vibeTeal: '#00FFD4',
    vibeElectricBlue: '#007FFF',
    vibeRoyalBlue: '#4169E1',

    // Basic colors
    white: '#FFFFFF',
    black: '#000000',
    gray: '#778DA9',
    darkGray: '#2d2d2d',

    // UI accent colors
    headerBackground: '#001020',
    statusBarBackground: '#001020',

    // VibeBackgroundColors
    vibeBackgroundBlue: 'rgba(0, 198, 255, 0.1)',
    vibeBackgroundGreen: 'rgba(0, 255, 65, 0.1)',
    vibeBackgroundOrange: 'rgba(253, 126, 20, 0.1)',
    vibeBackgroundPurple: 'rgba(139, 0, 255, 0.1)',
    vibeBackgroundYellow: 'rgba(255, 255, 0, 0.1)',
    vibeBackgroundPink: 'rgba(255, 16, 240, 0.1)',
    vibeBackgroundCyan: 'rgba(0, 255, 255, 0.1)',
    vibeBackgroundTurquoise: 'rgba(64, 224, 208, 0.2)',
    vibeBackgroundAqua: 'rgba(0, 255, 247, 0.1)',
    vibeBackgroundTeal: 'rgba(0, 255, 212, 0.1)',
    vibeBackgroundElectricBlue: 'rgba(0, 127, 255, 0.1)',
    vibeBackgroundRoyalBlue: 'rgba(65, 105, 225, 0.1)',

    // Comment role colors
    commentUser: '#28a745',
    commentAdmin: '#6f42c1',
    commentHost: '#fd7e14',
    commentOther: '#007bff',

    // Comment background colors (with transparency)
    commentUserBg: 'rgba(40, 167, 69, 0.1)',
    commentAdminBg: 'rgba(111, 66, 193, 0.1)',
    commentHostBg: 'rgba(253, 126, 20, 0.1)',
    commentOtherBg: 'rgba(0, 123, 255, 0.1)',
  },
  fonts: {
    main: Platform.select({
      ios: 'System',
      android: 'Roboto',
      web: 'system-ui, -apple-system, sans-serif',
      default: 'sans-serif',
    }),
    bold: Platform.select({
      ios: 'System',
      android: 'Roboto',
      web: 'system-ui, -apple-system, sans-serif',
      default: 'sans-serif',
    }),
  },
  fontWeights: {
    light: '300',
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
    extraBold: '800',
  },
  sizes: {
    borderRadius: 12,
    buttonRadius: 12,
    inputPadding: 12,
  },
  // UI Restrictions: NO glow effects - Use sharp neon borders instead
};

export default theme;
