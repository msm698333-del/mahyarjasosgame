// VoiceManager — صدای زندهٔ Mesh P2P با WebRTC
// سیگنالینگ از طریق WebSocket لابی (فقط بین اعضای همان لابی) و مسیر صوت مستقیم بین مرورگرها.
// هیچ صدایی روی سرور ذخیره یا پردازش نمی‌شود.

import { PublicState } from '../../shared/types';

interface PeerInfo {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  stream: MediaStream | null;
  speaking: boolean;
  micOn: boolean;
  userMuted: boolean;
  polite: boolean; // طرف مقابل initiator است
  pendingCandidates: RTCIceCandidateInit[];
  pendingOffer: RTCSessionDescriptionInit | null;
}

interface VoiceStatus {
  joined: boolean;
  micOn: boolean;
  deafened: boolean;
  speaking: boolean;
  connecting: boolean;
  error: string | null;
  deviceIds: { mic: string | null; speaker: string | null };
  level: number; // سطح میکروفن خودم ۰..۱
  peerSpeaking: Record<string, boolean>;
  peerMicOn: Record<string, boolean>;
  peerConnected: Record<string, boolean>;
}

const ICE_CACHE_TTL = 5 * 60 * 1000;
let iceCache: { at: number; servers: RTCIceServer[] } | null = null;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < ICE_CACHE_TTL) return iceCache.servers;
  try {
    const res = await fetch('/api/ice');
    const j = await res.json();
    const servers = Array.isArray(j?.iceServers) ? j.iceServers : [];
    iceCache = { at: Date.now(), servers };
    return servers;
  } catch {
    return [{ urls: 'stun:stun.cloudflare.com:3478' }];
  }
}

class VoiceManager {
  joined = false;
  connecting = false;
  micOn = false;
  deafened = false;
  speaking = false;
  error: string | null = null;
  level = 0;
  micDeviceId: string | null = null;
  speakerDeviceId: string | null = null;

  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerInfo>();
  private selfId = '';
  private ctx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private raf = 0;
  private listeners = new Set<(s: VoiceStatus) => void>();
  private lastSpeakSent = 0;

  subscribe(fn: (s: VoiceStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): VoiceStatus {
    const peerSpeaking: Record<string, boolean> = {};
    const peerMicOn: Record<string, boolean> = {};
    const peerConnected: Record<string, boolean> = {};
    for (const [id, p] of this.peers) {
      peerSpeaking[id] = p.speaking && !p.userMuted && !this.deafened;
      peerMicOn[id] = p.micOn;
      peerConnected[id] = p.pc.connectionState === 'connected';
    }
    return {
      joined: this.joined,
      micOn: this.micOn,
      deafened: this.deafened,
      speaking: this.speaking,
      connecting: this.connecting,
      error: this.error,
      deviceIds: { mic: this.micDeviceId, speaker: this.speakerDeviceId },
      level: this.level,
      peerSpeaking, peerMicOn, peerConnected
    };
  }

  private emit(): void {
    const s = this.status();
    for (const fn of this.listeners) fn(s);
  }

  /** ورود به گفتگوی صوتی — نیاز به gesture کاربر */
  async join(selfId: string): Promise<void> {
    if (this.joined || this.connecting) return;
    this.connecting = true;
    this.error = null;
    this.emit();
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.micDeviceId ? { exact: this.micDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      this.selfId = selfId;
      this.joined = true;
      this.micOn = true;
      this.setupLocalAnalyser();
      this.emit();
      // اطلاع به سرور برای هماهنگی لیست voice
      this.onVoiceUpdate?.(true);
    } catch (e) {
      this.error = micErrorText(e);
      this.joined = false;
      this.emit();
      throw e;
    } finally {
      this.connecting = false;
      this.emit();
    }
  }

  onVoiceUpdate: ((micOn: boolean) => void) | null = null;

  leave(): void {
    for (const [, p] of this.peers) this.teardownPeer(p);
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx?.close().catch(() => { /* ignore */ });
    this.ctx = null;
    this.localAnalyser = null;
    this.joined = false;
    this.micOn = false;
    this.speaking = false;
    this.level = 0;
    this.emit();
  }

  toggleMic(): boolean {
    this.micOn = !this.micOn;
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = this.micOn; });
    this.emit();
    this.onVoiceUpdate?.(this.micOn);
    return this.micOn;
  }

  toggleDeafen(): boolean {
    this.deafened = !this.deafened;
    for (const [, p] of this.peers) {
      p.audio.muted = this.deafened || p.userMuted;
    }
    this.emit();
    return this.deafened;
  }

  setPeerMuted(peerId: string, muted: boolean): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    p.userMuted = muted;
    p.audio.muted = muted || this.deafened;
    this.emit();
  }

  isPeerMuted(peerId: string): boolean {
    return this.peers.get(peerId)?.userMuted ?? false;
  }

  async setMicDevice(deviceId: string): Promise<void> {
    this.micDeviceId = deviceId;
    if (!this.joined) { this.emit(); return; }
    const old = this.localStream;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      this.localStream = s;
      const track = s.getAudioTracks()[0];
      track.enabled = this.micOn;
      for (const [, p] of this.peers) {
        const sender = p.pc.getSenders().find((x) => x.track?.kind === 'audio');
        await sender?.replaceTrack(track);
      }
      old?.getTracks().forEach((t) => t.stop());
      this.setupLocalAnalyser();
      this.emit();
    } catch (e) {
      this.error = micErrorText(e);
      this.emit();
    }
  }

  async setSpeakerDevice(deviceId: string): Promise<void> {
    this.speakerDeviceId = deviceId;
    for (const [, p] of this.peers) {
      const anyEl = p.audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof anyEl.setSinkId === 'function') {
        try { await anyEl.setSinkId(deviceId); } catch { /* پشتیبانی نمی‌شود */ }
      }
    }
    this.emit();
  }

  /** هماهنگی peerها با state سرور */
  syncPeers(state: PublicState): void {
    if (!this.joined) return;
    const me = state.players.find((p) => p.id === this.selfId);
    if (!me || !me.connected) return;
    const inVoice = new Set(
      state.players.filter((p) => p.hasVoice && p.connected && p.id !== this.selfId).map((p) => p.id)
    );
    // حذف خارج‌شده‌ها
    for (const [id, p] of [...this.peers]) {
      if (!inVoice.has(id)) {
        this.teardownPeer(p);
        this.peers.delete(id);
      }
    }
    // ساخت جدیدها
    for (const id of inVoice) {
      if (!this.peers.has(id)) this.createPeer(id);
    }
    this.emit();
  }

  private createPeer(peerId: string): void {
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    const pc = new RTCPeerConnection({ iceServers: iceCache?.servers ?? [] });
    const info: PeerInfo = {
      pc, audio, analyser: null, stream: null,
      speaking: false, micOn: false, userMuted: false,
      polite: true, pendingCandidates: [], pendingOffer: null
    };
    this.peers.set(peerId, info);

    // initiator = شناسهٔ کوچکتر؛ قطعیت در جلوگیری از offer متقابل
    const initiator = this.selfId < peerId;
    info.polite = !initiator;

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signal(peerId, { kind: 'ice', candidate: ev.candidate.toJSON() });
      }
    };

    pc.ontrack = (ev) => {
      info.stream = ev.streams[0] ?? new MediaStream([ev.track]);
      audio.srcObject = info.stream;
      audio.muted = info.userMuted || this.deafened;
      audio.play().catch(() => { /* gesture لازم است؛ کاربر با دکمهٔ صوت وارد شده */ });
      this.setupRemoteAnalyser(peerId, info);
      this.emit();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        pc.restartIce?.();
        if (initiator) {
          pc.createOffer({ iceRestart: true }).then((offer) => {
            pc.setLocalDescription(offer);
            this.signal(peerId, { kind: 'offer', sdp: offer.sdp });
          }).catch(() => { /* ignore */ });
        }
      }
      this.emit();
    };

    if (initiator) {
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).then(() => {
        this.signal(peerId, { kind: 'offer', sdp: pc.localDescription?.sdp });
      }).catch(() => { /* ignore */ });
    }
  }

  private setupLocalAnalyser(): void {
    if (!this.localStream) return;
    try {
      this.ctx = this.ctx ?? new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.localStream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this.localAnalyser = analyser;
      this.startLevelLoop();
    } catch { /* ignore */ }
  }

  private setupRemoteAnalyser(peerId: string, info: PeerInfo): void {
    if (!info.stream || !this.ctx) return;
    try {
      const src = this.ctx.createMediaStreamSource(info.stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      info.analyser = analyser;
    } catch { /* ignore */ }
  }

  private startLevelLoop(): void {
    if (this.raf) return;
    let last = 0;
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      if (ts - last < 100) return; // ۱۰ بار در ثانیه
      last = ts;
      const prevSpeaking = this.speaking;
      this.level = this.readLevel(this.localAnalyser, this.micOn);
      if (this.level > 0.09) this.speaking = true;
      else if (this.level < 0.05) this.speaking = false;
      let changed = this.speaking !== prevSpeaking;
      for (const [id, p] of this.peers) {
        const prev = p.speaking;
        const audible = !p.userMuted && !this.deafened && p.micOn;
        p.speaking = audible && this.readLevel(p.analyser, true) > 0.09;
        if (p.speaking !== prev) changed = true;
      }
      if (this.speaking !== prevSpeaking && Date.now() - this.lastSpeakSent > 250) {
        this.lastSpeakSent = Date.now();
        this.onVoiceUpdate?.(this.micOn);
      }
      if (changed) this.emit();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private readLevel(analyser: AnalyserNode | null, on: boolean): number {
    if (!analyser || !on) return 0;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  /** وضعیت صدا از سرور (micOn/speaking دیگران) */
  onVoiceState(playerId: string, micOn: boolean, _speaking: boolean): void {
    const p = this.peers.get(playerId);
    if (!p) return;
    p.micOn = micOn;
    this.emit();
  }

  /** سیگنالینگ ورودی */
  async handleSignal(from: string, data: unknown): Promise<void> {
    const info = this.peers.get(from);
    if (!info) {
      // همتا هنوز نیست؛ اگر join هستیم بساز
      if (this.joined) this.createPeer(from);
      const p2 = this.peers.get(from);
      if (!p2) return;
      return this.handleSignal(from, data);
    }
    const d = data as { kind: 'offer' | 'answer' | 'ice'; sdp?: string; candidate?: RTCIceCandidateInit };
    try {
      if (d.kind === 'offer') {
        if (info.pc.signalingState !== 'stable' && info.polite) {
          // تلاش هم‌زمان: طرف مودب عقب می‌نشیند
          await info.pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        }
        await info.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        for (const c of info.pendingCandidates) await info.pc.addIceCandidate(c).catch(() => { /* ignore */ });
        info.pendingCandidates = [];
        const answer = await info.pc.createAnswer();
        await info.pc.setLocalDescription(answer);
        this.signal(from, { kind: 'answer', sdp: answer.sdp });
      } else if (d.kind === 'answer') {
        if (info.pc.signalingState === 'have-local-offer') {
          await info.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
          for (const c of info.pendingCandidates) await info.pc.addIceCandidate(c).catch(() => { /* ignore */ });
          info.pendingCandidates = [];
        }
      } else if (d.kind === 'ice' && d.candidate) {
        if (!info.pc.remoteDescription) info.pendingCandidates.push(d.candidate);
        else await info.pc.addIceCandidate(d.candidate).catch(() => { /* ignore */ });
      }
    } catch {
      // خطای سیگنالینگ → restart در connectionstatechange انجام می‌شود
    }
  }

  private signal(peerId: string, data: unknown): void {
    this.signalFn?.(peerId, data);
  }

  signalFn: ((to: string, data: unknown) => void) | null = null;

  private teardownPeer(p: PeerInfo): void {
    try {
      p.pc.ontrack = null;
      p.pc.onicecandidate = null;
      p.pc.close();
    } catch { /* ignore */ }
    p.audio.pause();
    p.audio.srcObject = null;
    p.audio.remove();
  }
}

function micErrorText(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError') return 'دسترسی میکروفن داده نشد. از تنظیمات مرورگر اجازه دهید.';
  if (name === 'NotFoundError') return 'میکروفنی پیدا نشد.';
  if (name === 'NotReadableError') return 'میکروفن توسط برنامهٔ دیگری اشغال است.';
  return 'خطا در دسترسی به میکروفن.';
}

export const voice = new VoiceManager();
export type { VoiceStatus };
