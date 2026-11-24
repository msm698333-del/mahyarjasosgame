import { useState } from 'react';
import { Modal } from '../components/ui';
import { VoiceBar } from '../components/VoiceBar';
import { sfx } from '../sounds';
import { voice } from '../net/voice';
import { socket, useStore } from '../net/store';

/** صفحه تنظیمات صدا و بازی (مودال سراسری) */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fx, setFx] = useState(sfx.enabled);
  const [vol, setVol] = useState(Math.round(sfx.volume * 100));

  return (
    <Modal open={open} onClose={onClose} title="تنظیمات صدا و بازی">
      <div className="settings-body">
        <div className="set-row">
          <span>افکت‌های صوتی</span>
          <button className={`toggle ${fx ? 'on' : ''}`} onClick={() => { sfx.enabled = !fx; setFx(!fx); }}>
            {fx ? 'روشن' : 'خاموش'}
          </button>
        </div>
        <div className="set-row">
          <span>بلندی افکت‌ها</span>
          <input type="range" min={0} max={100} value={vol} onChange={(e) => {
            const v = Number(e.target.value);
            setVol(v);
            sfx.volume = v / 100;
          }} />
        </div>
        <div className="set-row small muted">
          صدای زندهٔ بازیکنان با WebRTC مستقیم بین مرورگرها منتقل می‌شود و روی سرور ذخیره نمی‌شود.
        </div>
        <VoiceBar showDevices />
        <div className="set-row small muted">
          وضعیت اتصال: {socket ? 'فعال' : '—'} — برای تست میکروفن، «ورود به گفتگوی صوتی» را بزنید و صحبت کنید؛ نوار سطح باید حرکت کند.
        </div>
        <button className="btn btn-ghost" onClick={() => {
          useStore.getState().leave();
          onClose();
        }}>خروج از لابی فعلی</button>
      </div>
    </Modal>
  );
}

export function VoiceDiagnostics() {
  const [log, setLog] = useState<string[]>([]);
  const add = (l: string) => setLog((x) => [...x, l]);
  return (
    <div className="card">
      <h4>عیب‌یابی صوت</h4>
      <button className="btn btn-ghost btn-sm" onClick={async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          add('میکروفن: دسترسی تأیید شد');
          add(`اتصال صوتی شما: ${voice.joined ? 'وصل' : 'قطع'}`);
        } catch (e) {
          add('میکروفن: خطا — ' + (e as Error).name);
        }
      }}>اجرای تست میکروفن</button>
      <ul className="diag-log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}
