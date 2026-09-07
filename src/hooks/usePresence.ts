import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export function usePresence(uid: string | undefined) {
  const [presence, setPresence] = useState<{ isOnline: boolean; lastSeen: number | null; visible: boolean }>({
    isOnline: false,
    lastSeen: null,
    visible: true,
  });

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      const showOnline = data.privacy?.showOnlineStatus ?? true;
      const showLastSeen = data.privacy?.showLastSeen ?? true;
      setPresence({
        isOnline: showOnline ? Boolean(data.isOnline) : false,
        lastSeen: showLastSeen ? data.lastSeen?.toMillis?.() ?? null : null,
        visible: showOnline || showLastSeen,
      });
    });
  }, [uid]);

  return presence;
}
