import { useEffect, useState } from 'react';
import { voice, VoiceDiag } from '../net/voice';
import { faNum } from './ui';

/**
 * پنل عیب‌یابی موقت صوت — دادهٔ زنده از getStats و وضعیت PeerConnectionها.
 * برای هر بازیکن نشان می‌دهد: دسترسی میکروفن، تراک محلی، وضعیت PC/ICE/Signaling،
 * تعداد تراک صوتی دریافتی، bytesSent/bytesReceived و آخرین خطای پخش.
 * در نسخهٔ نهایی قابل حذف است؛ استایل‌ها به‌صورت inline داخل همین فایل‌اند.
 */
export function VoiceDiagnostics() {
  const [diag, setDiag] = useState<VoiceDiag | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      voice.diagnostics().then((d) => { if (alive) setDiag(d); }).catch(() => { /* ignore */ });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!diag) return <div style={S.wrap}>در حال جمع‌آوری دادهٔ عیب‌یابی…</div>;

  const badge = (ok: boolean) => ok ? '✅' : '⚠️';

  return (
    <div style={S.wrap} dir="rtl">
      <div style={S.title}>عیب‌یابی صوت (موقت)</div>
      <div style={S.grid}>
        <span style={S.k}>دسترسی میکروفن:</span><span>{badge(diag.micPermission === 'granted')} {diag.micPermission}</span>
        <span style={S.k}>تراک میکروفن محلی:</span><span>{badge(diag.localTrackState === 'live')} {diag.localTrackState}</span>
        <span style={S.k}>سرورهای ICE:</span><span>{badge(diag.iceServersCount > 0)} {faNum(diag.iceServersCount)} عدد — STUN: {diag.hasStun ? 'دارد' : 'ندارد'} / TURN: {diag.hasTurn ? 'دارد' : 'ندارد'}</span>
        <span style={S.k}>آخرین خطای پخش:</span><span>{diag.lastAudioError ? `⛔ ${diag.lastAudioError}` : '✅ ندارد'}</span>
      </div>
      {diag.peers.length === 0 && (
        <p style={{ ...S.small, color: 'var(--muted, #9a8)' }}>
          هیچ PeerConnection فعالی نیست — اگر اعضای دیگر «ورود به گفتگوی صوتی» را زده‌اند و این پیام می‌ماند، همگام‌سازی hasVoice/سوکت مشکل دارد.
        </p>
      )}
      {diag.peers.map((p) => (
        <div key={p.id} style={S.peer}>
          <div style={S.peerHead}>هم‌بازی {p.id.slice(0, 6)}</div>
          <div style={S.grid}>
            <span style={S.k}>PeerConnection:</span><span>{badge(p.pcState === 'connected')} {p.pcState}</span>
            <span style={S.k}>ICE:</span><span>{badge(p.iceState === 'connected' || p.iceState === 'completed')} {p.iceState}</span>
            <span style={S.k}>Signaling:</span><span>{badge(p.sigState === 'stable' || p.sigState === 'have-remote-offer')} {p.sigState}</span>
            <span style={S.k}>تراک صوتی دریافتی:</span><span>{badge(p.remoteTracks > 0)} {faNum(p.remoteTracks)}</span>
            <span style={S.k}>bytesSent:</span><span>{badge(p.bytesSent > 0)} {faNum(p.bytesSent)}</span>
            <span style={S.k}>bytesReceived:</span><span>{badge(p.bytesReceived > 0)} {faNum(p.bytesReceived)}</span>
            <span style={S.k}>جفت candidate:</span><span>{p.pairType}</span>
            <span style={S.k}>candidate در صف:</span><span>{faNum(p.pendingCandidates)}</span>
            {p.lastAudioError && <><span style={S.k}>خطای پخش:</span><span>⛔ {p.lastAudioError}</span></>}
          </div>
        </div>
      ))}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    marginTop: 10, padding: 12,
    border: '1px dashed rgba(255,255,255,.25)', borderRadius: 12,
    background: 'rgba(255,255,255,.04)', fontSize: 12.5, lineHeight: 1.9
  },
  title: { fontWeight: 700, marginBottom: 8, color: '#7fd8c9' },
  grid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px' },
  k: { color: 'rgba(255,255,255,.55)' },
  small: { marginTop: 8, fontSize: 12 },
  peer: { marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.12)' },
  peerHead: { fontWeight: 700, marginBottom: 4 }
};
