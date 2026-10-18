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

export function decideDeviceKeyAction(
  hasLocalPrivateKey: boolean,
  localPublicKeyJwk: string | null,
  publishedPublicKeyJwk: string | null
): DeviceKeyAction {
  if (!hasLocalPrivateKey) {
    return publishedPublicKeyJwk ? 'restore-missing-key' : 'create-initial-key';
  }
  if (!publishedPublicKeyJwk) return 'publish-local-key';

  const localCoordinates = publicKeyCoordinates(localPublicKeyJwk);
  const publishedCoordinates = publicKeyCoordinates(publishedPublicKeyJwk);
  if (!localCoordinates || !publishedCoordinates) return 'resolve-key-mismatch';

  return localCoordinates.kty === publishedCoordinates.kty &&
    localCoordinates.crv === publishedCoordinates.crv &&
    localCoordinates.x === publishedCoordinates.x &&
    localCoordinates.y === publishedCoordinates.y
    ? 'use-local-key'
    : 'resolve-key-mismatch';
}
