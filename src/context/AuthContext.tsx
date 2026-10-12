import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import type { UserProfile } from '../utils/types';
import { fetchUserProfileDoc, updateOnlineStatus } from '../services/userService';
import {
  deriveAuthView,
  loadProfileState,
  type ProfileLoadError,
  type ProfileLoadResult,
  type ProfileStatus,
} from '../services/profileState';

interface AuthContextValue {
  firebaseUser: User | null;
  /** Only ever a CONFIRMED, valid profile. null while loading, missing, or if the read failed. */
  profile: UserProfile | null;
  /** True until we know who the user is AND whether their profile exists. Never redirect while this is true. */
  loading: boolean;
  /** True only when the profile was confirmed missing/incomplete. Never true while loading or after a read failure. */
  needsProfileSetup: boolean;
  /** Set when reading the profile failed (permissions / network). Show an error with Retry — do NOT treat as a new user. */
  profileError: ProfileLoadError | null;
  /** Re-reads the profile. Silent (no spinner, keeps the current profile on failure) when a profile is already loaded. */
  refreshProfile: () => Promise<void>;
  retryProfileLoad: () => Promise<void>;
  logOut: () => Promise<void>;
}

interface ProfileState {
  status: ProfileStatus;
  profile: UserProfile | null;
  error: ProfileLoadError | null;
}

const INITIAL_PROFILE_STATE: ProfileState = { status: 'idle', profile: null, error: null };

function stateFromResult(result: ProfileLoadResult): ProfileState {
  switch (result.status) {
    case 'ready':
      return { status: 'ready', profile: result.profile, error: null };
    case 'error':
      return { status: 'error', profile: null, error: result.error };
    default:
      return { status: result.status, profile: null, error: null }; // 'missing' | 'incomplete'
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authResolved, setAuthResolved] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>(INITIAL_PROFILE_STATE);

  // Every load gets a number; if the user changes (or another load starts) while one is in flight,
  // the stale result is dropped instead of overwriting newer state.
  const loadSequence = useRef(0);
  const statusRef = useRef<ProfileStatus>('idle');
  useEffect(() => {
    statusRef.current = profileState.status;
  }, [profileState.status]);

  const loadProfile = useCallback(async (uid: string, silent: boolean) => {
    const sequence = ++loadSequence.current;
    if (!silent) setProfileState({ status: 'loading', profile: null, error: null });

    const result = await loadProfileState(uid, fetchUserProfileDoc);
    if (sequence !== loadSequence.current) return;

    if (result.status === 'error') console.warn('[auth] could not load profile:', result.error.code); // code only, no user data
    if (silent && result.status === 'error') return; // a failed background refresh must not kick a signed-in user out
    setProfileState(stateFromResult(result));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      loadSequence.current += 1; // anything still loading for the previous user is now stale
      setFirebaseUser(user);
      if (!user) {
        setProfileState(INITIAL_PROFILE_STATE);
        setAuthResolved(true);
        return;
      }
      // Same batch as setFirebaseUser: there is never a render with a user but no "loading" profile state.
      setProfileState({ status: 'loading', profile: null, error: null });
      setAuthResolved(true);
      void loadProfile(user.uid, false);
    });
    return unsubscribe;
  }, [loadProfile]);

  // PRESENCE — only once the profile is confirmed to exist (a merge-write before that could create a half-empty
  // users/{uid} document). If your previous AuthContext handled presence differently, keep your version here.
  const readyUid = firebaseUser && profileState.status === 'ready' ? firebaseUser.uid : null;
  useEffect(() => {
    if (!readyUid) return;
    const setPresence = (online: boolean) => {
      updateOnlineStatus(readyUid, online).catch(() => undefined);
    };
    setPresence(true);
    const onPageHide = () => setPresence(false);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [readyUid]);

  const refreshProfile = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await loadProfile(uid, statusRef.current === 'ready');
  }, [loadProfile]);

  const retryProfileLoad = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await loadProfile(uid, false);
  }, [loadProfile]);

  const logOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const view = deriveAuthView({
    authResolved,
    hasUser: firebaseUser !== null,
    status: profileState.status,
    error: profileState.error,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile: firebaseUser && profileState.status === 'ready' ? profileState.profile : null,
      loading: view.loading,
      needsProfileSetup: view.needsProfileSetup,
      profileError: view.profileError,
      refreshProfile,
      retryProfileLoad,
      logOut,
    }),
    [firebaseUser, profileState, view.loading, view.needsProfileSetup, view.profileError, refreshProfile, retryProfileLoad, logOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}