import { useState } from 'react';
import { useStore } from '../net/store';
import { Btn } from '../components/ui';
import { Avatar, AVATAR_NAMES } from '../data/avatars';
import { TopBar } from '../components/TopBar';

export function ProfileForm({ submitLabel, onSubmit, busy }: {
  submitLabel: string;
  onSubmit: (name: string, avatar: number) => void;
  busy?: boolean;
}) {
  const identity = useStore((s) => s.identity);
  const [name, setName] = useState(identity?.name ?? '');
  const [avatar, setAvatar] = useState(identity?.avatar ?? 0);

  return (
    <div className="profile-form">
      <div className="pf-avatar"><Avatar id={avatar} size={110} /></div>
      <input
        className="name-input"
        placeholder="نام شما در بازی"
        value={name}
        maxLength={18}
        onChange={(e) => setName(e.target.value)}
        dir="auto"
      />
      <div className="avatar-picker">
        {Array.from({ length: 12 }, (_, i) => (
          <button key={i} className={`avatar-opt ${avatar === i ? 'sel' : ''}`} onClick={() => setAvatar(i)} title={AVATAR_NAMES[i]}>
            <Avatar id={i} size={38} />
          </button>
        ))}
      </div>
      <Btn size="lg" disabled={name.trim().length < 2 || busy} onClick={() => onSubmit(name.trim(), avatar)}>
        {busy ? 'در حال اتصال…' : submitLabel}
      </Btn>
    </div>
  );
}

export function CreateLobby() {
  const setScreen = useStore((s) => s.setScreen);
  const setIdentity = useStore((s) => s.setIdentity);
  const createAndConnect = useStore((s) => s.createAndConnect);
  const [busy, setBusy] = useState(false);

  return (
    <div className="page">
      <TopBar showLeave={false} />
      <div className="card create-card">
        <h2>ساخت لابی جدید</h2>
        <ProfileForm
          submitLabel="ساخت لابی"
          busy={busy}
          onSubmit={(name, avatar) => {
            setIdentity({ name, avatar });
            setBusy(true);
            createAndConnect(name, avatar).catch(() => setBusy(false));
          }}
        />
        <button className="muted back-link" onClick={() => setScreen('home')}>بازگشت</button>
      </div>
    </div>
  );
}

export function JoinLobby() {
  const setScreen = useStore((s) => s.setScreen);
  const setIdentity = useStore((s) => s.setIdentity);
  const connect = useStore((s) => s.connect);
  const identity = useStore((s) => s.identity);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [needProfile, setNeedProfile] = useState(!identity);

  const go = async (name: string, avatar: number) => {
    setIdentity({ name, avatar });
    setBusy(true);
    try {
      await connect(code.toUpperCase());
      setNeedProfile(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar showLeave={false} />
      <div className="card create-card">
        <h2>ورود به لابی</h2>
        {!needProfile ? (
          <>
            <label className="code-label">کد لابی</label>
            <input
              className="code-input"
              placeholder="ABCD"
              value={code}
              maxLength={4}
              autoFocus
              dir="ltr"
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 4) void go(identity!.name, identity!.avatar); }}
            />
            <Btn size="lg" disabled={code.length !== 4 || busy} onClick={() => void go(identity!.name, identity!.avatar)}>
              {busy ? 'در حال ورود…' : 'ورود به لابی'}
            </Btn>
            <button className="muted back-link" onClick={() => setNeedProfile(true)}>تغییر پروفایل</button>
          </>
        ) : (
          <>
            <ProfileForm submitLabel={`ورود با کد`} busy={busy} onSubmit={(n, a) => {
              if (code.length !== 4) {
                useStore.getState().toastNow('ابتدا کد لابی را وارد کنید.');
                return;
              }
              void go(n, a);
            }} />
            <div className="join-code-inline">
              <input
                className="code-input"
                placeholder="کد لابی (مثلاً ABCD)"
                value={code}
                maxLength={4}
                dir="ltr"
                onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
              />
            </div>
            <button className="muted back-link" onClick={() => { setNeedProfile(false); }}>بازگشت به مرحلهٔ کد</button>
          </>
        )}
        <button className="muted back-link" onClick={() => setScreen('home')}>بازگشت به خانه</button>
      </div>
    </div>
  );
}
