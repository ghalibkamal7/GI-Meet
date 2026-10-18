import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, UserMinus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { searchUsersByUsername } from '../../services/searchService';
import { getOrCreateDirectChat } from '../../features/chat/chatService';
import {
  sendContactRequest,
  removeAcceptedContact,
} from '../../features/contacts/contactRequestService';
import {
  subscribeToContactChats,
  subscribeToRemovedContacts,
  subscribeToMyAcceptedContacts,
  type AcceptedContactDoc,
} from '../../features/contacts/contactService';
import {
  buildVisibleLists,
  type Contact,
  type ContactChatDoc,
  type SearchPerson,
} from '../../features/contacts/contacts';
import type { UserProfile } from '../../utils/types';
import { ConfirmDialog } from './ConfirmDialog';

function Avatar({ name, photoURL }: { name: string; photoURL: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--color-brand-100)',
        color: 'var(--color-brand-600)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
      }}
    >
      {photoURL && !failed ? (
        <img src={photoURL} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

const toSearchPerson = (user: UserProfile): SearchPerson => ({
  uid: user.uid,
  displayName: user.displayName,
  username: user.username ?? null,
  photoURL: user.photoURL ?? null,
});

export function NewChatModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const myUid = profile?.uid;

  const [chats, setChats] = useState<ContactChatDoc[] | null>(null);
  const [removed, setRemoved] = useState<Set<string> | null>(null);
  const [acceptedContacts, setAcceptedContacts] = useState<AcceptedContactDoc[]>([]);
  const [removedUnavailable, setRemovedUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [openingUid, setOpeningUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Contact | null>(null);

  // Contacts come from the chats I already have; "removed" is my own private list.
  useEffect(() => {
    if (!myUid) return;
    setLoadError(null);
    setRemovedUnavailable(false);
    setChats(null);
    setRemoved(null);
    setAcceptedContacts([]);

    const unsubscribeAccepted = subscribeToMyAcceptedContacts(
      myUid,
      setAcceptedContacts,
      (error) => {
        console.error('Could not load accepted contacts:', error);
        setLoadError('Could not load your contacts. Check your connection and try again.');
      }
    );

    const unsubscribeChats = subscribeToContactChats(myUid, setChats, () =>
      setLoadError('Could not load your contacts. Check your connection and try again.')
    );
    // If this list cannot be read (e.g. the rules update is not deployed yet), New chat must still work —
    // contacts are simply shown without the "removed" filter and the Remove button is hidden.
    const unsubscribeRemoved = subscribeToRemovedContacts(myUid, setRemoved, () => {
      setRemoved(new Set());
      setRemovedUnavailable(true);
    });
    return () => {
      unsubscribeAccepted();
      unsubscribeChats();
      unsubscribeRemoved();
    };
  }, [myUid, reloadKey]);

  // Username search (the existing service), debounced; stale responses are ignored.
  useEffect(() => {
    const term = query.trim().replace(/^@/, '').toLowerCase();
    if (!myUid || term.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchUsersByUsername(term, myUid);
        if (!cancelled) {
          const people = found.map(toSearchPerson);
          setResults(people);
        }
      } catch {
        if (!cancelled) setSearchError('Search failed. Please try again.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, myUid, removed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRemoval) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pendingRemoval]);

  const contacts = useMemo<Contact[]>(() => {
  if (!myUid) return [];

  return acceptedContacts.map((contact) => {
    const isRequester = contact.requesterUid === myUid;
    const otherUid = contact.members.find((uid) => uid !== myUid) ?? '';
    const otherInfo = isRequester
      ? contact.recipientInfo
      : contact.requesterInfo;

    return {
      uid: otherUid,
      displayName: otherInfo?.displayName || 'GI Meet user',
      photoURL: otherInfo?.photoURL ?? null,
      chatId: '',
      lastMessageAt: 0,
    };
  }).filter((contact) => contact.uid !== '');
}, [acceptedContacts, myUid]);

const visible = useMemo(
  () => buildVisibleLists(contacts, query, results, myUid ?? ''),
  [contacts, query, results, myUid]
);
  const loading = !loadError && (chats === null || removed === null);
  const hasQuery = query.trim().replace(/^@/, '').length > 0;

  // Opens the existing conversation, or creates one — through the existing chat service.
  async function openChat(person: { uid: string; displayName: string; photoURL: string | null }) {
    if (!profile || openingUid) return;
    setOpeningUid(person.uid);
    setActionError(null);
    try {
      const chatId = await getOrCreateDirectChat(
        profile.uid,
        { displayName: profile.displayName, photoURL: profile.photoURL },
        person.uid,
        { displayName: person.displayName, photoURL: person.photoURL }
      );
      onClose();
      navigate(`/chat/${chatId}`);
    } catch {
      setActionError('Could not open the conversation. Please try again.');
      setOpeningUid(null);
    }
  }

async function sendRequest(person: { uid: string; displayName: string }) {
  if (!profile || openingUid) return;

  setOpeningUid(person.uid);
  setActionError(null);

  try {
    await sendContactRequest(profile.uid, person.uid);
    showToast(`Contact request sent to ${person.displayName}.`, 'success');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not send contact request. Please try again.';
    setActionError(message);
  } finally {
    setOpeningUid(null);
  }
}
  async function confirmRemoval() {
    if (!profile || !pendingRemoval) return;
    const target = pendingRemoval;
    setPendingRemoval(null);
    try {
      await removeAcceptedContact(profile.uid, target.uid);

      showToast(`${target.displayName} was removed from your contacts. Your chat history remains intact. A new request must be accepted to reconnect.`, 'success');
    } catch {
      showToast('Could not remove this contact. Please try again.', 'error');
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        className="rb-card rb-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="New chat"
        style={{ width: 'min(420px, calc(100% - 24px))', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 20 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ marginBottom: 12 }}>New chat</h3>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={16} strokeWidth={1.75} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 14, color: 'var(--color-text-muted)' }} />
          <input
            className="rb-input"
            style={{ paddingLeft: 36 }}
            placeholder="Search by username or name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        <div style={{ overflowY: 'auto', minHeight: 120 }}>
          {loading && (
            <p style={mutedStyle}>
              <Loader2 className="rb-spin" size={14} strokeWidth={2} aria-hidden="true" /> Loading contacts…
            </p>
          )}

          {loadError && (
            <div role="alert">
              <p className="rb-error-text">{loadError}</p>
              <button type="button" className="rb-btn rb-btn--outline" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setReloadKey((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}

          {actionError && (
            <p className="rb-error-text" role="alert">
              {actionError}
            </p>
          )}

          {!loading && !loadError && visible.contacts.length > 0 && (
            <>
              <div style={sectionStyle}>Contacts</div>
              {visible.contacts.map((contact) => (
                <div key={contact.uid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button type="button" style={rowButtonStyle} disabled={Boolean(openingUid)} onClick={() => openChat(contact)}>
                    <Avatar name={contact.displayName} photoURL={contact.photoURL} />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {contact.displayName}
                    </span>
                    {openingUid === contact.uid && <Loader2 className="rb-spin" size={16} strokeWidth={2} aria-label="Opening" />}
                  </button>
                  {!removedUnavailable && (
                    <button
                      type="button"
                      className="rb-icon-btn"
                      style={iconButtonStyle}
                      aria-label={`Remove ${contact.displayName} from contacts`}
                      title="Remove contact"
                      onClick={() => setPendingRemoval(contact)}
                    >
                      <UserMinus size={16} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {!loading && !loadError && !hasQuery && contacts.length === 0 && (
            <p style={mutedStyle}>No contacts yet. Search by username to start a chat.</p>
          )}

          {hasQuery && (
            <>
              <div style={sectionStyle}>People on GI Meet</div>
              {searching && (
                <p style={mutedStyle}>
                  <Loader2 className="rb-spin" size={14} strokeWidth={2} aria-hidden="true" /> Searching…
                </p>
              )}
              {searchError && (
                <p className="rb-error-text" role="alert">
                  {searchError}
                </p>
              )}
              {!searching && !searchError && query.trim().replace(/^@/, '').length < 2 && <p style={mutedStyle}>Type at least 2 characters to search by username.</p>}
              {visible.others.map((person) => (
                <button key={person.uid} type="button" style={rowButtonStyle} disabled={Boolean(openingUid)} onClick={() => sendRequest(person)}>
                  <Avatar name={person.displayName} photoURL={person.photoURL} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.displayName}</span>
                    {person.username && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{person.username}</span>}
                  </span>
                  {openingUid === person.uid ? (
                    <Loader2 className="rb-spin" size={16} strokeWidth={2} aria-label="Sending request" />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-brand-600)', fontWeight: 500 }}>Send request</span>
                  )}
                </button>
              ))}
              {!searching && !searchError && query.trim().replace(/^@/, '').length >= 2 && visible.others.length === 0 && visible.contacts.length === 0 && (
                <p style={mutedStyle}>No one found for &ldquo;{query.trim()}&rdquo;.</p>
              )}
            </>
          )}
        </div>

        <button type="button" className="rb-btn rb-btn--outline" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
          Close
        </button>
      </div>

      {pendingRemoval && (
        <ConfirmDialog
          title="Remove contact?"
          message={`${pendingRemoval.displayName} will be removed from your contacts and hidden from your chat list. Your chat and message history will not be deleted. To reconnect, send a new contact request and wait for it to be accepted.`}
          confirmLabel="Remove contact"
          danger
          onConfirm={confirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
} as const;

const sectionStyle = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '10px 0 4px' } as const;
const mutedStyle = { fontSize: 14, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0' } as const;
const rowButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: 1,
  minWidth: 0,
  padding: '8px 6px',
  background: 'none',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  color: 'inherit',
  textAlign: 'left',
  fontSize: 14,
} as const;
const iconButtonStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
  padding: 8,
  borderRadius: 8,
  flexShrink: 0,
} as const;