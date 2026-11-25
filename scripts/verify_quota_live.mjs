// تأیید زندهٔ سهمیهٔ روزانه روی wrangler dev:
// ساخت لابی → ورود ۳ بازیکن با deviceId → شروع → آمادگی → بحث →
// سهمیهٔ هر بازیکن باید ۵۰ از ۶۰ شود (یک نوبت = ۱۰ ثانیه) و از QuotaDO برسد.
const BASE = process.env.SPY_BASE ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

class C {
  constructor(label) { this.label = label; this.msgs = []; this.ws = null; }
  connect(code) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}/ws?code=${code}`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('ws error'));
      ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.t === 'hello-ok') return; this.msgs.push(m); } catch { } };
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async wait(pred, ms = 5000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const m = this.msgs.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }
  me() { return this.msgs.find((m) => m.t === 'welcome')?.you?.id; }
  lastState() { return this.msgs.filter((m) => m.t === 'state').at(-1)?.state ?? null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' | ' + extra : ''}`); if (!cond) fail++; };

const create = await fetch(`${BASE}/api/lobby`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'میزبان', avatar: 0 })
}).then((r) => r.json());

const host = new C('host');
const a = new C('a');
const b = new C('b');

const run = Date.now().toString(36).slice(-6);
await host.connect(create.code);
host.send({ t: 'hello', name: 'میزبان', avatar: 0, deviceId: `d-host-${run}`, playerId: create.playerId, token: create.token });
await host.wait((m) => m.t === 'welcome');
await a.connect(create.code); a.send({ t: 'hello', name: 'بازیکن‌آ', avatar: 1, deviceId: `d-a-${run}` });
await a.wait((m) => m.t === 'welcome');
await b.connect(create.code); b.send({ t: 'hello', name: 'بازیکن‌ب', avatar: 2, deviceId: `d-b-${run}` });
await b.wait((m) => m.t === 'welcome');

ok('هر سه وارد شدند', !!(host.me() && a.me() && b.me()));

// همه ready → شروع خودکار (نخست: فاز نمایش نقش)
host.send({ t: 'ready', value: true });
a.send({ t: 'ready', value: true });
b.send({ t: 'ready', value: true });
const rev = await host.wait((m) => m.t === 'state' && m.state.phase === 'revealing', 8000);
ok('فاز نمایش نقش آغاز شد', !!rev);
// دوم: آمادگی روی پروندهٔ نقش → بحث
host.send({ t: 'ready', value: true });
a.send({ t: 'ready', value: true });
b.send({ t: 'ready', value: true });
const st = (await host.wait((m) => m.t === 'state' && m.state.phase === 'discussion', 8000))?.state;
ok('بحث شروع شد', !!st);

const spId = st.turnOrder[st.currentTurnIdx];
const spC = [host, a, b].find((c) => c.me() === spId);
const spState = spC.lastState();
ok('سهمیهٔ گویندهٔ اول ۵۰ از ۶۰ شد', spState?.quota?.remaining === 50, JSON.stringify(spState?.quota));
const others = [host, a, b].filter((c) => c !== spC);
ok('سهمیهٔ بقیه هنوز ۶۰ است', others.every((c) => c.lastState()?.quota?.remaining === 60));

// پایان نوبت اول → نوبت دوم شروع و مصرف دوم ثبت می‌شود
spC.send({ t: 'endTurn' });
await sleep(800);
const st2 = host.lastState();
ok('نوبت دوم شروع شد', st2?.phase === 'discussion');
const spId2 = st2.turnOrder[st2.currentTurnIdx];
const spC2 = [host, a, b].find((c) => c.me() === spId2);
ok('سهمیهٔ گویندهٔ دوم ۵۰ از ۶۰', spC2.lastState()?.quota?.remaining === 50, JSON.stringify(spC2.lastState()?.quota));
ok('سهمیهٔ گویندهٔ اول روی ۵۰ ماند (مصرف ثبت شد)', spC.lastState()?.quota?.remaining === 50);

console.log(fail === 0 ? '=== همهٔ تأییدهای زندهٔ سهمیه پاس شد ===' : `=== ${fail} مورد شکست ===`);
process.exit(fail === 0 ? 0 : 1);
