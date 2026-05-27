"""
Generate the gov emotion suite.

Design language (locked):
- 160x160 black rounded square (rx=6), fg = #fafafa, bg = #1a1a1a
- Eyes at y ~ 92, mouth at y ~ 125 (baseline) -- centre x = 80
- Variation comes from brows, eyes, and mouth shape only

Every file is a standalone SVG with viewBox="0 0 160 160".
"""
import os

OUT = "/home/claude/gov_emotions/svgs"
os.makedirs(OUT, exist_ok=True)

BG = "#1a1a1a"
FG = "#fafafa"

def wrap(inner: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">'
        f'<rect x="0" y="0" width="160" height="160" rx="6" fill="{BG}"/>'
        f'{inner}'
        f'</svg>'
    )

# Reusable feature snippets
def brows_angry():
    # classic downward inward slashes
    return (
        f'<rect x="22" y="55" width="52" height="10" transform="rotate(18 48 60)" fill="{FG}"/>'
        f'<rect x="86" y="55" width="52" height="10" transform="rotate(-18 112 60)" fill="{FG}"/>'
    )

def brows_angry_steep():
    return (
        f'<rect x="22" y="50" width="52" height="11" transform="rotate(28 48 56)" fill="{FG}"/>'
        f'<rect x="86" y="50" width="52" height="11" transform="rotate(-28 112 56)" fill="{FG}"/>'
    )

def brows_flat():
    return (
        f'<rect x="32" y="60" width="40" height="8" fill="{FG}"/>'
        f'<rect x="88" y="60" width="40" height="8" fill="{FG}"/>'
    )

def brows_raised():
    # inverted V shapes, both lifted outward (surprised/sceptical)
    return (
        f'<rect x="22" y="60" width="52" height="9" transform="rotate(-18 48 64)" fill="{FG}"/>'
        f'<rect x="86" y="60" width="52" height="9" transform="rotate(18 112 64)" fill="{FG}"/>'
    )

def brows_one_up():
    # left flat, right raised outward -- sceptical/smug
    return (
        f'<rect x="22" y="60" width="52" height="9" transform="rotate(18 48 64)" fill="{FG}"/>'
        f'<rect x="86" y="60" width="52" height="9" transform="rotate(15 112 64)" fill="{FG}"/>'
    )

def brows_worried():
    # inner ends UP, outer DOWN (classic worry brows)
    return (
        f'<rect x="22" y="62" width="52" height="9" transform="rotate(-18 48 66)" fill="{FG}"/>'
        f'<rect x="86" y="62" width="52" height="9" transform="rotate(18 112 66)" fill="{FG}"/>'
    )

def brows_sad():
    # same shape as worried but a tick lower
    return (
        f'<rect x="22" y="66" width="52" height="9" transform="rotate(-14 48 70)" fill="{FG}"/>'
        f'<rect x="86" y="66" width="52" height="9" transform="rotate(14 112 70)" fill="{FG}"/>'
    )

def brows_mono():
    return f'<rect x="22" y="56" width="116" height="11" fill="{FG}"/>'

def brows_thinking():
    # one raised, one flat (thoughtful)
    return (
        f'<rect x="22" y="62" width="52" height="9" fill="{FG}"/>'
        f'<rect x="86" y="55" width="52" height="9" transform="rotate(-12 112 60)" fill="{FG}"/>'
    )

def eyes_dot():
    return (
        f'<circle cx="55" cy="92" r="6" fill="{FG}"/>'
        f'<circle cx="105" cy="92" r="6" fill="{FG}"/>'
    )

def eyes_dot_small():
    return (
        f'<circle cx="55" cy="92" r="3.5" fill="{FG}"/>'
        f'<circle cx="105" cy="92" r="3.5" fill="{FG}"/>'
    )

def eyes_slit():
    return (
        f'<rect x="44" y="90" width="22" height="5" fill="{FG}"/>'
        f'<rect x="94" y="90" width="22" height="5" fill="{FG}"/>'
    )

def eyes_closed():
    # gentle arcs
    return (
        f'<path d="M 44 92 Q 55 86 66 92" stroke="{FG}" stroke-width="4" fill="none" stroke-linecap="butt"/>'
        f'<path d="M 94 92 Q 105 86 116 92" stroke="{FG}" stroke-width="4" fill="none" stroke-linecap="butt"/>'
    )

def eyes_dead():
    # X X
    return (
        f'<rect x="46" y="86" width="20" height="4" transform="rotate(45 56 88)" fill="{FG}"/>'
        f'<rect x="46" y="86" width="20" height="4" transform="rotate(-45 56 88)" fill="{FG}"/>'
        f'<rect x="96" y="86" width="20" height="4" transform="rotate(45 106 88)" fill="{FG}"/>'
        f'<rect x="96" y="86" width="20" height="4" transform="rotate(-45 106 88)" fill="{FG}"/>'
    )

def eyes_wide():
    return (
        f'<circle cx="55" cy="92" r="9" fill="{FG}"/>'
        f'<circle cx="105" cy="92" r="9" fill="{FG}"/>'
        f'<circle cx="55" cy="92" r="3" fill="{BG}"/>'
        f'<circle cx="105" cy="92" r="3" fill="{BG}"/>'
    )

def eyes_sideways():
    # both pupils shifted right (side-eye)
    return (
        f'<circle cx="55" cy="92" r="8" fill="{FG}"/>'
        f'<circle cx="105" cy="92" r="8" fill="{FG}"/>'
        f'<circle cx="59" cy="92" r="3" fill="{BG}"/>'
        f'<circle cx="109" cy="92" r="3" fill="{BG}"/>'
    )

def eyes_up():
    return (
        f'<circle cx="55" cy="92" r="8" fill="{FG}"/>'
        f'<circle cx="105" cy="92" r="8" fill="{FG}"/>'
        f'<circle cx="55" cy="88" r="3" fill="{BG}"/>'
        f'<circle cx="105" cy="88" r="3" fill="{BG}"/>'
    )

def eyes_wink_left():
    return (
        f'<path d="M 44 92 Q 55 86 66 92" stroke="{FG}" stroke-width="4" fill="none"/>'
        f'<circle cx="105" cy="92" r="6" fill="{FG}"/>'
    )

def eyes_money():
    # £ signs roughly drawn as a vertical bar + serif
    return (
        f'<rect x="51" y="84" width="3" height="16" fill="{FG}"/>'
        f'<rect x="48" y="90" width="9" height="3" fill="{FG}"/>'
        f'<rect x="46" y="98" width="14" height="3" fill="{FG}"/>'
        f'<rect x="101" y="84" width="3" height="16" fill="{FG}"/>'
        f'<rect x="98" y="90" width="9" height="3" fill="{FG}"/>'
        f'<rect x="96" y="98" width="14" height="3" fill="{FG}"/>'
    )

def eyes_heart():
    # tiny heart shapes built from two circles + a triangle each
    def heart(cx):
        return (
            f'<circle cx="{cx-3}" cy="90" r="4" fill="{FG}"/>'
            f'<circle cx="{cx+3}" cy="90" r="4" fill="{FG}"/>'
            f'<polygon points="{cx-6},92 {cx+6},92 {cx},100" fill="{FG}"/>'
        )
    return heart(55) + heart(105)

def eyes_spiral():
    # confused -- concentric dots
    def s(cx):
        return (
            f'<circle cx="{cx}" cy="92" r="8" fill="none" stroke="{FG}" stroke-width="2"/>'
            f'<circle cx="{cx}" cy="92" r="3" fill="{FG}"/>'
        )
    return s(55) + s(105)

def mouth_flat():
    return f'<rect x="50" y="122" width="60" height="7" fill="{FG}"/>'

def mouth_flat_short():
    return f'<rect x="60" y="124" width="40" height="6" fill="{FG}"/>'

def mouth_frown():
    return f'<path d="M 48 132 Q 80 118 112 132" stroke="{FG}" stroke-width="7" fill="none" stroke-linecap="butt"/>'

def mouth_smile():
    return f'<path d="M 48 120 Q 80 138 112 120" stroke="{FG}" stroke-width="7" fill="none" stroke-linecap="butt"/>'

def mouth_smirk():
    # one corner up
    return f'<path d="M 50 128 Q 70 128 90 122 Q 100 118 110 116" stroke="{FG}" stroke-width="6" fill="none" stroke-linecap="butt"/>'

def mouth_o():
    return f'<circle cx="80" cy="128" r="9" fill="{FG}"/>'

def mouth_o_small():
    return f'<circle cx="80" cy="128" r="5" fill="{FG}"/>'

def mouth_teeth():
    base = f'<rect x="42" y="120" width="76" height="14" fill="{FG}"/>'
    bars = ''.join(
        f'<rect x="{42 + 13 + i*13}" y="120" width="2" height="14" fill="{BG}"/>'
        for i in range(5)
    )
    return base + bars

def mouth_tongue():
    return (
        f'<rect x="50" y="120" width="60" height="14" fill="{FG}"/>'
        f'<rect x="68" y="130" width="14" height="10" fill="{FG}"/>'
    )

def mouth_squiggle():
    # unsure / awkward
    return (
        f'<path d="M 50 128 Q 60 120 70 128 T 90 128 T 110 128" stroke="{FG}" stroke-width="5" fill="none"/>'
    )

def mouth_dot():
    return f'<circle cx="80" cy="128" r="3.5" fill="{FG}"/>'

def mouth_zip():
    # straight line with tiny verticals (lips sealed)
    base = f'<rect x="46" y="126" width="68" height="4" fill="{FG}"/>'
    ticks = ''.join(
        f'<rect x="{50 + i*8}" y="122" width="3" height="12" fill="{FG}"/>'
        for i in range(8)
    )
    return base + ticks

# extra little garnishes
def sweat_drop():
    return f'<path d="M 130 35 Q 138 50 130 55 Q 122 50 130 35 Z" fill="{FG}"/>'

def zzz():
    return (
        f'<rect x="118" y="34" width="14" height="3" fill="{FG}"/>'
        f'<rect x="124" y="48" width="3" height="14" transform="rotate(45 125.5 55)" fill="{FG}"/>'
        f'<rect x="118" y="62" width="14" height="3" fill="{FG}"/>'
    )

def angry_marks():
    # corner steam lines
    return (
        f'<rect x="20" y="20" width="4" height="14" fill="{FG}"/>'
        f'<rect x="14" y="34" width="14" height="4" fill="{FG}"/>'
    )

def exclamation():
    return (
        f'<rect x="135" y="20" width="6" height="22" fill="{FG}"/>'
        f'<rect x="135" y="46" width="6" height="6" fill="{FG}"/>'
    )

def question_mark():
    return (
        f'<path d="M 128 22 Q 142 22 142 30 Q 142 36 135 40 L 135 46" stroke="{FG}" stroke-width="4" fill="none"/>'
        f'<rect x="133" y="50" width="5" height="5" fill="{FG}"/>'
    )

# Each entry: (slug, brows, eyes, mouth, extra)
emotions = [
    ("01_default",        brows_angry,        eyes_dot,        mouth_flat,        ""),
    ("02_furious",        brows_angry_steep,  eyes_dot_small,  mouth_frown,       angry_marks()),
    ("03_disapproving",   brows_angry,        eyes_slit,       mouth_flat,        ""),
    ("04_unimpressed",    brows_flat,         eyes_slit,       mouth_flat,        ""),
    ("05_sceptical",      brows_one_up,       eyes_dot,        mouth_smirk,       ""),
    ("06_smug",           brows_one_up,       eyes_dot,        mouth_smirk,       ""),
    ("07_surprised",      brows_raised,       eyes_wide,       mouth_o,           ""),
    ("08_shocked",        brows_raised,       eyes_wide,       mouth_o,           exclamation()),
    ("09_confused",       brows_thinking,     eyes_spiral,     mouth_squiggle,    ""),
    ("10_questioning",    brows_thinking,     eyes_dot,        mouth_squiggle,    question_mark()),
    ("11_thinking",       brows_thinking,     eyes_up,         mouth_dot,         ""),
    ("12_side_eye",       brows_angry,        eyes_sideways,   mouth_flat_short,  ""),
    ("13_worried",        brows_worried,      eyes_dot,        mouth_squiggle,    sweat_drop()),
    ("14_sad",            brows_sad,          eyes_dot,        mouth_frown,       ""),
    ("15_resigned",       brows_sad,          eyes_closed,     mouth_flat,        ""),
    ("16_asleep",         brows_flat,         eyes_closed,     mouth_dot,         zzz()),
    ("17_dead_inside",    brows_flat,         eyes_dead,       mouth_flat,        ""),
    ("18_pleased",        brows_flat,         eyes_closed,     mouth_smile,       ""),
    ("19_smiling",        brows_raised,       eyes_dot,        mouth_smile,       ""),
    ("20_cheeky",         brows_one_up,       eyes_wink_left,  mouth_tongue,      ""),
    ("21_grinning",       brows_angry,        eyes_dot_small,  mouth_teeth,       ""),
    ("22_silenced",       brows_flat,         eyes_dot,        mouth_zip,         ""),
    ("23_greedy",         brows_raised,       eyes_money,      mouth_smile,       ""),
    ("24_lovestruck",     brows_raised,       eyes_heart,      mouth_smile,       ""),
    ("25_unibrow_rage",   brows_mono,         eyes_dot,        mouth_frown,       ""),
    ("26_speechless",     brows_raised,       eyes_dot,        mouth_o_small,     ""),
]

for slug, brows, eyes, mouth, extra in emotions:
    svg = wrap(brows() + eyes() + mouth() + (extra or ""))
    path = os.path.join(OUT, f"gov_{slug}.svg")
    with open(path, "w") as f:
        f.write(svg)

print(f"Wrote {len(emotions)} SVGs to {OUT}")
for slug, *_ in emotions:
    print(f"  gov_{slug}.svg")
