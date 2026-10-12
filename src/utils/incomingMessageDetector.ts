export interface ConversationActivity {
  id: string;
  lastMessageAt: number;
  lastMessageSenderId?: string | null;
}

/**
 * Decides when a list of chats/groups should play an "incoming message" sound.
 * Create ONE detector per subscription (inside the effect) and feed it every
 * snapshot. It returns true only when an item that was ALREADY known got a
 * newer message from someone else — so:
 *   - the very first snapshot (opening the page) is silent,
 *   - a conversation that merely appears in the list is silent,
 *   - my own messages are silent,
 *   - a message with an unknown sender is silent,
 *   - the same snapshot delivered twice is silent.
 */
export function createIncomingMessageDetector(myUid: string) {
  const lastSeen = new Map<string, number>();
  let primed = false;

  return function detect(items: ConversationActivity[]): boolean {
    let shouldPlay = false;
    for (const item of items) {
      const previous = lastSeen.get(item.id);
      const fromSomeoneElse = Boolean(item.lastMessageSenderId) && item.lastMessageSenderId !== myUid;
      if (primed && previous !== undefined && item.lastMessageAt > previous && fromSomeoneElse) {
        shouldPlay = true;
      }
      lastSeen.set(item.id, Math.max(previous ?? 0, item.lastMessageAt));
    }
    primed = true;
    return shouldPlay;
  };
}