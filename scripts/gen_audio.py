#!/usr/bin/env python3
# ─── تولید موسیقی و افکت‌های صوتی با سنتز خالص (بدون کتابخانه خارجی) ───
# خروجی: client/assets/audio/*.wav
# لوپ‌های تکرارشونده به‌گونه‌ای ساخته می‌شوند که در نقطه اتصال بدون پرش باشند:
# همه فرکانس‌ها ضرب‌در طول لوپ عدد صحیح می‌شوند.
import wave, struct, math, random, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
random.seed(7)

def write_wav(path, samples, sr):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.82 / peak if peak > 0.82 else 1.0
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s * scale))
            frames += struct.pack('<h', int(v * 32000))
        w.writeframes(bytes(frames))

def osc(f, t, kind='sine'):
    p = (f * t) % 1.0
    if kind == 'sine':
        return math.sin(2 * math.pi * f * t)
    if kind == 'tri':
        return 4 * abs(p - 0.5) - 1
    if kind == 'saw':
        return 2 * p - 1
    return 1.0 if p < 0.5 else -1.0

def tone(freq, dur, sr, kind='sine', vol=0.5, attack=0.01, release=0.15, harm=None, decay=None):
    n = int(dur * sr)
    out = []
    for i in range(n):
        t = i / sr
        env = 1.0
        x = i / sr
        if attack > 0 and x < attack:
            env = x / attack
        if release > 0 and x > dur - release:
            env = min(env, max(0.0, (dur - x) / release))
        if decay:
            env *= math.exp(-t / decay)
        v = osc(freq, t, kind)
        if harm:
            for mult, hv in harm.items():
                v += hv * osc(freq * mult, t, 'sine')
        out.append(v * env * vol)
    return out

def place(base, add, at, sr):
    i0 = int(at * sr)
    for i, x in enumerate(add):
        j = i0 + i
        if 0 <= j < len(base):
            base[j] += x
    return base

def mix_to(base, track, vol=1.0):
    for i, x in enumerate(track):
        if i < len(base):
            base[i] += x * vol
    return base

def noise(dur, sr, vol=0.3, lp=0.15, decay=None):
    n = int(dur * sr)
    out = []
    y = 0.0
    for i in range(n):
        t = i / sr
        env = 1.0
        if decay:
            env = math.exp(-t / decay)
        x = random.uniform(-1, 1)
        y = y + lp * (x - y)
        out.append(y * env * vol)
    return out

def sweep(f0, f1, dur, sr, vol=0.6, decay=None, kind='sine'):
    n = int(dur * sr)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / sr
        f = f0 + (f1 - f0) * (i / n)
        phase += 2 * math.pi * f / sr
        env = 1.0
        if decay:
            env = math.exp(-t / decay)
        out.append(math.sin(phase) * env * vol)
    return out

SR_M = 11025   # موسیقی
SR_S = 22050   # افکت‌ها

# فرکانس‌های سازگار با لوپ ۱۲ ثانیه‌ای (ضرب‌در ۱۲ صحیح)
A1, A2, C3, D3, E3, F2, G2, B2 = 110.0, 220.0, 132.0, 146.6667, 165.0, 88.0, 99.0, 123.75
AM = [110.0, 132.0, 165.0, 220.0]
FM = [88.0, 110.0, 132.0]
CM = [132.0, 165.0, 198.0]
GM = [99.0, 123.75, 146.6667]
H = {'tri': {'harm': {2: 0.35, 3: 0.12}}}

# ─── ۱) موسیقی منوی اصلی (۲۴ ثانیه، آهسته و مرموز) ───
def music_menu():
    L = 24
    sr = SR_M
    n = int(L * sr)
    buf = [0.0] * n
    chords = [(AM, 0, 6, 55.0), (FM, 6, 12, 44.0), (CM, 12, 18, 33.0), (GM, 18, 24, 49.5)]
    for tones, t0, t1, root in chords:
        dur = t1 - t0
        for f in tones:
            mix_to(buf, tone(f, dur + 0.001, sr, 'tri', vol=0.09, attack=1.6, release=1.6, harm={2: 0.3, 3: 0.1}), 1.0)
        mix_to(buf, tone(root, dur + 0.001, sr, 'sine', vol=0.16, attack=0.8, release=1.2))
        # آربژio ملایم روی نت‌های آکورد
        seq = tones + [tones[1] * 2]
        step = 0.5
        k = 0
        t = t0
        while t < t1 - 0.05:
            f = seq[k % len(seq)]
            mix_to(buf, tone(f, 0.5, sr, 'sine', vol=0.075, attack=0.005, release=0.2, decay=0.28), 1.0)
            k += 1
            t += step
        # زنگ درخشان آغاز هر آکورد
        mix_to(buf, tone(tones[-1] * 4, 1.6, sr, 'sine', vol=0.028, attack=0.004, release=0.8, decay=0.5), 1.0)
    write_wav(os.path.join(OUT, 'music_menu.wav'), buf, sr)

# ─── ۲) موسیقی لابی (۱۲ ثانیه، سبک‌تر و روشن‌تر) ───
def music_lobby():
    L = 12
    sr = SR_M
    n = int(L * sr)
    buf = [0.0] * n
    prog = [(AM, 110.0, 0, 4), (CM, 66.0, 4, 8), (GM, 49.5, 8, 12)]
    for tones, root, t0, t1 in prog:
        dur = t1 - t0
        for f in tones:
            mix_to(buf, tone(f, dur + 0.001, sr, 'tri', vol=0.07, attack=0.9, release=0.9, harm={2: 0.28, 3: 0.08}))
        mix_to(buf, tone(root, dur + 0.001, sr, 'sine', vol=0.13, attack=0.4, release=0.7))
        seq = [tones[0] * 2, tones[2], tones[1] * 2, tones[2]]
        step = 0.25
        k = 0
        t = t0
        while t < t1 - 0.05:
            mix_to(buf, tone(seq[k % 4], 0.24, sr, 'sine', vol=0.055, attack=0.004, release=0.12, decay=0.15))
            k += 1
            t += step
    write_wav(os.path.join(OUT, 'music_lobby.wav'), buf, sr)

# ─── ۳) استینگ شروع مسابقه ───
def music_start():
    sr = SR_S
    dur = 3.4
    n = int(dur * sr)
    buf = [0.0] * n
    mix_to(buf, noise(0.9, sr, vol=0.10, lp=0.08, decay=0.45), 1.0)
    notes = [(220.0, 0.0, 0.45), (330.0, 0.35, 0.45), (440.0, 0.7, 0.5), (660.0, 1.05, 0.5), (880.0, 1.4, 2.0)]
    for f, t0, d in notes:
        place(buf, tone(f, d, sr, 'saw', vol=0.10, attack=0.01, release=0.35, harm={2: 0.4, 3: 0.2}), t0, sr)
    for f, v in [(220.0, 0.12), (330.0, 0.10), (440.0, 0.10), (880.0, 0.06)]:
        place(buf, tone(f, 1.9, sr, 'tri', vol=v, attack=0.02, release=1.0, harm={2: 0.3}), 1.45, sr)
    place(buf, sweep(110.0, 55.0, 1.0, sr, vol=0.32, decay=0.6), 1.4, sr)
    write_wav(os.path.join(OUT, 'music_start.wav'), buf, sr)

# ─── ۴) موسیقی شب (۱۲ ثانیه، تاریک و تنش‌آلود) ───
def music_night():
    L = 12
    sr = SR_M
    n = int(L * sr)
    buf = [0.0] * n
    drone = tone(55.0, L, sr, 'saw', vol=0.14, attack=2.0, release=2.0, harm={2: 0.22, 3: 0.08})
    drone = [v * (0.75 + 0.25 * math.sin(2 * math.pi * 2 * i / sr)) for i, v in enumerate(drone)]  # ترمولو ۲هرتز
    mix_to(buf, drone, 1.0)
    mix_to(buf, tone(82.5, L, sr, 'sine', vol=0.10, attack=2.5, release=2.5), 1.0)
    for t0 in (1.2, 7.2):
        place(buf, tone(880.0, 2.8, sr, 'sine', vol=0.045, attack=0.004, release=1.4, decay=0.8), t0, sr)
        place(buf, tone(1320.0, 2.4, sr, 'sine', vol=0.025, attack=0.004, release=1.2, decay=0.7), t0 + 0.35, sr)
    # ضربان قلب دو‌ضرب
    for t0 in (0.6, 6.6):
        place(buf, sweep(66.0, 44.0, 0.16, sr, vol=0.3, decay=0.05), t0, sr)
        place(buf, sweep(60.0, 40.0, 0.14, sr, vol=0.22, decay=0.05), t0 + 0.22, sr)
    write_wav(os.path.join(OUT, 'music_night.wav'), buf, sr)

# ─── ۵) موسیقی رأی‌گیری (۱۲ ثانیه، پرتنش) ───
def music_vote():
    L = 12
    sr = SR_M
    n = int(L * sr)
    buf = [0.0] * n
    pad = tone(110.0, L, sr, 'tri', vol=0.09, attack=1.2, release=1.2, harm={2: 0.3})
    pad = [v * (0.8 + 0.2 * math.sin(2 * math.pi * 3 * i / sr)) for i, v in enumerate(pad)]
    mix_to(buf, pad, 1.0)
    mix_to(buf, tone(146.6667, L, sr, 'sine', vol=0.06, attack=1.8, release=1.8), 1.0)
    mix_to(buf, tone(220.0, L, sr, 'sine', vol=0.05, attack=2.2, release=2.2), 1.0)
    mix_to(buf, tone(55.0, L, sr, 'sine', vol=0.13, attack=1.0, release=1.5), 1.0)
    # تیک‌تاک ساعت
    for t0 in range(12):
        place(buf, tone(1980.0, 0.03, sr, 'sq', vol=0.03, attack=0.001, release=0.01), float(t0), sr)
        place(buf, tone(990.0, 0.03, sr, 'sq', vol=0.022, attack=0.001, release=0.01), t0 + 0.5, sr)
    write_wav(os.path.join(OUT, 'music_vote.wav'), buf, sr)

# ─── ۶) استینگ پایان مسابقه ───
def music_end():
    sr = SR_S
    dur = 5.0
    n = int(dur * sr)
    buf = [0.0] * n
    fan = [(440.0, 0.0, 0.5), (528.0, 0.45, 0.5), (660.0, 0.9, 0.75), (880.0, 1.55, 2.6)]
    for f, t0, d in fan:
        place(buf, tone(f, d, sr, 'tri', vol=0.12, attack=0.015, release=0.6, harm={2: 0.3}), t0, sr)
    for f, v in [(440.0, 0.10), (528.0, 0.09), (660.0, 0.09), (110.0, 0.13)]:
        place(buf, tone(f, 3.0, sr, 'sine', vol=v, attack=0.05, release=1.6), 1.55, sr)
    for t0, f in [(2.2, 1760.0), (2.7, 2200.0)]:
        place(buf, tone(f, 1.2, sr, 'sine', vol=0.03, attack=0.004, release=0.7, decay=0.45), t0, sr)
    write_wav(os.path.join(OUT, 'music_end.wav'), buf, sr)

# ─── افکت‌های صوتی ───
def sfx_join():
    sr = SR_S
    buf = [0.0] * int(0.55 * sr)
    place(buf, tone(660.0, 0.16, sr, 'sine', vol=0.3, attack=0.004, release=0.06), 0.0, sr)
    place(buf, tone(880.0, 0.22, sr, 'sine', vol=0.3, attack=0.004, release=0.1), 0.18, sr)
    place(buf, tone(1320.0, 0.2, sr, 'sine', vol=0.12, attack=0.004, release=0.1), 0.18, sr)
    write_wav(os.path.join(OUT, 'sfx_join.wav'), buf, sr)

def sfx_start():
    sr = SR_S
    buf = [0.0] * int(1.4 * sr)
    mix_to(buf, noise(0.6, sr, vol=0.16, lp=0.06, decay=0.5), 1.0)
    place(buf, sweep(60.0, 220.0, 0.5, sr, vol=0.14, decay=0.4), 0.0, sr)
    for f, v in [(220.0, 0.2), (330.0, 0.16), (440.0, 0.16), (110.0, 0.26)]:
        place(buf, tone(f, 0.9, sr, 'tri', vol=v, attack=0.008, release=0.5, harm={2: 0.3}), 0.55, sr)
    write_wav(os.path.join(OUT, 'sfx_start.wav'), buf, sr)

def sfx_eliminate():
    sr = SR_S
    buf = [0.0] * int(1.0 * sr)
    place(buf, sweep(180.0, 40.0, 0.85, sr, vol=0.5, decay=0.45), 0.0, sr)
    mix_to(buf, noise(0.25, sr, vol=0.14, lp=0.12, decay=0.1), 1.0)
    place(buf, tone(90.0, 0.7, sr, 'sine', vol=0.2, attack=0.01, release=0.4, decay=0.3), 0.12, sr)
    write_wav(os.path.join(OUT, 'sfx_eliminate.wav'), buf, sr)

def sfx_vote():
    sr = SR_S
    buf = [0.0] * int(0.3 * sr)
    place(buf, tone(1500.0, 0.05, sr, 'sine', vol=0.28, attack=0.002, release=0.03), 0.0, sr)
    place(buf, tone(1100.0, 0.1, sr, 'sine', vol=0.18, attack=0.002, release=0.06), 0.07, sr)
    write_wav(os.path.join(OUT, 'sfx_vote.wav'), buf, sr)

def sfx_end():
    sr = SR_S
    buf = [0.0] * int(1.8 * sr)
    for i, f in enumerate([440.0, 528.0, 660.0]):
        place(buf, tone(f, 0.4, sr, 'tri', vol=0.2, attack=0.01, release=0.2), i * 0.28, sr)
    place(buf, tone(880.0, 1.0, sr, 'sine', vol=0.16, attack=0.01, release=0.6), 0.95, sr)
    place(buf, tone(1760.0, 0.9, sr, 'sine', vol=0.07, attack=0.01, release=0.6), 0.95, sr)
    write_wav(os.path.join(OUT, 'sfx_end.wav'), buf, sr)

if __name__ == '__main__':
    music_menu()
    music_lobby()
    music_start()
    music_night()
    music_vote()
    music_end()
    sfx_join()
    sfx_start()
    sfx_eliminate()
    sfx_vote()
    sfx_end()
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'wrote {len(os.listdir(OUT))} audio files, total {total/1024:.0f} KB')
