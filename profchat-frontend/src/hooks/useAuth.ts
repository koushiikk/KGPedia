import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "@/config/firebase";
import { useChatStore } from "@/store/chatStore";
import { socketService } from "@/services/socketService";

const googleProvider = new GoogleAuthProvider();
// Always show the account chooser — never auto-sign in with the cached account
googleProvider.setCustomParameters({ prompt: "select_account" });

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        // User signed out — purge all session state so the next user
        // starts with a completely clean slate (no stale messages,
        // no leftover session IDs, no dangling WebSocket listeners).
        socketService.removeListener("chat_handler");
        socketService.reset();
        useChatStore.getState().resetChat();
      }
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  }

  async function signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function signUpWithEmail(email: string, password: string, displayName?: string) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && result.user) {
      await updateProfile(result.user, { displayName });
    }
    return result;
  }

  async function logout() {
    return signOut(auth);
    // onAuthStateChanged above fires on sign-out and handles cleanup.
  }

  async function getToken(): Promise<string> {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }

  return {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    logout,
    getToken,
  };
}
