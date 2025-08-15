const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add polyfills for React Native compatibility
config.resolver.alias = {
  ...config.resolver.alias,
  'url': require.resolve('./src/lib/url-polyfill.js'),
};

// Add font file support
config.resolver.assetExts.push('ttf');

module.exports = config;