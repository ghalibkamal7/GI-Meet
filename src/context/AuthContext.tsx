import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { subscribeToAuthChanges, logOut as firebaseLogOut } from '../firebase/auth';
import { getUserProfile, updateOnlineStatus } from '../services/userService';
import type { UserProfile } from '../utils/types';
import { soundService } from '../services/soundService';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True once we know the user is authed but has no Firestore profile yet (needs onboarding) */
  needsProfileSetup: boolean;
  refreshProfile: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const userProfile = await getUserProfile(uid);
    setProfile(userProfile);
  }

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (user) => {
      setFirebaseUser(user);

      if (user) {
        await loadProfile(user.uid);
        // Best-effort — don't block UI or crash the auth flow if this fails.
        updateOnlineStatus(user.uid, true).catch(() => undefined);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Mark the user offline when they close the tab. Not fully reliable
  // (browsers can kill tabs without firing this) — a presence system with
  // Realtime Database or a Cloud Function heartbeat is the more robust
  // approach, planned for a later phase.
  useEffect(() => {
    function handleBeforeUnload() {
      if (firebaseUser) {
        updateOnlineStatus(firebaseUser.uid, false).catch(() => undefined);
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [firebaseUser]);

  async function refreshProfile() {
    if (firebaseUser) {
      await loadProfile(firebaseUser.uid);
    }
  }

  async function logOut() {
    soundService.stopAll();
    if (firebaseUser) {
      await updateOnlineStatus(firebaseUser.uid, false).catch(() => undefined);
    }
    await firebaseLogOut();
  }

  const value: AuthContextValue = {
    firebaseUser,
    profile,
    loading,
    needsProfileSetup: Boolean(firebaseUser) && !profile && !loading,
    refreshProfile,
    logOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
