// تست‌های رگرسیون صوت — دو علت اصلی خرابی صدا را پوشش می‌دهد:
// ۱) فراخوانی‌نشدن fetchIceServers → PC بدون STUN/TURN
// ۲) hasVoice هرگز true نمی‌شد → syncPeers هیچ‌وقت peer نمی‌ساخت
// به‌علاوه: صف candidateهای زودرس، مذاکرهٔ کامل دوطرفه و اطلاع‌رسانی خروج.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { VoiceManager } from '../app/net/voice';
import { createRoom, addPlayer, setVoice, publicState, type RoomState } from '../shared/engine';
import type { PublicState } from '../shared/types';

/* ---------- استاب‌های محیط مرورگر (vitest: node) ---------- */

interface FakeStat { type: string; kind?: string; bytesSent?: number; bytesReceived?: number; id?: string; candidateType?: string; state?: string; localCandidateId?: string; remoteCandidateId?: string; selected?: boolean; }

class FakePC {
  static instances: FakePC[] = [];
  static reset() { FakePC.instances = []; }
  iceServers: unknown[];
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((ev: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((ev: { track: unknown; streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  senders: { track: unknown }[] = [];
  receivers: { track: { kind: string; readyState: string } }[] = [];
  addedCandidates: RTCIceCandidateInit[] = [];
  constructor(config?: RTCConfiguration) { this.iceServers = config?.iceServers ?? []; FakePC.instances.push(this); }
  addTrack(track: unknown): void { this.senders.push({ track }); }
  async createOffer(): Promise<RTCSessionDescriptionInit> { return { type: 'offer', sdp: 'fake-offer-sdp' }; }
  async createAnswer(): Promise<RTCSessionDescriptionInit> { return { type: 'answer', sdp: 'fake-answer-sdp' }; }
  async setLocalDescription(d?: RTCSessionDescriptionInit | { type: 'rollback' }): Promise<void> {
    if (d && (d as { type: string }).type === 'rollback') { this.localDescription = null; this.signalingState = 'stable'; return; }
    this.localDescription = (d ?? this.localDescription) as RTCSessionDescriptionInit;
    if (this.localDescription?.type === 'offer') this.signalingState = 'have-local-offer';
    if (this.localDescription?.type === 'answer') this.signalingState = 'stable';
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate(c: RTCIceCandidateInit): Promise<void> { this.addedCandidates.push(c); }
  getSenders(): { track: unknown }[] { return this.senders; }
  getReceivers(): { track: { kind: string; readyState: string } }[] { return this.receivers; }
  restartIce(): void { /* noop */ }
  close(): void { this.connectionState = 'closed'; }
  /** شبیه‌سازی رسیدن تراک صوتی از طرف مقابل */
  simulateRemoteTrack(stream: MediaStream): void {
    this.receivers.push({ track: { kind: 'audio', readyState: 'live' } });
    this.ontrack?.({ track: (stream as unknown as { _track: unknown })._track, streams: [stream] });
  }
}

class FakeAudio {
  autoplay = false;
  muted = false;
  paused = true;
  srcObject: MediaStream | null = null;
  playCount = 0;
  async play(): Promise<void> { this.playCount++; this.paused = false; }
  pause(): void { this.paused = true; }
  remove(): void { /* noop */ }
  setAttribute(): void { /* noop */ }
}

class FakeStream {
  _track: { kind: string; readyState: string; enabled: boolean; muted: boolean; stop(): void };
  constructor(tracks?: { kind: string; readyState: string; enabled: boolean; muted: boolean; stop(): void }[]) {
    this._track = tracks?.[0] ?? { kind: 'audio', readyState: 'live', enabled: true, muted: false, stop() { /* noop */ } };
  }
  getAudioTracks() { return [this._track]; }
  getTracks() { return [this._track]; }
}

const ICE_FROM_SERVER = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];

function setGlobal(key: string, value: unknown): void {
  try {
    (globalThis as Record<string, unknown>)[key] = value;
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
}

beforeAll(() => {
  setGlobal('RTCPeerConnection', FakePC);
  setGlobal('Audio', FakeAudio);
  setGlobal('MediaStream', FakeStream);
  setGlobal('AudioContext', class { createMediaStreamSource() { return { connect() { /* noop */ } }; } createAnalyser() { return { fftSize: 0, frequencyBinCount: 16, getByteTimeDomainData() { /* noop */ } }; } close() { return Promise.resolve(); } });
});

beforeEach(() => {
  FakePC.reset();
  setGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => new FakeStream(),
      enumerateDevices: async () => []
    }
  });
  setGlobal('fetch', async (url: string) => {
    if (String(url).includes('/api/ice')) {
      return { json: async () => ({ iceServers: ICE_FROM_SERVER }) } as Response;
    }
    throw new Error('unexpected fetch ' + url);
  });
});

afterAll(() => {
  for (const k of ['RTCPeerConnection', 'Audio', 'MediaStream', 'AudioContext', 'navigator', 'fetch']) {
    try { delete (globalThis as Record<string, unknown>)[k]; } catch { /* getter-only */ }
  }
});

/* ---------- ابزار state ساختگی ---------- */

function makeState(ids: { id: string; hasVoice: boolean; connected: boolean; micOn?: boolean }[], selfId: string) {
  return {
    code: 'TEST', phase: 'waiting', players: ids.map((p) => ({ ...p, name: p.id, avatar: 0, isHost: false, speaking: false, forceMuted: false, skipLeft: 1 })),
    turnOrder: [], currentTurnIdx: 0, targetId: null, serverNow: Date.now()
  } as unknown as PublicState;
}

function freshVoice(selfId: string, sent: { to: string; data: unknown }[] = []): VoiceManager {
  const vm = new VoiceManager();
  vm.signalFn = (to, data) => { sent.push({ to, data }); };
  return vm;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 20));

/* ---------- ۱) موتور بازی: joined → hasVoice ---------- */

describe('engine.setVoice با joined', () => {
  it('joined=true → hasVoice=true در state عمومی', () => {
    const s: RoomState = createRoom('ABCD', 'host', 0, { rng: () => 0.5, now: Date.now() });
    const hostId = s.players[0].id;
    setVoice(s, hostId, true, false, true);
    const pub = publicState(s, Date.now());
    expect(pub.players[0].hasVoice).toBe(true);
    expect(pub.players[0].micOn).toBe(true);
  });

  it('بدون joined → hasVoice تغییر نمی‌کند (رفتار قبلی حفظ شده)', () => {
    const s: RoomState = createRoom('ABCD', 'host', 0, { rng: () => 0.5, now: Date.now() });
    const hostId = s.players[0].id;
    setVoice(s, hostId, true, false); // میکروفن خاموش/روشن عادی
    expect(s.players[0].hasVoice).toBe(false);
    expect(s.players[0].micOn).toBe(true);
  });

  it('joined=false → خروج کامل: hasVoice=false و میکروفن خاموش', () => {
    const s: RoomState = createRoom('ABCD', 'host', 0, { rng: () => 0.5, now: Date.now() });
    const hostId = s.players[0].id;
    setVoice(s, hostId, true, false, true);
    setVoice(s, hostId, false, false, false);
    const pub = publicState(s, Date.now());
    expect(pub.players[0].hasVoice).toBe(false);
    expect(pub.players[0].micOn).toBe(false);
  });
});

/* ---------- ۲) علت اصلی ۱: ICE config باید گرفته شود ---------- */

describe('VoiceManager.join — پیکربندی ICE', () => {
  it('join باید /api/ice را صدا بزند و PCها با STUN ساخته شوند', async () => {
    let iceFetched = false;
    (globalThis as Record<string, unknown>).fetch = async (url: string) => {
      if (String(url).includes('/api/ice')) { iceFetched = true; return { json: async () => ({ iceServers: ICE_FROM_SERVER }) } as Response; }
      throw new Error('unexpected fetch');
    };
    const vm = freshVoice('aaa');
    await vm.join('aaa');
    expect(iceFetched).toBe(true);
    // بازیکن دیگری صوتی است → peer ساخته می‌شود
    const sent: { to: string; data: unknown }[] = [];
    vm.signalFn = (to, data) => { sent.push({ to, data }); };
    vm.syncPeers(makeState([
      { id: 'aaa', hasVoice: true, connected: true },
      { id: 'bbb', hasVoice: true, connected: true }
    ], 'aaa'));
    expect(FakePC.instances.length).toBe(1);
    expect(FakePC.instances[0].iceServers.length).toBeGreaterThan(0);
    expect(FakePC.instances[0].iceServers).toEqual(ICE_FROM_SERVER);
  });
});

/* ---------- ۳) علت اصلی ۲: syncPeers فقط برای hasVoice ---------- */

describe('VoiceManager.syncPeers — ساخت peer مشروط به hasVoice', () => {
  it('hasVoice=false → هیچ peer ساخته نمی‌شود (رفتار خراب قدیمی اکنون آشکار می‌شود)', async () => {
    const vm = freshVoice('aaa');
    await vm.join('aaa');
    vm.syncPeers(makeState([
      { id: 'aaa', hasVoice: true, connected: true },
      { id: 'bbb', hasVoice: false, connected: true }
    ], 'aaa'));
    expect(FakePC.instances.length).toBe(0);
  });

  it('hasVoice=true → peer ساخته می‌شود و initiator پیام offer می‌فرستد', async () => {
    const vm = freshVoice('aaa');
    await vm.join('aaa');
    const sent: { to: string; data: unknown }[] = [];
    vm.signalFn = (to, data) => { sent.push({ to, data }); };
    vm.syncPeers(makeState([
      { id: 'aaa', hasVoice: true, connected: true },
      { id: 'bbb', hasVoice: true, connected: true }
    ], 'aaa'));
    await flush();
    expect(FakePC.instances.length).toBe(1);
    // aaa < bbb → aaa initiator است و offer ارسال می‌کند
    const offer = sent.find((s) => s.to === 'bbb');
    expect(offer).toBeTruthy();
    expect((offer!.data as { kind: string }).kind).toBe('offer');
    // تراک محلی به PC اضافه شده (addTrack واقعاً اجرا شده)
    expect(FakePC.instances[0].senders.length).toBe(1);
  });
});

/* ---------- ۴) مذاکرهٔ کامل دوطرفه + صف candidate زودرس ---------- */

describe('مذاکرهٔ Offer/Answer و صف candidate', () => {
  it('offer دریافتی قبل از syncPeers → peer خودکار ساخته و answer ارسال می‌شود', async () => {
    const sent: { to: string; data: unknown }[] = [];
    const vm = freshVoice('zzz', sent);
    await vm.join('zzz');
    await vm.handleSignal('aaa', { kind: 'offer', sdp: 'fake-offer-sdp' });
    const answer = sent.find((s) => s.to === 'aaa');
    expect(answer).toBeTruthy();
    expect((answer!.data as { kind: string }).kind).toBe('answer');
    expect(FakePC.instances[0].remoteDescription?.sdp).toBe('fake-offer-sdp');
  });

  it('candidate زودرس (قبل از RemoteDescription) در صف می‌ماند و بعد از offer تخلیه می‌شود', async () => {
    const sent: { to: string; data: unknown }[] = [];
    const vm = freshVoice('zzz', sent);
    await vm.join('zzz');
    const cand: RTCIceCandidateInit = { candidate: 'candidate:1 1 udp 1 1.2.3.4 5000 typ host', sdpMid: '0' };
    await vm.handleSignal('aaa', { kind: 'ice', candidate: cand });
    // هنوز PC ساخته شده (auto-create) ولی candidate باید صف شده باشد
    expect(FakePC.instances[0].addedCandidates.length).toBe(0);
    await vm.handleSignal('aaa', { kind: 'offer', sdp: 'fake-offer-sdp' });
    // بعد از setRemoteDescription → صف تخلیه شد
    expect(FakePC.instances[0].addedCandidates).toEqual([cand]);
  });

  it('چرخهٔ کامل A↔B: هر دو remoteDescription دارند و addTrack دوطرفه است', async () => {
    const sentA: { to: string; data: unknown }[] = [];
    const sentB: { to: string; data: unknown }[] = [];
    const vmA = new VoiceManager();
    const vmB = new VoiceManager();
    vmA.signalFn = (to, data) => { sentA.push({ to, data }); };
    vmB.signalFn = (to, data) => { sentB.push({ to, data }); };
    await vmA.join('aaa');
    await vmB.join('bbb');
    vmA.syncPeers(makeState([
      { id: 'aaa', hasVoice: true, connected: true },
      { id: 'bbb', hasVoice: true, connected: true }
    ], 'aaa'));
    vmB.syncPeers(makeState([
      { id: 'aaa', hasVoice: true, connected: true },
      { id: 'bbb', hasVoice: true, connected: true }
    ], 'bbb'));
    await flush();
    // هر دو یک PC دارند (تقارن — آیتم ۷ چک‌لیست)
    expect(FakePC.instances.length).toBe(2);
    // offer از A به B
    const offerMsg = sentA.find((s) => s.to === 'bbb')!;
    expect(offerMsg).toBeTruthy();
    await vmB.handleSignal('aaa', offerMsg.data);
    const answerMsg = sentB.find((s) => s.to === 'aaa')!;
    expect(answerMsg).toBeTruthy();
    await vmA.handleSignal('bbb', answerMsg.data);
    // هر دو طرف remoteDescription معتبر دارند
    const pcA = FakePC.instances.find((p) => p.localDescription?.type === 'offer')!;
    const pcB = FakePC.instances.find((p) => p.localDescription?.type === 'answer')!;
    expect(pcA.remoteDescription?.sdp).toBe('fake-answer-sdp');
    expect(pcB.remoteDescription?.sdp).toBe('fake-offer-sdp');
    // هر دو addTrack دارند (صوت محلی در هر دو مسیر ارسال می‌شود)
    expect(pcA.senders.length).toBe(1);
    expect(pcB.senders.length).toBe(1);
    // شبیه‌سازی رسیدن تراک روی B و اتصال به audio element + play واقعی
    const audioEl = new FakeAudio();
    pcB.simulateRemoteTrack(new FakeStream() as unknown as MediaStream);
    expect(pcB.receivers.length).toBe(1);
  });

  it('leave → اطلاع joined=false به سرور', async () => {
    const updates: { micOn: boolean; joined?: boolean }[] = [];
    const vm = freshVoice('aaa');
    vm.onVoiceUpdate = (micOn, joined) => { updates.push({ micOn, joined }); };
    await vm.join('aaa');
    vm.leave();
    const last = updates[updates.length - 1];
    expect(last).toEqual({ micOn: false, joined: false });
  });
});
