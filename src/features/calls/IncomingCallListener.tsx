import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { updateCallStatus } from './callService';
import { soundService } from '../../services/soundService';

interface IncomingCall {
  id: string;
  callerName: string;
  type: 'voice' | 'video';
}

export function IncomingCallListener() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'calls'),
      where('calleeUid', '==', profile.uid),
      where('status', '==', 'ringing')
    );
    return onSnapshot(q, (snap) => {
      const first = snap.docs[0];
      if (first) {
        const data = first.data();
        setIncoming({ id: first.id, callerName: data.callerName, type: data.type });
      } else {
        setIncoming(null);
      }
    });
  }, [profile]);

  // Ring for as long as there's an incoming call card showing, stop the
  // moment it's accepted/declined/cancelled (incoming becomes null) or this
  // listener unmounts (e.g. the user navigates away/logs out).
  useEffect(() => {
    if (incoming) {
      soundService.startRingtone('incoming-call');
    } else {
      soundService.stopSound('incoming-call');
    }
    return () => soundService.stopSound('incoming-call');
  }, [incoming]);

  if (!incoming) return null;

  async function handleAccept() {
    if (!incoming) return;
    soundService.stopSound('incoming-call');
    await updateCallStatus(incoming.id, 'accepted');
    navigate(`/call/${incoming.id}?role=callee`);
    setIncoming(null);
  }

  async function handleReject() {
    if (!incoming) return;
    soundService.stopSound('incoming-call');
    await updateCallStatus(incoming.id, 'rejected');
    setIncoming(null);
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 200,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-md)',
        padding: 16,
        width: 270,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--color-brand-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            color: 'var(--color-brand-600)',
            flexShrink: 0,
          }}
        >
          {incoming.callerName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>{incoming.callerName}</div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
            {incoming.type === 'video' ? <Video size={13} strokeWidth={1.75} /> : <Phone size={13} strokeWidth={1.75} />}
            Incoming {incoming.type} call…
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="rb-btn rb-btn--primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleAccept}>
          <Phone size={15} strokeWidth={1.75} /> Accept
        </button>
        <button className="rb-btn rb-btn--outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleReject}>
          <PhoneOff size={15} strokeWidth={1.75} /> Decline
        </button>
      </div>
    </div>
  );
}
