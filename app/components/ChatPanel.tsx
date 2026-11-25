import { FormEvent, useEffect, useRef, useState } from 'react';
import { socket, useStore } from '../net/store';
import { IconSend } from './Icons';

/** فازهایی که چت متنی قفل است — همان فازهای سمت سرور */
const CHAT_LOCKED = new Set(['discussion', 'voting', 'spyGuess']);

export function ChatPanel({ compact }: { compact?: boolean }) {
  const chat = useStore((s) => s.chat);
  const state = useStore((s) => s.state);
  const me = useStore((s) => s.you);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const locked = !!state && CHAT_LOCKED.has(state.phase);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const t = text.trim();
    if (!t) return;
    socket.send({ t: 'chat', text: t.slice(0, 200) });
    setText('');
  };

  return (
    <div className={`chat-panel ${compact ? 'compact' : ''}`}>
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <div className="muted small">گفت‌وگو همین‌جا نمایش داده می‌شود…</div>}
        {chat.map((m, i) => {
          const mine = m.from === me?.id;
          return (
            <div key={i} className={`chat-msg ${mine ? 'mine' : ''}`}>
              <span className="chat-name">{mine ? 'شما' : m.name}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          );
        })}
        {state?.results && chat.length < 3 && (
          <div className="muted small">پیام‌های قدیمی پاک می‌شوند.</div>
        )}
      </div>
      {locked ? (
        <div className="chat-locked muted small">چت متنی در طول بازی غیرفعال است؛ ارتباط فقط صوتی و در نوبت خود.</div>
      ) : (
        <form className="chat-input" onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder="پیام…"
            dir="auto"
          />
          <button type="submit" className="icon-btn primary" aria-label="ارسال" disabled={!text.trim()}>
            <IconSend />
          </button>
        </form>
      )}
    </div>
  );
}
