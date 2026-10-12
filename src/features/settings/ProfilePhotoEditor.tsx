import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { changeProfilePhoto, PROFILE_PHOTO_MAX_MB, PROFILE_PHOTO_TYPES } from '../../services/profilePhotoService';
import { validateProfilePhoto } from '../../utils/profilePhoto';

/**
 * "Change photo" control for the Settings screen. Only ever edits the signed-in
 * user's own profile (it uses profile.uid from the auth context, never an id
 * passed in from outside).
 */
export function ProfilePhotoEditor() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  if (!profile) return null;

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be picked again after an error
    if (!file || !profile) return;

    setError(null);
    const problem = validateProfilePhoto(file);
    if (problem) {
      setError(problem);
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setBusy(true);
    try {
      const result = await changeProfilePhoto(profile.uid, file);
      await refreshProfile(); // the new photo shows everywhere only after the save is confirmed
      setImageFailed(false);
      showToast(
        result.copiesNotUpdated ? 'Photo updated, but some chats could not be refreshed yet.' : 'Profile photo updated.',
        result.copiesNotUpdated ? 'info' : 'success'
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your photo. Your previous photo was kept.');
    } finally {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setBusy(false);
    }
  }

  const shownUrl = previewUrl ?? (imageFailed ? null : profile.photoURL);

  return (
    <div className="rb-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--color-brand-100)',
            color: 'var(--color-brand-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 600,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {shownUrl ? (
            <img
              src={shownUrl}
              alt=""
              onError={() => setImageFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            profile.displayName.charAt(0).toUpperCase()
          )}
        </div>
        {busy && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="rb-spin" size={24} strokeWidth={2} aria-label="Uploading" />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.displayName}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>@{profile.username}</div>

        <button
          type="button"
          className="rb-btn rb-btn--outline"
          style={{ padding: '8px 14px', fontSize: 13 }}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={15} strokeWidth={1.75} aria-hidden="true" /> {busy ? 'Uploading…' : 'Change photo'}
        </button>

        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
          JPG, PNG or WebP, up to {PROFILE_PHOTO_MAX_MB} MB
        </p>
        {error && (
          <p className="rb-error-text" role="alert" style={{ margin: '6px 0 0' }}>
            {error}
          </p>
        )}
      </div>

      <input ref={inputRef} type="file" accept={PROFILE_PHOTO_TYPES.join(',')} hidden onChange={handleFileChosen} />
    </div>
  );
}