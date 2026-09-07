/**
 * Every sound in the app is synthesized with the Web Audio API instead of
 * shipping .mp3 assets — keeps the app self-contained and avoids licensing
 * questions around stock ringtone sounds. Swap `beep()`'s implementation
 * for real audio files later if you want a more distinctive brand sound.
 */
class SoundService {
  private ctx: AudioContext | null = null;
  private loops = new Map<string, ReturnType<typeof setInterval>>();

  private getCtx(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private beep(freq: number, duration: number, volume = 0.25, type: OscillatorType = 'sine', delay = 0) {
    try {
      const ctx = this.getCtx();
      const startAt = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    } catch {
      // Audio can legitimately fail (autoplay policy, no audio device) —
      // never let a sound failure break the calling/messaging flow itself.
    }
  }

  /** Two-tone phone-style ring, repeating until stopped. */
  startRingtone(id: string) {
    this.stopSound(id);
    const ring = () => {
      this.beep(880, 0.35, 0.28);
      this.beep(660, 0.35, 0.28, 'sine', 0.4);
    };
    ring();
    this.loops.set(id, setInterval(ring, 1800));
  }

  /** Lower, slower single-tone ringback for the caller while it's ringing on the other end. */
  startRingback(id: string) {
    this.stopSound(id);
    const ring = () => this.beep(440, 1.1, 0.18);
    ring();
    this.loops.set(id, setInterval(ring, 3000));
  }

  stopSound(id: string) {
    const interval = this.loops.get(id);
    if (interval) {
      clearInterval(interval);
      this.loops.delete(id);
    }
  }

  stopAll() {
    this.loops.forEach((interval) => clearInterval(interval));
    this.loops.clear();
  }

  playMessageChime() {
    this.beep(700, 0.12, 0.16);
    this.beep(940, 0.14, 0.16, 'sine', 0.09);
  }

  playCallConnected() {
    this.beep(523, 0.1, 0.18);
    this.beep(784, 0.16, 0.18, 'sine', 0.1);
  }

  playJoinChime() {
    this.beep(523, 0.1, 0.15);
    this.beep(784, 0.14, 0.15, 'sine', 0.08);
  }

  playLeaveChime() {
    this.beep(784, 0.1, 0.15);
    this.beep(523, 0.14, 0.15, 'sine', 0.08);
  }
}

export const soundService = new SoundService();
