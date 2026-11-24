import { useEffect, useState } from 'react';
import { socket, useStore } from './net/store';
import { voice } from './net/voice';
import { TopBar } from './components/TopBar';
import { Spinner, Toast } from './components/ui';
import { Home } from './pages/Home';
import { CreateLobby, JoinLobby } from './pages/Entry';
import { Lobby } from './pages/Lobby';
import { RoleReveal } from './pages/RoleReveal';
import { GameRoom } from './pages/GameRoom';
import { Voting } from './pages/Voting';
import { Results } from './pages/Results';
import { SettingsModal } from './pages/Settings';

export default function App() {
  const screen = useStore((s) => s.screen);
  const connStatus = useStore((s) => s.connStatus);
  const connError = useStore((s) => s.connError);
  const state = useStore((s) => s.state);
  const you = useStore((s) => s.you);
  const [settings, setSettings] = useState(false);

  // اطلاع وضعیت میکروفن به سرور
  useEffect(() => {
    voice.onVoiceUpdate = (micOn) => {
      const speaking = voice.status().speaking;
      socket.send({ t: 'voice', micOn, speaking });
    };
    return () => { voice.onVoiceUpdate = null; };
  }, []);

  // پاکسازی هنگام بستن صفحه
  useEffect(() => {
    const bye = () => { try { socket.send({ t: 'leave' }); } catch { /* ignore */ } };
    window.addEventListener('beforeunload', bye);
    return () => window.removeEventListener('beforeunload', bye);
  }, []);

  if (screen === 'home') {
    return (
      <div className="app">
        <Home />
        <Toast />
      </div>
    );
  }

  if (screen === 'create') {
    return (
      <div className="app">
        <CreateLobby />
        <Toast />
      </div>
    );
  }

  if (screen === 'join') {
    return (
      <div className="app">
        <JoinLobby />
        <Toast />
      </div>
    );
  }

  // session
  if (connStatus === 'connecting') {
    return (
      <div className="app">
        <TopBar showLeave={false} />
        <Spinner label="در حال اتصال به لابی…" />
      </div>
    );
  }

  if (connStatus === 'error' && (!state || !you)) {
    return (
      <div className="app">
        <TopBar showLeave={false} />
        <div className="card conn-error">
          <h3>اتصال برقرار نشد</h3>
          <p className="muted">{connError ?? 'اتصال قطع شد.'}</p>
          <div className="row-actions">
            <button className="btn" onClick={() => {
              const st = useStore.getState();
              if (st.session) void st.connect(st.session.code);
            }}>تلاش مجدد</button>
            <button className="btn btn-ghost" onClick={() => useStore.getState().leave()}>بازگشت به خانه</button>
          </div>
        </div>
        <Toast />
      </div>
    );
  }

  if (!state || !you) {
    return (
      <div className="app">
        <TopBar showLeave={false} />
        <Spinner label="در حال دریافت وضعیت لابی…" />
        <Toast />
      </div>
    );
  }

  let page: React.ReactNode;
  switch (state.phase) {
    case 'waiting':
      page = <Lobby st={state} />;
      break;
    case 'revealing':
      page = <RoleReveal />;
      break;
    case 'discussion':
      page = <GameRoom st={state} />;
      break;
    case 'voting':
      page = <Voting />;
      break;
    case 'spyGuess':
      page = <GameRoom st={state} spyGuessMode />;
      break;
    case 'ended':
      page = <Results />;
      break;
    default:
      page = <Lobby st={state} />;
  }

  return (
    <div className="app">
      <TopBar onSettings={() => setSettings(true)} />
      {connStatus === 'reconnecting' && (
        <div className="reconnect-banner">اتصال قطع شد؛ در حال تلاش برای اتصال مجدد…</div>
      )}
      {page}
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <Toast />
    </div>
  );
}
