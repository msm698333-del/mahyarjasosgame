#!/usr/bin/env python3
# ─── تولید ۲۴ آواتار SVG اختصاصی — سبک کارتونی مافیایی/جاسوسی ───
# خروجی: client/assets/avatars/a01.svg … a24.svg
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'assets', 'avatars')
os.makedirs(OUT, exist_ok=True)

INK = '#160d28'

def grad(i, c1, c2):
    return (f'<radialGradient id="g{i}" cx="50%" cy="32%" r="85%">'
            f'<stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></radialGradient>')

def base(i, c1, c2):
    return (f'<defs>{grad(i, c1, c2)}'
            f'<clipPath id="cc{i}"><circle cx="60" cy="60" r="56"/></clipPath></defs>'
            f'<circle cx="60" cy="60" r="60" fill="url(#g{i})"/>'
            f'<g clip-path="url(#cc{i})">')

def ring(color):
    return (f'</g><circle cx="60" cy="60" r="56" fill="none" stroke="{color}" stroke-width="3"/>'
            f'<circle cx="60" cy="60" r="59.5" fill="none" stroke="{color}" stroke-width="1" opacity="0.45"/>')

# ── بدن و لباس ──
def torso(suit, extra='tie'):
    s = f'<path d="M22,124 Q24,94 60,92 Q96,94 98,124 Z" fill="{suit}"/>'
    s += f'<path d="M22,124 Q24,96 44,92 L52,104 L60,98 L68,104 L76,92 Q96,96 98,124 Z" fill="{suit}" stroke="#0d0818" stroke-width="1.2"/>'
    s += '<path d="M44,92 L60,98 L76,92" fill="none" stroke="#f3ede0" stroke-width="3" opacity="0.85"/>'
    if extra == 'tie':
        s += '<path d="M57,100 L63,100 L61,108 L64,116 L60,122 L56,116 L59,108 Z" fill="#c8324b" stroke="#7e1c2c" stroke-width="0.8"/>'
    elif extra == 'bowtie':
        s += '<path d="M52,102 L60,106 L52,110 Z M68,102 L60,106 L68,110 Z" fill="#c8324b"/><circle cx="60" cy="106" r="2.6" fill="#7e1c2c"/>'
    elif extra == 'scarf':
        s += '<path d="M40,94 Q60,108 80,94 L82,102 Q60,116 38,102 Z" fill="#b03a2e"/>'
    elif extra == 'badge':
        s += '<circle cx="80" cy="102" r="3.4" fill="#f5c542" stroke="#8a6a12" stroke-width="0.8"/>'
    return s

# ── سر ──
def head(skin):
    s = f'<circle cx="38" cy="56" r="4.6" fill="{skin}"/><circle cx="82" cy="56" r="4.6" fill="{skin}"/>'
    s += f'<ellipse cx="60" cy="52" rx="21.5" ry="23.5" fill="{skin}"/>'
    s += f'<ellipse cx="60" cy="52" rx="21.5" ry="23.5" fill="none" stroke="#00000022" stroke-width="1"/>'
    return s

def eyes(kind):
    if kind == 'serious':
        return '<path d="M47,49 L57,49 M63,49 L73,49" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>'
    if kind == 'wide':
        return ('<circle cx="52" cy="49" r="5" fill="#fff"/><circle cx="52" cy="49" r="2.2" fill="' + INK + '"/>'
                '<circle cx="68" cy="49" r="5" fill="#fff"/><circle cx="68" cy="49" r="2.2" fill="' + INK + '"/>')
    if kind == 'sleepy':
        return '<path d="M48,50 Q52,53 56,50 M64,50 Q68,53 72,50" stroke="' + INK + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    return ('<circle cx="52" cy="49" r="2.8" fill="' + INK + '"/><circle cx="68" cy="49" r="2.8" fill="' + INK + '"/>')

def brows(kind):
    if kind == 'angry':
        return '<path d="M46,43 L57,46 M74,43 L63,46" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>'
    if kind == 'raised':
        return '<path d="M47,40 Q52,37 57,40 M63,40 Q68,37 73,40" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
    return '<path d="M47,42 L57,42 M63,42 L73,42" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>'

def nose():
    return '<path d="M60,52 Q57.5,58 60,60" stroke="#00000055" stroke-width="1.8" fill="none" stroke-linecap="round"/>'

def mouth(kind):
    if kind == 'smile':
        return '<path d="M51,64 Q60,72 69,64" stroke="' + INK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    if kind == 'open':
        return '<path d="M52,64 Q60,74 68,64 Z" fill="#5e1f2c"/><path d="M54,65 Q60,62 66,65 L66,66 Q60,63 54,66 Z" fill="#fff"/>'
    if kind == 'serious':
        return '<path d="M52,66 L68,66" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>'
    return '<path d="M51,65 Q56,69 69,63" stroke="' + INK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'

def facial(kind):
    if kind == 'mustache':
        return '<path d="M52,61 Q60,58 68,61 Q64,66 60,64 Q56,66 52,61 Z" fill="#2a1a12"/>'
    if kind == 'stubble':
        return '<path d="M43,58 Q60,78 77,58 Q74,74 60,74 Q46,74 43,58 Z" fill="#2a1a12" opacity="0.28"/>'
    if kind == 'beard':
        return '<path d="M40,54 Q44,80 60,80 Q76,80 80,54 Q80,66 60,66 Q40,66 40,54 Z" fill="#2a1a12"/><path d="M54,63 Q60,60 66,63" stroke="#00000000" stroke-width="0"/>'
    if kind == 'goatee':
        return '<path d="M54,66 Q60,78 66,66 Q60,72 54,66 Z" fill="#2a1a12"/>'
    return ''

# ── موها ──
def hair(kind, color='#241812'):
    if kind == 'curly':
        return (f'<circle cx="47" cy="34" r="8" fill="{color}"/><circle cx="56" cy="29" r="9" fill="{color}"/>'
                f'<circle cx="66" cy="29" r="9" fill="{color}"/><circle cx="74" cy="35" r="7.5" fill="{color}"/>'
                f'<circle cx="42" cy="42" r="6" fill="{color}"/><circle cx="78" cy="42" r="6" fill="{color}"/>')
    if kind == 'flat':
        return f'<path d="M39,40 L39,28 Q60,22 81,28 L81,40 Q60,34 39,40 Z" fill="{color}"/>'
    if kind == 'slick':
        return f'<path d="M39,42 Q40,26 60,25 Q80,26 81,42 Q72,30 54,31 Q42,32 39,42 Z" fill="{color}"/>'
    if kind == 'long':
        return (f'<path d="M36,62 Q32,26 60,24 Q88,26 84,62 L78,62 Q80,34 60,32 Q40,34 42,62 Z" fill="{color}"/>'
                f'<path d="M36,62 Q32,26 60,24" fill="{color}"/>')
    if kind == 'bun':
        return (f'<circle cx="60" cy="24" r="7" fill="{color}"/>'
                f'<path d="M40,42 Q42,28 60,27 Q78,28 80,42 Q60,36 40,42 Z" fill="{color}"/>')
    return ''

# ── کلاه‌ها ──
def hat(kind):
    if kind == 'fedora':
        return ('<ellipse cx="60" cy="33" rx="31" ry="7.5" fill="#241b3f"/>'
                '<path d="M40,32 Q40,10 60,10 Q80,10 80,32 Z" fill="#2e2352"/>'
                '<rect x="40" y="24" width="40" height="8" rx="3" fill="#f5c542"/>'
                '<ellipse cx="60" cy="33" rx="31" ry="7.5" fill="none" stroke="#0d0818" stroke-width="1.4"/>')
    if kind == 'beret':
        return ('<path d="M38,32 Q38,14 62,14 Q84,15 82,32 Q60,24 38,32 Z" fill="#7c2b3a"/>'
                '<circle cx="62" cy="13" r="3" fill="#4d1420"/>')
    if kind == 'cap':
        return ('<path d="M40,32 Q40,14 60,14 Q80,14 80,32 Z" fill="#1f4d3d"/>'
                '<path d="M38,32 Q60,26 84,32 Q84,38 60,37 Q38,37 38,32 Z" fill="#17382d"/>'
                '<circle cx="60" cy="16" r="2.4" fill="#f5c542"/>')
    if kind == 'hood':
        return ('<path d="M30,58 Q28,20 60,18 Q92,20 90,58 Q84,30 60,29 Q36,30 30,58 Z" fill="#3a2f66"/>')
    if kind == 'beanie':
        return ('<path d="M38,32 Q40,12 60,12 Q80,12 82,32 Z" fill="#8a3f2a"/>'
                '<rect x="36" y="28" width="48" height="9" rx="4.5" fill="#6b2e1e"/>'
                '<circle cx="60" cy="11" r="4" fill="#f5c542"/>')
    if kind == 'bandana':
        return ('<path d="M38,34 Q60,22 82,34 L82,42 Q60,32 38,42 Z" fill="#b03a2e"/>'
                '<circle cx="52" cy="33" r="1.4" fill="#f3ede0"/><circle cx="60" cy="31" r="1.4" fill="#f3ede0"/>'
                '<circle cx="68" cy="33" r="1.4" fill="#f3ede0"/>')
    if kind == 'headphones':
        return ('<path d="M36,48 Q36,18 60,18 Q84,18 84,48" fill="none" stroke="#12101f" stroke-width="6" stroke-linecap="round"/>'
                '<rect x="28" y="44" width="12" height="18" rx="6" fill="#f5c542" stroke="#12101f" stroke-width="2"/>'
                '<rect x="80" y="44" width="12" height="18" rx="6" fill="#f5c542" stroke="#12101f" stroke-width="2"/>')
    return ''

# ── عینک‌ها ──
def glasses(kind):
    if kind == 'shades':
        return ('<rect x="45" y="44" width="14" height="10" rx="4" fill="#12101f" stroke="#f5c542" stroke-width="1.2"/>'
                '<rect x="61" y="44" width="14" height="10" rx="4" fill="#12101f" stroke="#f5c542" stroke-width="1.2"/>'
                '<path d="M59,48 L61,48 M45,47 L40,49 M75,47 L80,49" stroke="#12101f" stroke-width="2" fill="none"/>')
    if kind == 'round':
        return ('<circle cx="52" cy="49" r="7" fill="#ffffff30" stroke="#12101f" stroke-width="2"/>'
                '<circle cx="68" cy="49" r="7" fill="#ffffff30" stroke="#12101f" stroke-width="2"/>'
                '<path d="M59,49 L61,49 M45,47 L40,48 M75,47 L80,48" stroke="#12101f" stroke-width="2" fill="none"/>')
    if kind == 'monocle':
        return ('<circle cx="68" cy="49" r="8" fill="#ffffff22" stroke="#f5c542" stroke-width="2.4"/>'
                '<path d="M68,57 Q66,66 60,68" stroke="#f5c542" stroke-width="1.4" fill="none"/>')
    if kind == 'eyepatch':
        return ('<rect x="44" y="42" width="15" height="13" rx="4" fill="#12101f"/>'
                '<path d="M44,45 L38,42 M59,45 L82,50" stroke="#12101f" stroke-width="2.4"/>')
    return ''

def earring():
    return '<circle cx="82" cy="61" r="2.4" fill="#f5c542" stroke="#8a6a12" stroke-width="0.7"/>'

# ── ۲۴ ترکیب اختصاصی ──
COMBOS = [
 dict(bg=('#2b2159', '#0e0a26'), skin='#f2cfa2', suit='#221a3e', hat='fedora', gl='shades', face='mustache', eyes='serious', mouth='smirk', extra='tie', ring='#f5c542'),
 dict(bg=('#0f4444', '#062121'), skin='#e8b488', suit='#143830', hat='beret', gl='round', face='goatee', eyes='normal', mouth='smile', extra='badge', ring='#a78bfa'),
 dict(bg=('#1d2c52', '#0a1226'), skin='#c98e5e', suit='#27314a', hat='cap', gl='', face='stubble', eyes='normal', mouth='smile', extra='tie', ring='#f5c542'),
 dict(bg=('#26262e', '#0c0c12'), skin='#f2cfa2', suit='#1c1c22', hat='hood', gl='', face='', eyes='serious', mouth='serious', extra='tie', ring='#a78bfa'),
 dict(bg=('#54202f', '#1f0a12'), skin='#eab98b', suit='#3d1822', hat='beanie', gl='', face='beard', eyes='normal', mouth='smile', extra='scarf', ring='#f5c542'),
 dict(bg=('#5a1620', '#20050b'), skin='#d9a066', suit='#8f2a2a', hat='bandana', gl='', face='', eyes='wide', mouth='open', extra='bowtie', ring='#a78bfa'),
 dict(bg=('#123a5e', '#071a2c'), skin='#f6d7b0', suit='#0f2a44', hat='headphones', gl='', face='', eyes='sleepy', mouth='smile', extra='badge', ring='#f5c542'),
 dict(bg=('#4d3a14', '#1f1708'), skin='#b97f52', suit='#3a2e12', hat='', hair='curly', gl='', face='', eyes='normal', mouth='open', extra='earring', ring='#a78bfa'),
 dict(bg=('#59421b', '#241a06'), skin='#f2cfa2', suit='#33270e', hat='fedora', gl='monocle', face='mustache', eyes='normal', mouth='smirk', extra='bowtie', ring='#f5c542'),
 dict(bg=('#3b2168', '#170a30'), skin='#e8b488', suit='#2a1a4d', hat='', hair='slick', gl='shades', face='', eyes='serious', mouth='smirk', extra='tie', ring='#a78bfa'),
 dict(bg=('#1c4d24', '#0a1f0e'), skin='#c98e5e', suit='#143a1b', hat='', hair='flat', gl='', face='beard', eyes='serious', mouth='serious', extra='badge', ring='#f5c542'),
 dict(bg=('#2e3a4d', '#10161f'), skin='#f6d7b0', suit='#232e3e', hat='beret', gl='eyepatch', face='', eyes='normal', mouth='serious', extra='tie', ring='#a78bfa'),
 dict(bg=('#40246b', '#1a0d2e'), skin='#eab98b', suit='#322050', hat='hood', gl='shades', face='', eyes='serious', mouth='smirk', extra='tie', ring='#f5c542'),
 dict(bg=('#5e2a12', '#240f05'), skin='#d9a066', suit='#471f0c', hat='cap', gl='', face='mustache', eyes='normal', mouth='smile', extra='scarf', ring='#a78bfa'),
 dict(bg=('#232d5e', '#0d1126'), skin='#f2cfa2', suit='#1a2044', hat='', hair='long', gl='round', face='', eyes='normal', mouth='smile', extra='bowtie', ring='#f5c542'),
 dict(bg=('#131c3d', '#060a1a'), skin='#b97f52', suit='#101733', hat='fedora', gl='', face='goatee', eyes='serious', mouth='serious', extra='tie', ring='#f5c542'),
 dict(bg=('#153d2c', '#081a12'), skin='#f6d7b0', suit='#0f2c1f', hat='beanie', gl='shades', face='stubble', eyes='sleepy', mouth='smirk', extra='badge', ring='#a78bfa'),
 dict(bg=('#4d1216', '#1c0507'), skin='#e8b488', suit='#380d10', hat='bandana', gl='', face='', eyes='normal', mouth='open', extra='earring', ring='#f5c542'),
 dict(bg=('#55371a', '#221407'), skin='#f2cfa2', suit='#3f2811', hat='', hair='curly', gl='round', face='mustache', eyes='normal', mouth='smile', extra='tie', ring='#a78bfa'),
 dict(bg=('#0d3d47', '#05191e'), skin='#d9a066', suit='#0a2b33', hat='headphones', gl='', face='goatee', eyes='wide', mouth='open', extra='badge', ring='#f5c542'),
 dict(bg=('#3d1240', '#180519'), skin='#eab98b', suit='#2c0d2e', hat='beret', gl='', face='beard', eyes='serious', mouth='smirk', extra='tie', ring='#f5c542'),
 dict(bg=('#2e3440', '#0f131a'), skin='#f6d7b0', suit='#212730', hat='cap', gl='eyepatch', face='stubble', eyes='normal', mouth='serious', extra='badge', ring='#a78bfa'),
 dict(bg=('#1f3d1a', '#0c190a'), skin='#c98e5e', suit='#152a11', hat='hood', gl='round', face='', eyes='normal', mouth='smile', extra='scarf', ring='#f5c542'),
 dict(bg=('#1a1a1e', '#070709'), skin='#f2cfa2', suit='#101014', hat='fedora', gl='shades', face='beard', eyes='serious', mouth='smirk', extra='tie', ring='#f5c542'),
]

for i, c in enumerate(COMBOS, 1):
    aid = f'a{i:02d}'
    inner = base(i - 1, c['bg'][0], c['bg'][1])
    inner += torso(c['suit'], c['extra'])
    inner += head(c['skin'])
    inner += hair(c.get('hair', ''), '#241812')
    inner += hat(c.get('hat', ''))
    inner += eyes(c['eyes'])
    inner += brows('angry' if c['eyes'] == 'serious' else 'raised' if c['eyes'] == 'wide' else 'flat')
    inner += nose()
    inner += mouth(c['mouth'])
    inner += facial(c['face'])
    inner += glasses(c['gl'])
    if c['extra'] == 'earring':
        inner += earring()
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">{inner}{ring(c["ring"])}</svg>'
    with open(os.path.join(OUT, f'{aid}.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)

print(f'wrote {len(COMBOS)} avatars to {OUT}')
