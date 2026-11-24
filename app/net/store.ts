import { create } from 'zustand';
import { ChatMsg, PublicState, RoleInfo, S2C, YouInfo } from '../../shared/types';
import { GameSocket } from './ws';
import { voice } from './voice';
import { sfx } from '../sounds';

export type Screen = 'home' | 'create' | 'join' | 'session';

export interface StickerEvent { id: string; from: string; name: string; key: number }

export interface Identity { name: string; avatar: number }

interface ClientStore {
  screen: Screen;
  identity: Identity | null;
  session: { code: string; playerId: string; token: string } | null;
  connStatus: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';
  connError: string | null;
  you: YouInfo | null;
  state: PublicState | null;
  role: RoleInfo | null;
  chat: ChatMsg[];
  stickers: StickerEvent[];
  toast: { message: string; kind: 'error' | 'info'; key: number } | null;
  offsetMs: number; // اختلاف ساعت سرور با کلاینت

  setScreen: (s: Screen) => void;
  setIdentity: (id: Identity) => void;
  toastNow: (message: string, kind?: 'error' | 'info') => void;
  serverNow: () => number;

  connect: (code: string) => Promise<void>;
  createAndConnect: (name: string, avatar: number) => Promise<{ code: string; playerId: string; token: string }>;
  send: (msg: Parameters<GameSocket['send']>[0]) => void;
  leave: () => void;
}

const LS_IDENTITY = 'spy:identity';
const LS_SESSIONS = 'spy:sessions';

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(LS_IDENTITY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.name === 'string' && typeof v?.avatar === 'number') return v;
  } catch { /* ignore */ }
  return null;
}

function loadSessionToken(code: string): { playerId: string; token: string } | null {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    const map = raw ? JSON.parse(raw) : {};
    const v = map[code];
    if (typeof v?.playerId === 'string' && typeof v?.token === 'string') return v;
  } catch { /* ignore */ }
  return null;
}

function saveSessionToken(code: string, playerId: string, token: string): void {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    const map = raw ? JSON.parse(raw) : {};
    map[code] = { playerId, token };
    const keys = Object.keys(map);
    if (keys.length > 5) for (const k of keys.slice(0, keys.length - 5)) delete map[k];
    localStorage.setItem(LS_SESSIONS, JSON.stringify(map));
  } catch { /* ignore */ }
}

let stickerKey = 1;

export const useStore = create<ClientStore>((set, get) => ({
  screen: 'home',
  identity: loadIdentity(),
  session: null,
  connStatus: 'idle',
  connError: null,
  you: null,
  state: null,
  role: null,
  chat: [],
  stickers: [],
  toast: null,
  offsetMs: 0,

  setScreen: (s) => set({ screen: s }),
  setIdentity: (id) => {
    try { localStorage.setItem(LS_IDENTITY, JSON.stringify(id)); } catch { /* ignore */ }
    set({ identity: id });
  },
  toastNow: (message, kind = 'error') => set({ toast: { message, kind, key: Date.now() + Math.random() } }),
  serverNow: () => Date.now() + get().offsetMs,

  connect: (code) => {
    const identity = get().identity;
    if (!identity) {
      set({ screen: 'join' });
      return Promise.resolve();
    }
    set({ connStatus: 'connecting', connError: null, chat: [], stickers: [], you: null, state: null, role: null });
    const saved = loadSessionToken(code);
    return socket.connect(code, identity, saved?.playerId, saved?.token).then(() => {
      set({ connStatus: 'open' });
    }).catch((e) => {
      set({ connStatus: 'error', connError: String((e as Error)?.message ?? e) });
      throw e;
    });
  },

  createAndConnect: async (name, avatar) => {
    const res = await fetch('/api/lobby', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, avatar })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error === 'bad_name' ? 'نام باید حداقل ۲ حرف باشد.' : 'ساخت لابی ناموفق بود.');
    }
    const data = await res.json() as { code: string; playerId: string; token: string };
    saveSessionToken(data.code, data.playerId, data.token);
    set({
      session: data,
      connStatus: 'connecting',
      chat: [], stickers: [], you: null, state: null, role: null,
      identity: { name, avatar }
    });
    try {
      await socket.connect(data.code, { name, avatar }, data.playerId, data.token);
      set({ connStatus: 'open' });
    } catch (e) {
      set({ connStatus: 'error', connError: String((e as Error)?.message ?? e) });
      throw e;
    }
    return data;
  },

  send: (msg) => socket.send(msg),

  leave: () => {
    socket.send({ t: 'leave' });
    socket.close();
    voice.leave();
    set({ screen: 'home', session: null, you: null, state: null, role: null, connStatus: 'idle', chat: [], stickers: [] });
  }
}));

/* ---------- سوکت و پیام‌ها ---------- */

export const socket = new GameSocket({
  onStatus: (status, detail) => {
    if (status === 'open') {
      useStore.setState({ connStatus: 'open', connError: null });
    } else if (status === 'reconnecting') {
      useStore.setState({ connStatus: 'reconnecting' });
    } else if (status === 'closed') {
      const s = useStore.getState();
      if (s.screen === 'session') {
        useStore.setState({ connStatus: 'error', connError: detail ?? 'اتصال قطع شد.' });
      } else {
        useStore.setState({ connStatus: 'idle' });
      }
    }
  },
  onMessage: (msg: S2C) => {
    const s = useStore.getState();
    switch (msg.t) {
      case 'welcome': {
        saveSessionToken(msg.code, msg.you.id, msg.you.token);
        useStore.setState({
          you: msg.you, state: msg.state, role: msg.role,
          offsetMs: msg.state.serverNow - Date.now(),
          screen: 'session',
          session: { code: msg.code, playerId: msg.you.id, token: msg.you.token }
        });
        sfx.play('join');
        break;
      }
      case 'state': {
        const prevPhase = s.state?.phase;
        useStore.setState({
          state: msg.state,
          offsetMs: msg.state.serverNow - Date.now()
        });
        if (prevPhase && prevPhase !== msg.state.phase) {
          if (msg.state.phase === 'discussion') sfx.play('turn');
          if (msg.state.phase === 'voting') sfx.play('alert');
          if (msg.state.phase === 'ended') {
            const iAmSpy = !!s.role?.isSpy;
            const spyWon = !!msg.state.results?.spyWon;
            sfx.play(iAmSpy === spyWon ? 'win' : 'lose');
          }
        }
        voice.syncPeers(msg.state);
        break;
      }
      case 'role': {
        useStore.setState({ role: msg.role });
        break;
      }
      case 'chat': {
        useStore.setState({ chat: [...s.chat, msg].slice(-120) });
        sfx.play('click');
        break;
      }
      case 'sticker': {
        const fromPlayer = s.state?.players.find((p) => p.id === msg.from);
        useStore.setState({
          stickers: [...s.stickers, { id: msg.id, from: msg.from, name: fromPlayer?.name ?? '', key: stickerKey++ }].slice(-6)
        });
        sfx.play('sticker');
        break;
      }
      case 'voice': {
        voice.onVoiceState(msg.playerId, msg.micOn, msg.speaking);
        break;
      }
      case 'vsig': {
        voice.handleSignal(msg.from, msg.data);
        break;
      }
      case 'error': {
        s.toastNow(msg.message);
        sfx.play('alert');
        break;
      }
      case 'kicked': {
        socket.close();
        useStore.setState({
          screen: 'home', you: null, state: null, role: null, connStatus: 'idle',
          toast: { message: 'شما از لابی حذف شدید.', kind: 'error', key: Date.now() }
        });
        break;
      }
      case 'pong': {
        break;
      }
    }
  }
});
