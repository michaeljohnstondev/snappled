# 🍏 Snapple Park

A social gaming app where users create videos from prompts and discover amazing content! Built with React Native and Expo.

## ✨ Features

- **Hourly Prompts**: Fresh creative challenges every hour
- **Video Creation**: Record videos with built-in camera
- **Social Voting**: Vote on other users' submissions
- **Video Feed**: Discover and browse community content
- **User Authentication**: Secure login and signup system
- **Real-time Results**: See prompt results and rankings
- **Currency System**: Earn coins, tickets, and topic tokens

## 🛠 Tech Stack

- **Frontend**: React Native with Expo
- **Navigation**: React Router
- **Styling**: Custom Vibe components with gradient themes
- **Backend**: Firebase (Auth, Firestore, Storage, Functions)
- **Video**: Expo AV and Camera
- **State**: Context API with AsyncStorage persistence

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator or Android Emulator (optional)
- Expo Go app on your mobile device

### Installation

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd snapple-park
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Firebase**

   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Authentication, Firestore, and Storage
   - Update config in `src/services/firebase.js`

4. **Start the development server**

   ```bash
   npm start
   ```

5. **Run the app**
   - Scan the QR code with Expo Go app
   - Or press `w` for web, `i` for iOS simulator, `a` for Android

### Available Scripts

- `npm start` - Start Expo development server
- `npm run android` - Open on Android device/emulator
- `npm run ios` - Open on iOS device/simulator
- `npm run web` - Open in web browser
- `npm run lint` - Run ESLint (if configured)

## 📱 App Flow

1. **Landing** - Welcome screen with app intro
2. **Authentication** - Login or sign up with email
3. **Game Loop**:
   - View current hourly prompt
   - Record your 10-second video response
   - Vote on other user submissions
   - See results and rankings
4. **Video Feed** - Browse all community videos
5. **Social Features** - Comments, likes, user profiles

## 📁 Project Structure

Following CLAUDE.md conventions:

```
snapple-park/
├── App.js                 # Root app component
├── Navigation.js          # Navigation configuration
├── app/                   # Navigation shells only
│   ├── _layout.js         # Root layout with providers
│   ├── index.js           # Landing screen route
│   ├── auth/              # Authentication routes
│   ├── game/              # Game flow routes
│   ├── video/             # Video recording and feed routes
│   ├── social/            # Social features routes
│   └── debug/             # Development/debug screens
├── src/                   # All UI + logic
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # Base UI components (buttons, inputs)
│   │   ├── media/         # Video/camera components
│   │   ├── comments/      # Comment system components
│   │   ├── currency/      # Currency display components
│   │   └── social/        # Social feature components
│   ├── screens/           # Screen containers
│   │   ├── FeedScreen/    # Video feed screen
│   │   ├── PromptScreen/  # Game prompt screen
│   │   └── *.js           # Other screens
│   ├── services/          # Firebase/API logic
│   ├── hooks/             # Custom React hooks
│   ├── store/             # Context providers
│   ├── theme/             # App theme and styling
│   ├── lib/               # Pure utilities
│   └── config/            # App configuration
├── functions/             # Firebase Cloud Functions
├── CLAUDE.md              # Development guidelines
└── package.json
```

## 🎨 Design System

The app uses a custom "Vibe" design system featuring:

- **Colors**: Cyberpunk neon palette (blues, purples, gradients)
- **Components**: Gradient buttons, glowing text effects, themed inputs
- **Typography**: Bold fonts with text shadows and glow effects
- **Layout**: Dark theme with linear gradients throughout
- **Responsive**: Adapts to different screen sizes

## ⚙️ Configuration

### Firebase Setup

Update `src/services/firebase.js` with your project configuration:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id",
};
```

### Environment

- Uses Expo SDK 52+
- React Native 0.76+
- Firebase v9 modular SDK
- AsyncStorage for persistence

## 🧪 Testing

Run the development server and test on:

- Expo Go mobile app (recommended)
- iOS Simulator
- Android Emulator
- Web browser (limited camera functionality)

## 📖 Development Guidelines

This project follows the conventions outlined in `CLAUDE.md`:

- **One screen at a time** development workflow
- **KISS principle** - Keep It Simple, Stupid
- **Single responsibility** for files and functions
- **File size limits** - < 500 lines per file, < 50 lines per function
- **Clear separation** between navigation (app/) and logic (src/)

## 🔧 Troubleshooting

- **Firebase Auth**: Ensure AsyncStorage is properly configured
- **Camera Issues**: Test on physical device, not simulator
- **Navigation**: Check route names match between app/ and Navigation.js
- **Styling**: Verify theme imports are correct

## 📝 License

This project is private and proprietary.

---

**Development Notes**:

- Follow CLAUDE.md guidelines for consistent development
- Use TodoWrite for task tracking
- Test on real devices for camera functionality
- Maintain clean separation between UI and business logic
