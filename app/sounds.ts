// افکت‌های صوتی سنتزشده با WebAudio — بدون فایل صوتی خارجی
type SfxName = 'click' | 'join' | 'leave' | 'turn' | 'sticker' | 'vote' | 'win' | 'lose' | 'alert' | 'tick';

class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;
  volume = 0.6;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  play(name: SfxName): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);

    const tone = (freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + start + dur);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(gain, t + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      osc.connect(g).connect(master);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    switch (name) {
      case 'click':
        tone(880, 0, 0.06, 'triangle', 0.15);
        break;
      case 'join':
        tone(523, 0, 0.1, 'sine', 0.2);
        tone(784, 0.09, 0.12, 'sine', 0.2);
        break;
      case 'leave':
        tone(392, 0, 0.12, 'sine', 0.18);
        tone(262, 0.1, 0.16, 'sine', 0.18);
        break;
      case 'turn':
        tone(660, 0, 0.09, 'square', 0.1);
        tone(880, 0.08, 0.1, 'square', 0.1);
        break;
      case 'sticker':
        tone(1046, 0, 0.08, 'triangle', 0.18, 1568);
        break;
      case 'vote':
        tone(740, 0, 0.07, 'sine', 0.16);
        tone(988, 0.07, 0.09, 'sine', 0.16);
        break;
      case 'alert':
        tone(622, 0, 0.1, 'square', 0.12);
        tone(622, 0.16, 0.1, 'square', 0.12);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.18, 'triangle', 0.2));
        break;
      case 'lose':
        tone(392, 0, 0.2, 'sawtooth', 0.12, 196);
        tone(330, 0.22, 0.3, 'sawtooth', 0.12, 147);
        break;
      case 'tick':
        tone(1200, 0, 0.03, 'square', 0.06);
        break;
    }
  }
}

export const sfx = new Sfx();
