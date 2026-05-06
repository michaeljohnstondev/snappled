# Task List - Snapple Park

## Completed - 2025-08-14

### ✅ Video Recording Implementation - WORKING!
- **Date**: August 14, 2025
- **Status**: COMPLETED ✅
- **Description**: Fixed video recording functionality that was not working
- **Root Cause**: Missing `mode="video"` prop on CameraView component
- **Solution**: Added `mode="video"` to CameraView for proper recording mode
- **Changes Made**:
  - **CRITICAL FIX**: Added `mode="video"` to CameraView component  
  - Implemented proper recordAsync/stopRecording flow with race condition guards
  - Added camera and microphone permissions to `app.json` and expo-camera plugin
  - Added comprehensive error handling (onMountError, onError callbacks)
  - Implemented proper state management with hasStoppedRef guard
  - Added 10-second auto-stop with manual stop option after 1 second
  - Updated to use expo-video instead of deprecated expo-av
- **Files Modified**:
  - `app/video/record.js` - Complete recording implementation with hardening
  - `app/video/preview.js` - Video preview screen with expo-video
  - `app.json` - Added iOS/Android permissions and expo-camera plugin
  - `package.json` - Added expo-video dependency  
- **Testing Results**: 
  - ✅ Successfully records video with audio to device storage
  - ✅ Generates valid video URI: `file:///.../*.mp4`
  - ✅ Both manual stop (after 1s) and auto-stop (at 10s) work correctly
  - ✅ Proper permission handling for camera and microphone
  - ✅ Error handling for camera mount failures

### ✅ Project Setup and Configuration
- **Date**: August 14, 2025  
- **Status**: COMPLETED
- **Description**: Set up development environment and Firebase configuration
- **Changes Made**:
  - Started Expo development server successfully
  - Configured Firebase with web support (including measurementId)
  - Verified app loads without Firebase errors
  - Updated README.md with comprehensive project documentation
- **Files Modified**:
  - `README.md` - Complete project documentation
  - `src/services/firebase.js` - Firebase configuration updated
- **Testing Notes**:
  - Server running on http://localhost:8087
  - Firebase services initialized correctly
  - App ready for authentication and database features

### ✅ Firebase Storage Integration - WORKING!
- **Date**: August 14, 2025
- **Status**: COMPLETED ✅
- **Description**: Implemented complete video upload system to Firebase Storage
- **Features Added**:
  - **Video Upload Service**: Complete Firebase Storage integration with progress tracking
  - **Firestore Metadata**: Video information stored in database with timestamps
  - **Progress Indicators**: Real-time upload progress bar and percentage
  - **Error Handling**: Comprehensive error handling with user-friendly messages
  - **Preview Integration**: Seamless flow from recording → preview → upload
- **Files Created/Modified**:
  - `src/services/videoStorage.js` - New service for Firebase Storage operations
  - `app/video/preview.js` - Added upload functionality with progress tracking
  - `app/video/record.js` - Pass prompt text to preview screen
- **Technical Details**:
  - Videos uploaded as MP4 with unique timestamps
  - Metadata includes prompt, user ID, file size, creation time
  - Upload progress tracked with `uploadBytesResumable`
  - Videos organized by user: `videos/{userId}/{timestamp}.mp4`
- **Testing Results**:
  - ✅ Successfully uploads videos to Firebase Storage
  - ✅ Generates permanent download URLs
  - ✅ Stores complete metadata in Firestore
  - ✅ Shows real-time upload progress
  - ✅ Handles errors gracefully with retry options

## Active Tasks

### 🐛 Snapple Display Bug — Per-Prompt Fetch
- **Date**: 2026-05-06
- **Status**: IN PROGRESS
- **Description**: Snapples don't appear on a prompt's detail page once total system snapples > ~100
- **Root Cause**: `snappleService.getActiveSnapples(100)` fetches the newest 100 globally; HomeScreen filters client-side. Snapples on less-recent prompts get evicted.
- **Fix Plan**:
  - Add `snappleService.getSnapplesByPrompt(promptId, limitCount)` — `where('promptId', '==', id)`, no orderBy (avoids composite index), client-side sort
  - Replace HomeScreen's `allSnapples + filter` with on-demand per-prompt fetch (refetch on prompt change + on focus)
- **Files Touched**:
  - `src/services/snappleService.js`
  - `src/screens/HomeScreen.jsx`

### 🐛 Resource Bar Disappears After Camera
- **Date**: 2026-05-06
- **Status**: FIX COMMITTED, NEEDS REBUILD/RELOAD
- **Description**: Top resource bar (tokens/coins/trophies/level) disappeared after navigating to camera and back
- **Root Cause**: `SafeAreaProvider` was removed from `App.js` in commit `ff5e724` while debugging the old nav-bar issue and never re-added. Consumers (`SafeAreaView` in `AppLayout`, `useSafeAreaInsets` in `RecordScreen`) had no provider, so insets went stale after the camera modal popped.
- **Fix**: Re-added `<SafeAreaProvider>` at the root of `App.js`

### ✅ User Data Creation and Storage - COMPLETED!
- **Date**: August 14, 2025
- **Status**: COMPLETED ✅
- **Description**: Create user data structure and store in database when users sign up
- **Features Implemented**:
  - **Complete User Schema**: Comprehensive Firestore schema with currency system
  - **User Service**: Full CRUD operations for user management
  - **Signup Integration**: Firebase Auth + user data creation in single flow
  - **Starting Resources**: Users get 100 coins and 3 topic tokens on signup
  - **Validation**: Username uniqueness, email validation, and data integrity
  - **Security Rules**: Firestore rules for secure user data access
- **Files Created/Modified**:
  - `src/services/userService.js` - Complete user data management service
  - `app/auth/signup.js` - Integrated Firebase Auth with user data creation
  - `firestore.rules` - Security rules for all collections
- **User Schema Includes**:
  - Basic info: uid, username, email, createdAt
  - Currency: coins (100 starting), topicTokens (3 starting)
  - Collections: ownedSnapples, activeDeck
  - Profile: avatarUrl, bio, level, experience, achievements
  - Stats: videosCreated, snapplesPurchased, coinsSpent, etc.
  - Preferences: notifications, emailUpdates, publicProfile
- **Testing Results**:
  - ✅ User creation flow works end-to-end
  - ✅ Firebase Auth and Firestore integration successful
  - ✅ Username validation and uniqueness checking
  - ✅ Starting currency properly initialized
  - ✅ Security rules protect user data appropriately

### ✅ Enhanced User System with Legacy Features - COMPLETED!
- **Date**: August 14, 2025
- **Status**: COMPLETED ✅
- **Description**: Enhanced user system to include all legacy features from 8-year-old project
- **Legacy Features Added**:
  - **Dual Currency System**: coins (100) + tickets (50) + topicTokens (3)
  - **receivedCoins**: Separate tracking for gifted/earned coins
  - **Moderation System**: strikes, auto-ban after 3 strikes, banRelease timestamps
  - **Social Features**: snappleOpinion (ratings/reviews), following/followers
  - **Progression**: XP system, trophies, achievements, level tracking
  - **Enhanced Stats**: topicsSubmitted, totalTicketsSpent, engagement metrics
- **Modern Enhancements**:
  - **Security**: Comprehensive moderation with detailed strike tracking
  - **Social**: Following, blocking, detailed opinion system
  - **Analytics**: Enhanced user engagement and activity tracking
- **Files Enhanced**:
  - `src/services/userService.js` - Added 6 new methods for legacy features
  - `app/auth/signup.js` - Updated welcome message with all starting resources
- **New Functions**:
  - `updateTickets()` - Legacy ticket management
  - `updateReceivedCoins()` - Gift/earnings tracking
  - `updateXP()` - Experience progression
  - `addStrike()` - Moderation with auto-ban
  - `setSnappleOpinion()` - Rating/review system
  - Enhanced wishlist and engagement tracking

### 🪙 In-Game Currency & Token System
- **Date**: August 14, 2025
- **Status**: PENDING
- **Description**: Implement coin and topic token system for Snapple purchases and prompt creation
- **Requirements**:
  - **Coins System**: Currency to buy Snapples (videos)
    - Set starting coin amount for new users
    - Implement coin spending for Snapple purchases
    - Track coin transactions and balance
    - Support real money purchases for more coins (IAP integration)
  - **Topic Tokens System**: Allow users to create custom prompts
    - Users can spend topic tokens to inject custom prompts
    - Custom prompts get added to hourly rotation for 24 hours
    - Token spending validation and balance management
  - **Prompt Management System**:
    - Hourly prompt rotation (1 new prompt every hour)
    - Standard prompts last 24 hours
    - Injected custom prompts also last 24 hours
    - Queue management for prompt scheduling
- **Database Schema Updates**:
  - User document: `coins`, `topicTokens` fields
  - New collection: `prompts` with expiration timestamps
  - New collection: `transactions` for coin/token spending
  - New collection: `customPrompts` for user-submitted prompts
- **Files to Create/Modify**:
  - `src/services/currencyService.js` - Coin and token management
  - `src/services/promptService.js` - Prompt rotation and custom injection
  - `src/services/purchaseService.js` - Snapple purchasing system
  - `app/game/purchase.js` - Snapple purchase UI
  - `app/game/createPrompt.js` - Custom prompt creation UI
  - Update user schema in `src/services/userService.js`
- **Priority**: High (core monetization feature)

### 💰 Dynamic Snapple Pricing & Lifecycle System
- **Date**: August 14, 2025
- **Status**: PENDING
- **Description**: Implement exponential pricing system and automatic cleanup for Snapples
- **Requirements**:
  - **Dynamic Pricing Algorithm**:
    - Base price for new Snapples (e.g., 10 coins)
    - Exponential price increase with each purchase: `price = basePrice * (multiplier ^ purchaseCount)`
    - Calibrated multiplier (e.g., 1.15-1.25) to keep growth manageable but significant
    - Popular Snapples should approach real money value for premium users
    - Price updates in real-time across all users
  - **Purchase Tracking**:
    - Track total purchase count per Snapple
    - Update price immediately after each purchase
    - Show price history and trends to users
    - Display "popularity score" based on purchase count
  - **Snapple Lifecycle Management**:
    - Snapples available for purchase during their prompt's 24-hour window
    - Automatic deletion of unbought Snapples when prompt expires
    - Purchased Snapples remain in user collections permanently
    - Warning system before Snapples become unavailable
  - **Monetization Features**:
    - Price alerts for users watching specific Snapples
    - "Last chance" notifications before prompt expiration
    - Premium Snapples may require coin purchases (IAP integration)
    - Bulk purchase discounts for multiple Snapples
- **Database Schema Updates**:
  - `snapples` collection: `purchaseCount`, `currentPrice`, `basePrice`, `priceHistory`
  - `snapples` collection: `expiresAt` timestamp for cleanup
  - New collection: `priceAlerts` for user notifications
  - Update transactions to track purchase prices
- **Background Jobs**:
  - Scheduled cleanup job to delete expired unpurchased Snapples
  - Price update triggers on each purchase
  - Notification service for price alerts and expiration warnings
- **Files to Create/Modify**:
  - `src/services/pricingService.js` - Dynamic pricing calculations
  - `src/services/snappleLifecycleService.js` - Expiration and cleanup
  - `src/services/notificationService.js` - Price alerts and warnings
  - Update `src/services/purchaseService.js` with pricing logic
  - `app/game/snappleMarket.js` - Browse available Snapples with prices
  - Background cleanup functions for expired content
- **Priority**: Critical (primary revenue driver)

### 🃏 Snapple Deck Building System
- **Date**: August 14, 2025
- **Status**: PENDING
- **Description**: Build deck creation system where users can organize purchased Snapples into playable decks
- **Requirements**:
  - **Snapple Collection Management**:
    - Display all Snapples owned by user
    - Show Snapple metadata (prompt, creator, purchase date, etc.)
    - Filter and search owned Snapples
    - Snapple rarity/quality system for deck building strategy
  - **Deck Builder Interface**:
    - Create multiple named decks per user
    - Add/remove Snapples from deck
    - Deck size limits and validation rules
    - Drag-and-drop interface for deck organization
    - Save and load different deck configurations
  - **Deck Management**:
    - Set active deck for gameplay
    - Duplicate/clone existing decks
    - Delete unwanted decks
    - Deck statistics and analysis
    - Share deck compositions with other users
- **Database Schema Updates**:
  - User document: `ownedSnapples` array, `activedeck` reference
  - New collection: `decks` with user reference and Snapple IDs
  - Update `snapples` collection with ownership tracking
  - New collection: `snappleOwnership` for purchase history
- **Files to Create/Modify**:
  - `src/services/deckService.js` - Deck CRUD operations
  - `src/services/snappleCollectionService.js` - User's Snapple inventory
  - `app/deck/builder.js` - Main deck building interface
  - `app/deck/collection.js` - View owned Snapples
  - `app/deck/management.js` - Manage multiple decks
  - `app/deck/components/SnappleCard.js` - Individual Snapple display
  - `app/deck/components/DeckSlot.js` - Deck building slots
- **Priority**: High (prerequisite for game implementation)
- **Note**: ⚠️ Game development should NOT start until this system is complete

### 📱 Cross-Platform Video Compatibility Fix
- **Date**: August 14, 2025
- **Status**: PENDING
- **Description**: Fix video format compatibility between iOS and Android platforms
- **Problem**: iOS and Android may use different video codecs/formats causing playback issues
- **Requirements**:
  - **Backend Video Processing**: Set up server-side video conversion
    - Convert all uploaded videos to web-compatible format (H.264/MP4)
    - Generate multiple quality versions (720p, 480p) for different devices
    - Ensure consistent codec across platforms
  - **Client-Side Detection**: Add platform-specific video handling
    - Detect device capabilities and serve appropriate format
    - Fallback mechanisms for unsupported formats
    - Progressive loading for larger videos
  - **Storage Optimization**: Implement efficient video storage
    - Store original + converted versions in Firebase Storage
    - Use CDN for faster video delivery
    - Implement video compression during upload
- **Backend Technologies to Consider**:
  - Node.js/Express server with FFmpeg for video conversion
  - Cloud Functions for Firebase with video processing
  - AWS Lambda + MediaConvert for serverless video processing
  - Google Cloud Video Intelligence API
- **Files to Create/Modify**:
  - `backend/` - New backend service for video processing
  - `src/services/videoService.js` - Enhanced video handling with format detection
  - Update `src/services/videoStorage.js` with conversion logic
  - `src/utils/videoCompression.js` - Client-side compression utilities
- **Priority**: Critical (affects core video functionality across platforms)

### 🔄 Package Updates Needed
- **Date**: August 14, 2025
- **Status**: PENDING
- **Description**: Update outdated packages for better compatibility
- **Required Changes**:
  - Update `@react-native-async-storage/async-storage` from 1.24.0 to 2.1.2
- **Command**: `npm install @react-native-async-storage/async-storage@2.1.2`
- **Priority**: Medium (app works but may have compatibility issues)

## Future Enhancements

### 📝 Video Storage Integration
- **Description**: Connect video recording to Firebase Storage
- **Requirements**:
  - Upload recorded videos to Firebase Storage
  - Save video metadata to Firestore
  - Implement video playback from stored URLs
  - Update preview screen to use saved video URIs

### 🎯 Game Flow Completion  
- **Description**: Complete the voting and results screens
- **Requirements**:
  - Implement actual voting functionality
  - Connect to Firebase for vote storage
  - Display real-time results

### 🔐 Authentication System
- **Description**: Implement user authentication
- **Requirements**:
  - Complete login/signup screens with Firebase Auth
  - User profile management
  - Secure video submission attribution

---

## Notes
- Check this file before starting new tasks
- Mark tasks as completed immediately after finishing
- Add discovered sub-tasks under "Discovered During Work" section
- Use consistent date format: YYYY-MM-DD

## Lessons Learned
- **expo-camera gotcha**: Always use `mode="video"` for video recording
- **Race conditions**: Use guard refs to prevent double-stop issues
- **stopRecording**: Returns void, don't await it
- **expo-av deprecated**: Use expo-video for video playback