let VideoThumbnails = null;
try {
  VideoThumbnails = require('expo-video-thumbnails');
} catch (e) {
  // Native module not available (Expo Go or old dev build)
}

const cache = new Map();

export const thumbnailService = {
  async getThumbnail(videoUrl) {
    if (!videoUrl || !VideoThumbnails) return null;

    if (cache.has(videoUrl)) {
      return cache.get(videoUrl);
    }

    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, {
        time: 500,
        quality: 0.5,
      });
      cache.set(videoUrl, uri);
      return uri;
    } catch (error) {
      return null;
    }
  },

  isAvailable() {
    return VideoThumbnails !== null;
  },

  clearCache() {
    cache.clear();
  },
};

export default thumbnailService;
