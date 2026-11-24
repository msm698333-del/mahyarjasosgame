import { useEffect, useState } from 'react';
import { socket, useStore } from '../net/store';
import { voice, VoiceStatus } from '../net/voice';
import { IconMic, IconMicOff, IconVolume, IconVolumeOff } from './Icons';
import { VoiceDiagnostics } from './VoiceDiagnostics';

/** نوار صوت زنده: ورود/خروج، میکروفن، بی‌صداکردن دریافتی، سطح صدا، عیب‌یابی */
export function VoiceBar({ showDevices }: { showDevices?: boolean }) {
  const me = useStore((s) => s.you);
  const [vs, setVs] = useState<VoiceStatus>(voice.status());
  const [diagOpen, setDiagOpen] = useState(false);

  useEffect(() => {
    voice.signalFn = (to, data) => socket.send({ t: 'vsig', to, data });
    const un = voice.subscribe(setVs);
    return () => { un(); };
  }, []);

  if (!me) return null;

  return (
    <div className="voice-bar">
      {!vs.joined ? (
        <button
          className="btn btn-teal btn-sm"
          disabled={vs.connecting}
          onClick={() => { voice.join(me.id).catch(() => { /* خطا در status نشان داده می‌شود */ }); }}
        >
          {vs.connecting ? 'اتصال…' : 'ورود به گفتگوی صوتی'}
        </button>
      ) : (
        <>
          <button
            className={`icon-btn round ${vs.micOn ? 'primary' : 'danger'}`}
            onClick={() => voice.toggleMic()}
            title={vs.micOn ? 'خاموش کردن میکروفن' : 'روشن کردن میکروفن'}
          >
            {vs.micOn ? <IconMic /> : <IconMicOff />}
          </button>
          <button
            className={`icon-btn round ${vs.deafened ? 'danger' : ''}`}
            onClick={() => voice.toggleDeafen()}
            title={vs.deafened ? 'باصدا کردن همه' : 'بی‌صدا کردن صدای دریافتی'}
          >
            {vs.deafened ? <IconVolumeOff /> : <IconVolume />}
          </button>
          <div className="mic-meter" title="سطح صدای شما">
            <div className="mic-meter-fill" style={{ width: `${Math.min(100, vs.level * 220)}%` }} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { voice.leave(); }}>
            خروج از صوت
          </button>
          <button
            className={`btn btn-ghost btn-sm ${diagOpen ? 'diag-on' : ''}`}
            onClick={() => setDiagOpen((v) => !v)}
            title="نمایش وضعیت فنی اتصال صوت"
          >
            عیب‌یابی
          </button>
        </>
      )}
      {vs.error && <span className="voice-error">{vs.error}</span>}
      {showDevices && <DeviceSettings vs={vs} />}
      {diagOpen && <VoiceDiagnostics />}
    </div>
  );
}

function DeviceSettings({ vs }: { vs: VoiceStatus }) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((devs) => {
      setMics(devs.filter((d) => d.kind === 'audioinput'));
      setSpeakers(devs.filter((d) => d.kind === 'audiooutput'));
    }).catch(() => { /* ignore */ });
  }, [vs.joined]);

  return (
    <div className="device-settings">
      <label>
        میکروفن:
        <select
          value={vs.deviceIds.mic ?? ''}
          onChange={(e) => { void voice.setMicDevice(e.target.value); }}
        >
          <option value="">پیش‌فرض سیستم</option>
          {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'میکروفن'}</option>)}
        </select>
      </label>
      <label>
        بلندگو:
        <select
          value={vs.deviceIds.speaker ?? ''}
          onChange={(e) => { void voice.setSpeakerDevice(e.target.value); }}
        >
          <option value="">پیش‌فرض سیستم</option>
          {speakers.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'بلندگو'}</option>)}
        </select>
      </label>
    </div>
  );
}
