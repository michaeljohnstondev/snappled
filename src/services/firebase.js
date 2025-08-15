// Firebase v12 Configuration for Snapple Park
import { initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDLBKPVH4XH-hJIcI3KNJwYqAI8fqboHF4",
  authDomain: "snapplepark.firebaseapp.com",
  databaseURL: "https://snapplepark-default-rtdb.firebaseio.com",
  projectId: "snapplepark",
  storageBucket: "snapplepark.firebasestorage.app",
  messagingSenderId: "107855342657",
  appId: "1:107855342657:web:3ef147a9906a238bf5aac0",
  measurementId: "G-HQH7LYNDQS",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with React Native persistence
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // Auth already initialized
  auth = getAuth(app);
}

// Initialize Firestore
const db = getFirestore(app);

// Initialize Cloud Storage
const storage = getStorage(app);

// Initialize Cloud Functions
const functions = getFunctions(app);

// Connect to emulators in development
if (__DEV__) {
  // Uncomment if using Firebase emulators for development
  // try {
  //   connectFirestoreEmulator(db, 'localhost', 8080);
  //   connectFunctionsEmulator(functions, 'localhost', 5001);
  // } catch (e) {
  //   console.log('Emulators already connected');
  // }
  
  // Suppress excessive Firestore warnings in development
  console.warn = (function(originalWarn) {
    return function(message) {
      if (typeof message === 'string' && 
          (message.includes('WebChannelConnection RPC') || 
           message.includes('transport errored'))) {
        return; // Suppress these specific warnings
      }
      originalWarn.apply(console, arguments);
    };
  })(console.warn);
}

export { auth, db, storage, functions };
export default app;
