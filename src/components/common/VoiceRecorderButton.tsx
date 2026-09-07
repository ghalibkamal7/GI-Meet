import { useRef, useState } from 'react';
import { Mic, Circle } from 'lucide-react';

interface Props {
  onRecorded: (blob: Blob, durationSeconds: number) => void;
}

export function VoiceRecorderButton({ onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const startRef = useRef<number>(0);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      recorderRef.current = recorder;
      startRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    } catch {
      // Permission denied or no mic — silently no-op, same as other mic-permission paths in this app.
    }
  }

  function stopRecording(send: boolean) {
    clearInterval(intervalRef.current);
    const recorder = recorderRef.current;
    if (!recorder) return;

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (send && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecorded(blob, Math.floor((Date.now() - startRef.current) / 1000));
      }
      setRecording(false);
    };
    recorder.stop();
  }

  if (recording) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--color-danger)', fontWeight: 600 }}>
          <Circle size={8} fill="var(--color-danger)" stroke="none" /> {seconds}s
        </span>
        <button type="button" className="rb-btn rb-btn--outline" style={{ padding: '6px 10px' }} onClick={() => stopRecording(false)}>
          Cancel
        </button>
        <button type="button" className="rb-btn rb-btn--primary" style={{ padding: '6px 10px' }} onClick={() => stopRecording(true)}>
          Send
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      aria-label="Record voice message"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        borderRadius: 8,
      }}
    >
      <Mic size={19} strokeWidth={1.75} />
    </button>
  );
}
