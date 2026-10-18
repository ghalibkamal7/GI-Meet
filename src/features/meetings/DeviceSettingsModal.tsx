import { useEffect, useState } from 'react';
import type { Room } from 'livekit-client';

export function DeviceSettingsModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMics(devices.filter((d) => d.kind === 'audioinput'));
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
    });
  }, []);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-label="Device settings" style={{ width: 340, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 14 }}>Device settings</h3>

        <label style={{ fontSize: 12, fontWeight: 600 }}>Microphone</label>
        <select className="rb-input" style={{ marginBottom: 12 }} onChange={(e) => room.switchActiveDevice('audioinput', e.target.value)}>
          {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600 }}>Camera</label>
        <select className="rb-input" style={{ marginBottom: 12 }} onChange={(e) => room.switchActiveDevice('videoinput', e.target.value)}>
          {cameras.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
        </select>

        {speakers.length > 0 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Speaker</label>
            <select className="rb-input" style={{ marginBottom: 12 }} onChange={(e) => room.switchActiveDevice('audiooutput', e.target.value)}>
              {speakers.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>)}
            </select>
          </>
        )}

        <button className="rb-btn rb-btn--primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
      </div>
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
