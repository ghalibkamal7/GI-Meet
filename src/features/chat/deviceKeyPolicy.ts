type PublicKeyCoordinates = {
  kty: string;
  crv: string;
  x: string;
  y: string;
};

export type DeviceKeyAction =
  | 'use-local-key'
  | 'publish-local-key'
  | 'create-initial-key'
  | 'restore-missing-key'
  | 'resolve-key-mismatch';

function publicKeyCoordinates(jwk: string | null): PublicKeyCoordinates | null {
  if (!jwk) return null;
  try {
    const parsed: unknown = JSON.parse(jwk);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    if (
      typeof value.kty !== 'string' ||
      typeof value.crv !== 'string' ||
      typeof value.x !== 'string' ||
      typeof value.y !== 'string'
    ) {
      return null;
    }
    return { kty: value.kty, crv: value.crv, x: value.x, y: value.y };
  } catch {
    return null;
  }
}

export function publicKeysMatch(leftJwk: string | null, rightJwk: string | null): boolean {
  const left = publicKeyCoordinates(leftJwk);
  const right = publicKeyCoordinates(rightJwk);
  return Boolean(
    left &&
    right &&
    left.kty === right.kty &&
    left.crv === right.crv &&
    left.x === right.x &&
    left.y === right.y
  );
}

export function chooseRegisteredPublicKey(
  currentValue: unknown,
  proposedPublicKeyJwk: string
): { publicKeyJwk: string; shouldRegister: boolean } {
  if (!proposedPublicKeyJwk.trim()) throw new Error('A public encryption key is required.');
  if (currentValue === undefined || currentValue === null || currentValue === '') {
    return { publicKeyJwk: proposedPublicKeyJwk, shouldRegister: true };
  }
  if (typeof currentValue === 'string' && currentValue.trim()) {
    return { publicKeyJwk: currentValue, shouldRegister: false };
  }
  throw new Error('The registered encryption key has an invalid format and was not changed.');
}

export function decideDeviceKeyAction(
  hasLocalPrivateKey: boolean,
  localPublicKeyJwk: string | null,
  publishedPublicKeyJwk: string | null
): DeviceKeyAction {
  if (!hasLocalPrivateKey) {
    return publishedPublicKeyJwk ? 'restore-missing-key' : 'create-initial-key';
  }
  if (!publishedPublicKeyJwk) return 'publish-local-key';

  return publicKeysMatch(localPublicKeyJwk, publishedPublicKeyJwk)
    ? 'use-local-key'
    : 'resolve-key-mismatch';
}
