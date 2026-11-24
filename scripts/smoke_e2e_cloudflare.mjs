// تست دود E2E روی سرور واقعی Cloudflare (wrangler dev):
// ساخت لابی → ورود دو بازیکن → شروع → نقش خصوصی → آماده‌سازی → نوبت/رد کردن → چت/استیکر → سیگنالینگ صوت → اتصال مجدد → اخراج
// اجرا: node scripts/smoke_e2e_cloudflare.mjs  (پیش‌فرض 127.0.0.1:8787؛ با SPY_BASE تغییر دهید)

const BASE = process.env.SPY_BASE ?? 'http://127.0.0.1:8787';
const results = [];
let failures = 0;

function ok(name, cond, extra = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) failures++;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

class TestClient {
  constructor(label) { this.label = label; this.msgs = []; this.ws = null; }
  connect(code) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${BASE.replace('http','ws')}/ws?code=${code}`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('ws error'));
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.t === 'hello-ok') return;
          this.msgs.push(m);
        } catch { /* ignore */ }
      };
      ws.onclose = (ev) => { this.closeCode = ev.code; };
    });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  async wait(pred, ms = 4000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const m = this.msgs.find(pred);
      if (m) return m;
      await sleep(50);
    }
    return null;
  }
  clear() { this.msgs = []; }
}

const host = new TestClient('host');
const p2 = new TestClient('p2');
const p3 = new TestClient('p3');

async function main() {
  // ۱) ساخت لابی REST
  const res = await fetch(`${BASE}/api/lobby`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'میزبان‌تست', avatar: 3 })
  });
  ok('ساخت لابی REST', res.status === 200);
  const { code, playerId, token } = await res.json();
  ok('کد ۴ حرفی', /^[A-Z0-9]{4}$/.test(code), code);
  ok('token صادر شد', typeof token === 'string' && token.length > 10);

  // ۲) اتصال میزبان با token
  await host.connect(code);
  host.send({ t: 'hello', name: 'میزبان‌تست', avatar: 3, playerId, token });
  const w = await host.wait((m) => m.t === 'welcome');
  ok('welcome میزبان', !!w);
  ok('میزبان isHost', w?.you.isHost === true);

  // ۳) ورود دو بازیکن
  await p2.connect(code);
  p2.send({ t: 'hello', name: 'دوم', avatar: 5 });
  const w2 = await p2.wait((m) => m.t === 'welcome');
  ok('welcome بازیکن دوم', !!w2);
  await p3.connect(code);
  p3.send({ t: 'hello', name: 'سوم', avatar: 7 });
  const w3 = await p3.wait((m) => m.t === 'welcome');
  ok('welcome بازیکن سوم', !!w3);
  ok('state اولیه ۳ بازیکن', w3?.state.players.length === 3);

  // ۴) شروع غیرمجاز توسط غیرمیزبان
  p2.send({ t: 'start' });
  const err = await p2.wait((m) => m.t === 'error' && m.code === 'not_host');
  ok('شروع توسط غیرمیزبان رد شد', !!err);

  // ۵) شروع توسط میزبان + نقش خصوصی
  host.clear(); p2.clear(); p3.clear();
  host.send({ t: 'start' });
  const stStarted = await p2.wait((m) => m.t === 'state' && m.state.phase === 'revealing');
  ok('فاز revealing پخش شد', !!stStarted);
  // نقش فقط از پیام خصوصی role می‌آید؛ state عمومی هرگز مکان/نقش ندارد
  const stateStr = JSON.stringify(host.msgs.filter((m) => m.t === 'state'));
  ok('state عمومی شامل اسم مکان نیست', !stateStr.includes('"locationName"') && !stateStr.includes('"isSpy"'));
  ok('state عمومی توکن ندارد', !stateStr.includes(token));
  const roleMsg = host.msgs.find((m) => m.t === 'role');
  ok('پیام خصوصی نقش به صاحبش رسید', !!roleMsg && (roleMsg.role.isSpy === true || !!roleMsg.role.roleName));

  // ۶) آماده شدن همه → discussion
  host.send({ t: 'ready' });
  p2.send({ t: 'ready' });
  p3.send({ t: 'ready' });
  const stDisc = await p3.wait((m) => m.t === 'state' && m.state.phase === 'discussion', 6000);
  ok('فاز discussion آغاز شد', !!stDisc);
  ok('نوبت اول تعیین شد', stDisc?.state.currentTurnIdx === 0 && stDisc.state.turnOrder.length === 3);

  // ۷) نوبت‌دار skip می‌زند
  const idMap = { [w.you.id]: host, [w2.you.id]: p2, [w3.you.id]: p3 };
  const turn1 = stDisc.state.turnOrder[0];
  const speakerClient = idMap[turn1];
  speakerClient.clear();
  speakerClient.send({ t: 'skipTurn' });
  const stSkip = await p3.wait((m) => m.t === 'state' && m.state.currentTurnIdx === 1);
  ok('Skip Turn نوبت را جلو برد', !!stSkip);

  // رد کردن توسط غیرنوبت‌دار (نوبت‌دار فعلی = turnOrder[1])
  const sp2Id = stSkip.state.turnOrder[stSkip.state.currentTurnIdx];
  const notSpeaker = [host, p2, p3].find((c) => c !== idMap[sp2Id]);
  notSpeaker.send({ t: 'skipTurn' });
  const errTurn = await notSpeaker.wait((m) => m.t === 'error' && m.code === 'not_your_turn', 1500);
  ok('Skip توسط غیرنوبت‌دار رد شد', !!errTurn);

  // ۸) انتخاب هدف توسط نوبت‌دار فعلی
  const sp2Client = idMap[sp2Id];
  const otherId = [w.you.id, w2.you.id, w3.you.id].find((id) => id !== sp2Id);
  sp2Client.send({ t: 'target', targetId: otherId });
  const stTarget = await p3.wait((m) => m.t === 'state' && m.state.targetId === otherId);
  ok('انتخاب هدف پرسش', !!stTarget);

  // ۹) چت و استیکر
  host.send({ t: 'chat', text: 'سلام همه' });
  const chat = await p2.wait((m) => m.t === 'chat' && m.text === 'سلام همه');
  ok('چت broadcast شد', !!chat);
  p2.send({ t: 'sticker', id: 'magnifier' });
  const sticker = await host.wait((m) => m.t === 'sticker' && m.id === 'magnifier');
  ok('استیکر broadcast شد', !!sticker);
  p2.send({ t: 'sticker', id: 'magnifier' });
  const spammed = await p2.wait((m) => m.t === 'error' && m.code === 'rate_limit');
  ok('اسپم استیکر محدود شد', !!spammed);

  // ۱۰) رله سیگنالینگ WebRTC فقط به مقصد
  p2.send({ t: 'vsig', to: w3.you.id, data: { kind: 'offer', sdp: 'test-sdp' } });
  const sig = await p3.wait((m) => m.t === 'vsig' && m.from === w2.you.id);
  ok('vsig به مقصد رسید', !!sig);
  host.clear();
  const sigLeak = await host.wait((m) => m.t === 'vsig', 700);
  ok('vsig به بقیه نشت نکرد', !sigLeak);

  // ۱۱) وضعیت صدا
  p2.send({ t: 'voice', micOn: true, speaking: false });
  const voiceState = await p3.wait((m) => m.t === 'state' && m.state.players.find((x) => x.id === w2.you.id)?.micOn === true);
  ok('وضعیت میکروفن همگام شد', !!voiceState);

  // ۱۲) اتصال مجدد p3 با token
  p3.ws.close();
  await sleep(400);
  const p3b = new TestClient('p3b');
  await p3b.connect(code);
  p3b.send({ t: 'hello', name: 'سوم', avatar: 7, playerId: w3.you.id, token: w3.you.token });
  const wb = await p3b.wait((m) => m.t === 'welcome');
  ok('اتصال مجدد با token موفق', !!wb);
  const reconnected = await p3b.wait((m) => m.t === 'state' && m.state.players.find((x) => x.id === w3.you.id)?.connected === true);
  ok('بازیکن وصل‌شده connected=true', !!reconnected);

  // ۱۳) گزارش و اخراج
  host.send({ t: 'report', targetId: w2.you.id });
  const repState = await host.wait((m) => m.t === 'state' && m.state.hostView?.reports[w2.you.id] === 1);
  ok('گزارش فقط برای میزبان', !!repState);
  host.send({ t: 'kick', targetId: w2.you.id });
  const kickState = await p3b.wait((m) => m.t === 'state' && !m.state.players.find((x) => x.id === w2.you.id));
  ok('اخراج توسط میزبان', !!kickState);

  // ۱۴) ورود بعد از شروع بازی رد می‌شود
  const p4 = new TestClient('p4');
  await p4.connect(code);
  p4.send({ t: 'hello', name: 'چهارم', avatar: 1 });
  const errStarted = await p4.wait((m) => m.t === 'error' && m.code === 'game_started');
  ok('ورود بعد از شروع رد شد', !!errStarted);

  // ۱۵) کد نامعتبر
  const bad = new TestClient('bad');
  try {
    await bad.connect('ZZZZ');
    bad.send({ t: 'hello', name: 'تست', avatar: 0 });
    const nf = await bad.wait((m) => m.t === 'error');
    ok('لابی ناموجود → خطا', !!nf, nf?.code);
    bad.ws.close();
  } catch {
    ok('لابی ناموجود → خطا', true, 'close');
  }

  host.ws.close(); p2.ws.close(); p3b.ws.close(); p4.ws.close();

  console.log('='.repeat(60));
  console.log('نتایج تست دود E2E (سرور واقعی wrangler dev):');
  console.log('='.repeat(60));
  for (const r of results) console.log(r);
  console.log('='.repeat(60));
  console.log(`${failures === 0 ? 'همهٔ تست‌ها پاس شدند' : failures + ' تست شکست خورد'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای تست:', e); process.exit(1); });
