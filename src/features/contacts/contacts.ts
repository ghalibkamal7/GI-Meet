/** The few fields of a chat document that contact derivation needs. */
export interface ContactChatDoc {
  id: string;
  participants: string[];
  participantInfo: Record<string, { displayName?: string; photoURL?: string | null }>;
  lastMessageAt: number;
}

export interface Contact {
  uid: string;
  displayName: string;
  photoURL: string | null;
  chatId: string;
  lastMessageAt: number;
}

/** A person returned by the existing username search. */
export interface SearchPerson {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
}

/**
 * Contacts = the people you already have a 1-1 chat with (the same meaning the app already uses elsewhere),
 * minus the ones YOU removed. "Remove contact" is therefore purely a per-user filter: it never touches the
 * chat, its messages, the other person's account or the other person's contacts.
 */
export function deriveContacts(chats: ContactChatDoc[], removedIds: ReadonlySet<string>, myUid: string): Contact[] {
  const byUid = new Map<string, Contact>();

  for (const chat of chats) {
    if (!chat.participants.includes(myUid)) continue; // defensive: only chats I am part of
    const otherUid = chat.participants.find((participant) => participant !== myUid);
    if (!otherUid || removedIds.has(otherUid)) continue; // never myself, never someone I removed

    const info = chat.participantInfo[otherUid];
    const candidate: Contact = {
      uid: otherUid,
      displayName: info?.displayName?.trim() || 'Unknown user',
      photoURL: info?.photoURL ?? null,
      chatId: chat.id,
      lastMessageAt: chat.lastMessageAt,
    };
    const existing = byUid.get(otherUid);
    if (!existing || candidate.lastMessageAt > existing.lastMessageAt) byUid.set(otherUid, candidate);
  }

  return Array.from(byUid.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

export interface VisibleLists {
  contacts: Contact[];
  others: SearchPerson[];
}

/**
 * What the New chat panel shows for the current query.
 * - Empty/short query: every contact, no search results.
 * - Otherwise: contacts whose display name matches OR who were found by the username search,
 *   plus search results who are not already contacts (and never the current user).
 */
export function buildVisibleLists(contacts: Contact[], query: string, results: SearchPerson[], myUid: string): VisibleLists {
  const needle = query.trim().replace(/^@/, '').toLowerCase();
  if (needle.length === 0) return { contacts, others: [] };

  const foundUids = new Set(results.map((person) => person.uid));
  const contactUids = new Set(contacts.map((contact) => contact.uid));

  return {
    contacts: contacts.filter((contact) => contact.displayName.toLowerCase().includes(needle) || foundUids.has(contact.uid)),
    others: needle.length < 2 ? [] : results.filter((person) => person.uid !== myUid && !contactUids.has(person.uid)),
  };
}