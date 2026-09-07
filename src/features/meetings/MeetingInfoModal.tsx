import type { Meeting } from './meetingTypes';

export function MeetingInfoModal({ meeting, participantCount, onClose }: { meeting: Meeting; participantCount: number; onClose: () => void }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 340, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Meeting info</h3>
        <InfoRow label="Meeting ID" value={meeting.id} mono />
        <InfoRow label="Title" value={meeting.title} />
        {meeting.description && <InfoRow label="Description" value={meeting.description} />}
        <InfoRow label="Participants" value={String(participantCount)} />
        <InfoRow label="Type" value={meeting.isAudioOnly ? 'Audio only' : 'Video'} />
        <InfoRow label="Waiting room" value={meeting.waitingRoomEnabled ? 'On' : 'Off'} />
        <InfoRow label="Password protected" value={meeting.hasPassword ? 'Yes' : 'No'} />
        <button className="rb-btn rb-btn--primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value}</div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};
