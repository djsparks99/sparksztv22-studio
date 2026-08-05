import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  auth,
  onAuthStateChanged,
  fetchUserDoc,
  savePermanentUsername,
  signInWithGoogle,
  signInWithGithub,
  signInWithYahoo,
  signInWithEmail,
  signUpWithEmail,
  logOut,
} from "@/lib/firebase";
import { api, setToken, getToken, apiErrorMessage } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("sparkz_user_profile");
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {
          return undefined;
        }
      }
    }
    return undefined; // undefined = loading
  });
  const [needsUsername, setNeedsUsername] = useState(false);
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState(null);

  // Sync user state changes to localStorage
  useEffect(() => {
    if (user !== undefined) {
      if (user) {
        localStorage.setItem("sparkz_user_profile", JSON.stringify(user));
      } else {
        localStorage.removeItem("sparkz_user_profile");
      }
    }
  }, [user]);

  // Sync token to Express backend so legacy API calls work seamlessly
  const syncExpressToken = async (fbUser, profileData) => {
    try {
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        setToken(idToken);
      }
    } catch (e) {
      console.warn("Express token sync notice:", e);
    }
  };

  const handleFirebaseUserChange = useCallback(async (fbUser) => {
    if (!fbUser) {
      setUser(null);
      setNeedsUsername(false);
      setPendingFirebaseUser(null);
      setToken(null);
      return;
    }

    if (fbUser.email === "markysparks99@gmail.com") {
      let photo_url = fbUser.photoURL || null;
      let bio = "Broadcasting live and loud on SPARKZ.TV";
      let display_name = "djsparkz";
      try {
        const userDoc = await fetchUserDoc(fbUser.uid);
        if (userDoc) {
          if (userDoc.photo_url) photo_url = userDoc.photo_url;
          if (userDoc.bio) bio = userDoc.bio;
          if (userDoc.display_name && userDoc.display_name !== "SPARKS 108 FM") display_name = userDoc.display_name;
        }
      } catch (e) {}

      const profile = {
        uid: fbUser.uid,
        email: fbUser.email,
        username: "djsparkz",
        display_name: display_name,
        photo_url: photo_url,
        bio: bio,
        username_locked: true,
        created_at: new Date().toISOString(),
      };
      await syncExpressToken(fbUser, profile);
      setUser(profile);
      setNeedsUsername(false);
      setPendingFirebaseUser(null);
      return;
    }

    try {
      const userDoc = await fetchUserDoc(fbUser.uid);
      if (userDoc && userDoc.username_locked) {
        // User has completed permanent username registration in Firestore
        const profile = {
          uid: fbUser.uid,
          email: fbUser.email || userDoc.email,
          username: userDoc.username,
          display_name: userDoc.display_name,
          photo_url: userDoc.photo_url || fbUser.photoURL || null,
          bio: userDoc.bio || "",
          username_locked: true,
          created_at: userDoc.created_at,
        };
        await syncExpressToken(fbUser, profile);
        setUser(profile);
        setNeedsUsername(false);
        setPendingFirebaseUser(null);
      } else {
        // User logged in but hasn't set locked username in Firestore
        setPendingFirebaseUser(fbUser);
        setNeedsUsername(true);
        setUser(null);
      }
    } catch (err) {
      console.error("Auth state error:", err);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      handleFirebaseUserChange(fbUser);
    });
    return () => unsubscribe();
  }, [handleFirebaseUserChange]);

  const loginWithOAuth = async (providerName) => {
    try {
      let res;
      if (providerName === "google") res = await signInWithGoogle();
      else if (providerName === "github") res = await signInWithGithub();
      else if (providerName === "yahoo") res = await signInWithYahoo();
      else throw new Error("Invalid provider");

      if (res.user) {
        await handleFirebaseUserChange(res.user);
        return { ok: true };
      }
    } catch (e) {
      return { ok: false, error: e.message || `${providerName} login failed` };
    }
  };

  const login = async (email, password) => {
    try {
      const res = await signInWithEmail(email, password);
      if (res.user) {
        await handleFirebaseUserChange(res.user);
        return { ok: true };
      }
    } catch (e) {
      return { ok: false, error: e.message || "Invalid credentials" };
    }
  };

  const register = async ({ email, password, username, display_name }) => {
    try {
      const res = await signUpWithEmail(email, password);
      if (res.user) {
        // Save permanent username to Firestore
        const profile = await savePermanentUsername(res.user.uid, {
          username,
          display_name: display_name || username,
          email: res.user.email,
        });
        await handleFirebaseUserChange(res.user);
        return { ok: true, user: profile };
      }
    } catch (e) {
      return { ok: false, error: e.message || "Registration failed" };
    }
  };

  const completeUsernameLock = async (username, display_name) => {
    if (!pendingFirebaseUser) return { ok: false, error: "No user pending" };
    try {
      const profile = await savePermanentUsername(pendingFirebaseUser.uid, {
        username,
        display_name: display_name || username,
        email: pendingFirebaseUser.email,
      });
      await handleFirebaseUserChange(pendingFirebaseUser);
      return { ok: true, user: profile };
    } catch (e) {
      return { ok: false, error: e.message || "Failed to lock username" };
    }
  };

  const logout = async () => {
    await logOut();
    setUser(null);
    setNeedsUsername(false);
    setPendingFirebaseUser(null);
    setToken(null);
  };

  const refresh = useCallback(async () => {
    if (auth?.currentUser) {
      await handleFirebaseUserChange(auth.currentUser);
    } else {
      try {
        const { data } = await api.get("/users/me");
        if (data && data.uid) {
          setUser((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // ignore
      }
    }
  }, [handleFirebaseUserChange]);

  return (
    <AuthContext.Provider
      value={{
        user,
        needsUsername,
        pendingFirebaseUser,
        login,
        register,
        loginWithOAuth,
        completeUsernameLock,
        logout,
        setUser,
        refresh,
        refreshUser: refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
