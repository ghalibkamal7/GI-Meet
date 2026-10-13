import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { removeContact } from './contactService';
import { removeAcceptedContact } from './contactRequestService';

/**
 * "Remove contact" for the chat options menu. It is its own action: it does NOT delete the chat, does NOT block,
 * and does NOT touch the other person's account or contacts — it only hides them from MY contacts list.
 * Pass `className`/`style` so it matches the other rows of your menu.
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
await removeContact(currentUid, otherUid);
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
          message={`${otherName} will be removed from your contacts. Your chat and message history will remain intact. To become contacts again, a new contact request must be accepted.`}
          confirmLabel="Remove contact"
          danger
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}