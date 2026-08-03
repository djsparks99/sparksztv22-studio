import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  onSnapshot,
  orderBy,
  where,
  serverTimestamp,
} from "firebase/firestore";

import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// OAuth Providers
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
export const yahooProvider = new OAuthProvider("yahoo.com");

// Helper Auth Functions
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInWithGithub = () => signInWithPopup(auth, githubProvider);
export const signInWithYahoo = () => signInWithPopup(auth, yahooProvider);
export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);
export const logOut = () => signOut(auth);

// Firestore Profile Helpers
export async function fetchUserDoc(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.error("Error fetching user doc:", err);
  }
  return null;
}

export async function savePermanentUsername(uid, { username, display_name, email }) {
  const cleanUsername = username.toLowerCase().trim();
  const userRef = doc(db, "users", uid);

  // Check if user already has a locked username
  const existingSnap = await getDoc(userRef);
  if (existingSnap.exists() && existingSnap.data()?.username_locked) {
    // Permanent lock prevents overwriting username/display_name
    return existingSnap.data();
  }

  const userData = {
    uid,
    email: email || "",
    username: cleanUsername,
    display_name: display_name || cleanUsername,
    username_locked: true,
    photo_url: auth.currentUser?.photoURL || null,
    bio: existingSnap.exists() ? existingSnap.data()?.bio || "" : "",
    created_at: existingSnap.exists()
      ? existingSnap.data()?.created_at || new Date().toISOString()
      : new Date().toISOString(),
  };

  await setDoc(userRef, userData, { merge: true });

  // Also sync or create channel doc in Firestore
  const channelRef = doc(db, "channels", uid);
  const channelSnap = await getDoc(channelRef);
  if (!channelSnap.exists()) {
    await setDoc(channelRef, {
      channel_id: uid,
      user_uid: uid,
      username: cleanUsername,
      display_name: display_name || cleanUsername,
      photo_url: auth.currentUser?.photoURL || null,
      thumbnail_url: null,
      playback_id: uid.substring(0, 16),
      stream_title: `${display_name || cleanUsername}'s Live Stream`,
      category: "music",
      is_live: false,
      viewer_count: 0,
      last_updated: new Date().toISOString(),
    });
  }

  return userData;
}

export async function updateUserProfileInFirestore(uid, updates, username = null) {
  if (!uid || !updates) return;
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, updates, { merge: true });

    const channelUpdates = {};
    if (updates.display_name !== undefined) channelUpdates.display_name = updates.display_name;
    if (updates.photo_url !== undefined) channelUpdates.photo_url = updates.photo_url;
    if (updates.thumbnail_url !== undefined) channelUpdates.thumbnail_url = updates.thumbnail_url;

    if (Object.keys(channelUpdates).length > 0) {
      await setDoc(doc(db, "channels", uid), channelUpdates, { merge: true });
      if (username) {
        await setDoc(doc(db, "channels", username.toLowerCase()), channelUpdates, { merge: true });
      } else {
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data()?.username) {
          const uname = String(userSnap.data().username).toLowerCase();
          await setDoc(doc(db, "channels", uname), channelUpdates, { merge: true });
        }
      }
    }
  } catch (err) {
    console.warn("Client Firestore user profile update warning:", err);
  }
}

export { onAuthStateChanged };
