export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  return { valid: true };
}

// Usernames: 3-20 chars, lowercase letters, numbers, underscores.
// Kept intentionally simple for Phase 1 — uniqueness is enforced server-side
// (Firestore rule + a reserved `usernames/{username}` lookup doc), not just here.
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): { valid: boolean; message?: string } {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      valid: false,
      message: 'Username must be 3-20 characters: lowercase letters, numbers, underscores only.',
    };
  }
  return { valid: true };
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
