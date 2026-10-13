import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { removeAcceptedContact } from './contactRequestService';

/**
 * Removes the accepted contact relationship and hides the contact
 * from the current user's chat list without deleting chat history
 * or messages. Reconnecting requires a new accepted contact request.
 */
export function RemoveContactMenuItem({
  currentUid,
  otherUid,
  otherName,
  className,
  style,
  onRemoved,
}: {
  currentUid: string;
  otherUid: string;
  otherName: string;
  className?: string;
  style?: React.CSSProperties;
  onRemoved?: () => void;
}) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(false);
    try {
      await removeAcceptedContact(currentUid, otherUid);
      showToast(`${otherName} was removed from your contacts. Your chat history was not deleted.`, 'success');
      onRemoved?.();
    } catch {
      showToast('Could not remove this contact. Please try again.', 'error');
    }
  }

  if (currentUid === otherUid) return null; // never offered for yourself

  return (
    <>
      <button
        type="button"
        className={className}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, padding: '10px 4px', ...style }}
        onClick={() => setConfirming(true)}
      >
        <UserMinus size={16} strokeWidth={1.75} aria-hidden="true" /> Remove contact
      </button>
      {confirming && (
        <ConfirmDialog
          title="Remove contact?"
          message={`${otherName} will be removed from your contacts and hidden from your chat list. Your chat and message history will not be deleted. To reconnect, send a new contact request and wait for it to be accepted.`}
          confirmLabel="Remove contact"
          danger
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}