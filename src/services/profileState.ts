import type { UserProfile } from '../utils/types';

export type ProfileErrorKind = 'permission' | 'network' | 'unknown';

export interface ProfileLoadError {
  kind: ProfileErrorKind;
  /** Firebase error code without the "firestore/" prefix, e.g. "permission-denied". Safe to show/log (no user data). */
  code: string;
  message: string;
}

export type ProfileLoadResult =
  | { status: 'ready'; profile: UserProfile }
  | { status: 'missing' } // the users/{uid} document genuinely does not exist
  | { status: 'incomplete' } // it exists but has no usable username / display name
  | { status: 'error'; error: ProfileLoadError }; // we could NOT find out — never treated as "new user"

const NETWORK_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'cancelled',
  'aborted',
  'resource-exhausted',
  'internal',
  'network-request-failed',
]);

export function classifyError(error: unknown): ProfileLoadError {
  const rawCode = (error as { code?: unknown } | null)?.code;
  const code = typeof rawCode === 'string' ? rawCode.replace(/^firestore\//, '') : 'unknown';

  if (code === 'permission-denied' || code === 'unauthenticated') {
    return { kind: 'permission', code, message: 'The database refused to let this account read its profile.' };
  }
  if (NETWORK_CODES.has(code)) {
    return { kind: 'network', code, message: 'The connection to the database was interrupted.' };
  }
  return { kind: 'unknown', code, message: 'Your profile could not be loaded.' };
}

/** A profile is usable only if it has the fields the rest of the app dereferences without checks. */
export function isValidProfileData(data: unknown, uid: string): boolean {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  if (record.uid !== undefined && record.uid !== uid) return false; // a document must never describe a different account
  return typeof record.username === 'string' && record.username.length > 0 && typeof record.displayName === 'string' && record.displayName.length > 0;
}

export interface ProfileDocFetcher {
  (uid: string): Promise<{ exists: boolean; data: unknown }>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Looks up users/{uid} and reports exactly what happened. Only "the document does
 * not exist" produces 'missing'. Permission and network failures produce 'error',
 * so a failed read can never push an existing user into profile setup.
 * Transient network errors are retried; permission errors are not (retrying can't fix rules).
 */
export async function loadProfileState(
  uid: string,
  fetchDoc: ProfileDocFetcher,
  options: { retries?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<ProfileLoadResult> {
  const { retries = 2, baseDelayMs = 500, sleep = defaultSleep } = options;
  let lastError: ProfileLoadError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const snap = await fetchDoc(uid);
      if (!snap.exists) return { status: 'missing' };
      if (!isValidProfileData(snap.data, uid)) return { status: 'incomplete' };
      return { status: 'ready', profile: snap.data as UserProfile };
    } catch (error) {
      lastError = classifyError(error);
      if (lastError.kind !== 'network' || attempt === retries) break;
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
  return { status: 'error', error: lastError ?? classifyError(null) };
}

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'incomplete' | 'error';

export interface AuthView {
  /** True until we know BOTH who the user is AND whether their profile exists. */
  loading: boolean;
  /** True only when the profile was confirmed missing/incomplete — never while loading, never on a read error. */
  needsProfileSetup: boolean;
  profileError: ProfileLoadError | null;
}

export function deriveAuthView(input: {
  authResolved: boolean;
  hasUser: boolean;
  status: ProfileStatus;
  error: ProfileLoadError | null;
}): AuthView {
  const { authResolved, hasUser, status, error } = input;
  const profileResolving = hasUser && (status === 'idle' || status === 'loading');
  return {
    loading: !authResolved || profileResolving,
    needsProfileSetup: hasUser && (status === 'missing' || status === 'incomplete'),
    profileError: hasUser && status === 'error' ? error : null,
  };
}