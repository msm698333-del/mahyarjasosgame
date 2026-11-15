# ─── تولید ۱۲ استیکر SVG — تصویری، خنثی و طنز ───
# بدون معنای جاسوسی/افشای نقش/راهنمای استراتژیک و بدون متن؛ فقط تصویر.
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'assets', 'stickers')
os.makedirs(OUT, exist_ok=True)

INK = '#1a1030'

def wrap(inner):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">{inner}</svg>'

def face(face_color, cx=60, cy=62, r=34):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{face_color}" stroke="{INK}" stroke-width="4"/>'

def zzz():
    return ('<path d="M84,26 L98,26 L84,40 L98,40" fill="none" stroke="#7dd3fc" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>'
            '<path d="M98,44 L108,44 L98,54 L108,54" fill="none" stroke="#7dd3fc" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>')

STICKERS = {}

# s01 خنده
STICKERS['s01'] = wrap(
    face('#ffd93d')
    + '<path d="M44,54 Q50,46 56,54 M64,54 Q70,46 76,54" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M42,66 Q60,92 78,66 Q60,74 42,66 Z" fill="' + INK + '"/>'
    + '<path d="M46,68 L52,68 L49,73 Z M68,68 L74,68 L71,73 Z" fill="#fff"/>'
)

# s02 خنده با اشک
STICKERS['s02'] = wrap(
    face('#ffd93d')
    + '<path d="M42,52 Q48,44 54,52 M66,52 Q72,44 78,52" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M44,64 Q60,86 76,64 Q60,72 44,64 Z" fill="' + INK + '"/>'
    + '<path d="M36,58 Q30,70 36,76 Q42,70 36,58 Z" fill="#38bdf8" stroke="' + INK + '" stroke-width="2.5"/>'
    + '<path d="M84,58 Q90,70 84,76 Q78,70 84,58 Z" fill="#38bdf8" stroke="' + INK + '" stroke-width="2.5"/>'
)

# s03 شوکه
STICKERS['s03'] = wrap(
    face('#ffb84d')
    + '<circle cx="48" cy="50" r="7" fill="#fff" stroke="' + INK + '" stroke-width="3"/><circle cx="48" cy="51" r="3" fill="' + INK + '"/>'
    + '<circle cx="72" cy="50" r="7" fill="#fff" stroke="' + INK + '" stroke-width="3"/><circle cx="72" cy="51" r="3" fill="' + INK + '"/>'
    + '<ellipse cx="60" cy="72" rx="9" ry="11" fill="' + INK + '"/>'
    + '<path d="M28,34 Q22,26 26,20 M92,34 Q98,26 94,20" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
)

# s04 خفن (عینک آفتابی)
STICKERS['s04'] = wrap(
    face('#a78bfa')
    + '<rect x="38" y="44" width="18" height="12" rx="5" fill="' + INK + '"/><rect x="64" y="44" width="18" height="12" rx="5" fill="' + INK + '"/>'
    + '<path d="M56,48 L64,48 M38,47 L30,50 M82,47 L90,50" stroke="' + INK + '" stroke-width="3.5" fill="none"/>'
    + '<path d="M44,72 Q56,80 76,68" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
)

# s05 خسته
STICKERS['s05'] = wrap(
    face('#8fb3ff')
    + '<path d="M44,52 Q50,58 56,52 M64,52 Q70,58 76,52" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<ellipse cx="60" cy="72" rx="8" ry="6" fill="' + INK + '"/>'
    + zzz()
)

# s06 پاپ‌کورن
STICKERS['s06'] = wrap(
    '<path d="M40,52 L80,52 L74,100 L46,100 Z" fill="#e11d48" stroke="' + INK + '" stroke-width="4"/>'
    + '<path d="M50,52 L54,100 M70,52 L66,100" stroke="#fff" stroke-width="5" opacity="0.85"/>'
    + '<circle cx="44" cy="46" r="9" fill="#fff7cf" stroke="' + INK + '" stroke-width="3"/>'
    + '<circle cx="60" cy="40" r="10" fill="#fff7cf" stroke="' + INK + '" stroke-width="3"/>'
    + '<circle cx="76" cy="46" r="9" fill="#fff7cf" stroke="' + INK + '" stroke-width="3"/>'
    + '<circle cx="52" cy="36" r="7" fill="#fff7cf" stroke="' + INK + '" stroke-width="3"/>'
    + '<circle cx="69" cy="35" r="7" fill="#fff7cf" stroke="' + INK + '" stroke-width="3"/>'
)

# s07 قهوه
STICKERS['s07'] = wrap(
    '<path d="M34,50 L82,50 L78,88 Q76,96 66,96 L50,96 Q40,96 38,88 Z" fill="#fff" stroke="' + INK + '" stroke-width="4"/>'
    + '<path d="M82,56 Q98,56 96,68 Q94,80 76,78" fill="none" stroke="' + INK + '" stroke-width="4"/>'
    + '<ellipse cx="58" cy="56" rx="18" ry="4.5" fill="#6b3f1d"/>'
    + '<path d="M48,38 Q46,30 52,26 M62,36 Q60,28 66,24" fill="none" stroke="#c9c2b8" stroke-width="4" stroke-linecap="round"/>'
)

# s08 فکر می‌کنم
STICKERS['s08'] = wrap(
    face('#6ee7b7')
    + '<circle cx="48" cy="50" r="4.5" fill="' + INK + '"/><circle cx="72" cy="50" r="4.5" fill="' + INK + '"/>'
    + '<path d="M50,70 Q60,64 70,70" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<circle cx="88" cy="28" r="7" fill="none" stroke="#c9c2b8" stroke-width="3"/>'
    + '<circle cx="100" cy="14" r="10" fill="#f5c542" stroke="' + INK + '" stroke-width="3"/>'
    + '<path d="M84,52 L90,48" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>'
)

# s09 عصبانی
STICKERS['s09'] = wrap(
    face('#fb7185')
    + '<path d="M40,44 L54,50 M80,44 L66,50" stroke="' + INK + '" stroke-width="4.5" stroke-linecap="round"/>'
    + '<circle cx="48" cy="56" r="3.5" fill="' + INK + '"/><circle cx="72" cy="56" r="3.5" fill="' + INK + '"/>'
    + '<path d="M48,76 Q60,68 72,76" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M30,26 Q24,18 30,12 M90,26 Q96,18 90,12" fill="none" stroke="#f87171" stroke-width="4" stroke-linecap="round"/>'
)

# s10 آفرین (ستاره‌ها)
STICKERS['s10'] = wrap(
    face('#fbbf24')
    + '<path d="M44,52 Q50,46 56,52 M64,52 Q70,46 76,52" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M48,70 Q60,80 72,70" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M24,24 L28,32 L36,34 L28,38 L26,46 L20,40 L12,42 L16,34 L12,28 L20,28 Z" fill="#f5c542" stroke="' + INK + '" stroke-width="2.5"/>'
    + '<path d="M96,44 L99,50 L105,52 L99,54 L97,60 L93,56 L87,58 L90,52 L87,48 L93,48 Z" fill="#a78bfa" stroke="' + INK + '" stroke-width="2"/>'
)

# s11 دلشوره (عرق)
STICKERS['s11'] = wrap(
    face('#a3e635')
    + '<path d="M42,50 Q47,45 52,50 M68,50 Q73,45 78,50" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M48,72 Q54,68 60,72 Q66,76 72,72" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M92,44 Q98,54 92,60 Q86,54 92,44 Z" fill="#38bdf8" stroke="' + INK + '" stroke-width="2.5"/>'
)

# s12 چای ایرانی (استکان)
STICKERS['s12'] = wrap(
    '<path d="M40,34 L80,34 L76,88 Q60,96 44,88 Z" fill="#fff" stroke="' + INK + '" stroke-width="4"/>'
    + '<path d="M44,44 L76,44 L73,80 Q60,86 47,80 Z" fill="#b45309"/>'
    + '<ellipse cx="60" cy="46" rx="13" ry="3" fill="#e39a3b"/>'
    + '<rect x="50" y="92" width="8" height="10" rx="2" fill="#f5c542" stroke="' + INK + '" stroke-width="2.5"/>'
    + '<rect x="62" y="92" width="8" height="10" rx="2" fill="#f5c542" stroke="' + INK + '" stroke-width="2.5"/>'
    + '<path d="M48,24 Q46,16 52,12 M66,22 Q64,14 70,10" fill="none" stroke="#c9c2b8" stroke-width="4" stroke-linecap="round"/>'
)

for sid, svg in STICKERS.items():
    with open(os.path.join(OUT, f'{sid}.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)

print(f'wrote {len(STICKERS)} stickers to {OUT}')
