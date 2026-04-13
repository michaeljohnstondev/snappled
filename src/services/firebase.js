import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

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

const app = initializeApp(firebaseConfig);

let auth;
try {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { auth, db, storage, functions };
export default app;
