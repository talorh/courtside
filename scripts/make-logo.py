# The example club's logo set: a ball on fire ripping through the hoop at an angle, swinging a burning net, in the
# club's ring. Drawn here so the repository carries no real club's mark. A club replaces every file it writes with its
# own (INSTALL.md): logo.png (square, on white), the Home Screen icons, the favicon, and club-mark.webp (the mark alone
# on a transparent background, for the launch screen and the win and Full time cards).
#   python3 scripts/make-logo.py "#14274E" "#2F6FDB"
# The picture is an SVG made here and turned into the files by ImageMagick, which must have librsvg (magick -list
# format says RSVG beside SVG): its own SVG reader doesn't draw the fire's filters.
import math, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont
BAR, BUTTON = sys.argv[1], sys.argv[2]
def rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def mix(a, b, t): return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(rgb(a), rgb(b)))
def f2(p): return f"{p[0]:.1f} {p[1]:.1f}"

# The hoop: the rim's centre, top and radii, the net's length and how far the ball swings its foot.
RX0, TOP, RX, RY, H, SWING = 222, 124, 118, 30, 206, 80
# The ball, and the way it came from (degrees off straight up).
BX, BY, BR, LEAN = 332, 370, 90, -26

# An NBA net: twelve loops hung from the rim's hooks, a knotted diamond mesh of thick white cord, tapering, then
# stretched round the ball and swung the way it's going. Its half-width down its length, and the rows of knots.
PROFILE = [(0, 118), (.2, 105), (.48, 91), (.72, 88), (1, 96), (1.1, 100)]
ROWS = [0, .15, .30, .45, .60, .74, .88, 1.0]
COLS = 12
def width(s):
    for (s0, w0), (s1, w1) in zip(PROFILE, PROFILE[1:]):
        if s <= s1:
            t = (1 - math.cos(math.pi * (s - s0) / (s1 - s0))) / 2
            return w0 + (w1 - w0) * t
    return PROFILE[-1][1]
def node(r, j):
    """A knot's place, and how far round the front it is (1: nearest, below 0: round the back)."""
    s = ROWS[r]; th = 2 * math.pi * (j + .5 * (r % 2)) / COLS + .13; w = width(s)
    return (RX0 + SWING * s ** 1.5 + w * math.sin(th), TOP + H * s + RY * (w / RX) * math.cos(th)), math.cos(th)
# The cord's colour down the net: white at the rim, glowing where it burns.
STOPS = [(0, "#FAF7F0"), (.42, "#F7ECD0"), (.7, "#FFC460"), (1, "#FF701E")]
def cord_colour(y):
    t = min(1, max(0, (y - TOP) / (H * 1.02)))
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1: return mix(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]
def net():
    front = back = knots = ""
    for r in range(len(ROWS) - 1):
        for j in range(COLS):
            p, c = node(r, j)
            for j2 in ((j, j - 1) if r % 2 == 0 else (j, j + 1)):
                q, c2 = node(r + 1, j2 % COLS)
                sag = ((p[0] + q[0]) / 2 + (q[0] - p[0]) * .04, (p[1] + q[1]) / 2 + 3.2)
                cord = f'<path d="M {f2(p)} Q {f2(sag)} {f2(q)}"/>'
                if (c + c2) / 2 >= -.04: front += cord
                else: back += cord
    for r in range(1, len(ROWS)):
        for p, c in (node(r, j) for j in range(COLS)):
            if c >= .02: knots += f'<ellipse cx="{p[0]:.1f}" cy="{p[1]:.1f}" rx="4.6" ry="4" fill="{cord_colour(p[1])}" stroke="#8C8372" stroke-width="1.1"/><ellipse cx="{p[0] - 1.2:.1f}" cy="{p[1] - 1.2:.1f}" rx="1.6" ry="1.2" fill="#FFF" opacity=".75"/>'
    hooks = "".join(f'<path d="M {p[0]:.1f} {p[1] - 12:.1f} v 13" stroke="#3A1205" stroke-width="3.2" stroke-linecap="round"/><path d="M {p[0]:.1f} {p[1] - 2:.1f} v 7" stroke="#F6F1E6" stroke-width="4.4" stroke-linecap="round"/>' for p, c in (node(0, j) for j in range(COLS)) if c >= .05)
    behind = f'<g fill="none" stroke-linecap="round"><g stroke="#2B2620" stroke-width="5" opacity=".55">{back}</g><g stroke="#A79E8D" stroke-width="3.3" opacity=".8">{back}</g></g>'
    glow = "".join(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="10" fill="#FF7A1A" opacity=".6" filter="url(#b4)"/>' for p, c in (node(len(ROWS) - 1, j) for j in range(COLS)) if c >= .02)
    # The cord: its shadow on the ball, the fire's glow on its lower half, its edge, itself, its twist and its highlight.
    ahead = f'''{glow}<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#000" stroke-width="6" opacity=".4" transform="translate(3 4.5)" filter="url(#b2)">{front}</g>
<g stroke="#FF7A1A" stroke-width="11" opacity=".5" filter="url(#b4)" clip-path="url(#lower)">{front}</g>
<g stroke="#8C8372" stroke-width="6.2">{front}</g><g stroke="url(#cord)" stroke-width="4.6">{front}</g>
<g stroke="#6E6658" stroke-width="4.6" stroke-dasharray="1.3 3.1" opacity=".2" stroke-linecap="butt">{front}</g>
<g stroke="#FFFFFF" stroke-width="1.3" opacity=".75" transform="translate(-1.1 -1)">{front}</g></g>{knots}'''
    return behind, ahead, hooks

# A fire rising from a base one unit either side of the origin: five licks, the tallest in the middle; its layers, the
# hottest innermost (colour, size, opacity).
LICKS = [("M", [(-1, 0)]), ("C", [(-1.2, -.5), (-.85, -.95), (-1.0, -1.55)]), ("C", [(-.72, -1.25), (-.58, -1.0), (-.47, -.72)]),
         ("C", [(-.5, -1.3), (-.12, -1.7), (-.14, -2.4)]), ("C", [(.18, -1.9), (.38, -1.5), (.31, -.95)]),
         ("C", [(.5, -1.2), (.62, -1.5), (.9, -1.8)]), ("C", [(.92, -1.2), (1.2, -.6), (1, 0)]), ("Q", [(0, .35), (-1, 0)])]
LAYERS = [("#B3150A", 1, .8), ("#F2410C", .86, .9), ("#FF8A14", .68, .95), ("#FFC53A", .5, 1), ("#FFF4C2", .3, 1)]
def fire(bx, by, sx, sy, rot):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def lick(k):
        at = lambda p: (bx + p[0] * sx * k * c - p[1] * sy * k * s, by + p[0] * sx * k * s + p[1] * sy * k * c)
        return " ".join(cmd + " " + " ".join(f2(at(p)) for p in pts) for cmd, pts in LICKS) + " Z"
    return "".join(f'<path d="{lick(k)}" fill="{colour}" opacity="{o}"/>' for colour, k, o in LAYERS)

SEAMS = '<path d="M -1 -.06 Q -.1 .34 1 .02"/><path d="M -.12 -1 Q .26 0 -.02 1"/><path d="M .58 -.84 Q .24 -.02 .66 .78"/><path d="M -.80 -.62 Q -.42 -.04 -.74 .70"/>'
def ball(x, y, r):
    """Leather, pebbled, its seams grooved; lit by the fire on one side and the club's colour on the other."""
    return f'''<g transform="translate({x} {y}) scale({r})"><circle r="1" fill="url(#skin)"/><g clip-path="url(#ballclip)"><circle r="1" fill="url(#pebble)"/>
<g transform="rotate(24)" fill="none" stroke-linecap="round"><g stroke="#FFD2A0" stroke-width=".022" opacity=".45" transform="translate(.028 -.024)">{SEAMS}</g><g stroke="#190A03" stroke-width=".05">{SEAMS}</g></g>
<circle r="1" fill="url(#shade)"/><circle r="1" fill="url(#firelight)"/><circle r="1" fill="url(#bounce)"/>
<ellipse cx="-.36" cy="-.50" rx=".34" ry=".17" transform="rotate(-32 -.36 -.5)" fill="#FFF" opacity=".5" filter="url(#bs)"/></g></g>'''

def rim(front):
    arc = f'M {RX0-RX} {TOP} A {RX} {RY} 0 0 {0 if front else 1} {RX0+RX} {TOP}'
    line = lambda colour, w, more="": f'<path d="{arc}" fill="none" stroke="{colour}" stroke-width="{w}" stroke-linecap="round" {more}/>'
    if not front: return f'<path d="M {RX0-24} {TOP-34} h 48 l 7 26 h -62 Z" fill="#8E2A0C"/>' + line("#5A1503", 17) + line("#9E2C0C", 13)
    return (line("#000", 18, 'opacity=".35" transform="translate(2 5)" filter="url(#b4)"') + line("#6B1A04", 19) + line("#E0481A", 16)
            + line("#8E2206", 5, 'transform="translate(0 5)" filter="url(#b1)"') + line("#FFC2A0", 3.5, 'transform="translate(0 -4.5)" filter="url(#b1)"'))

EMBERS = [(96, 110, 3), (150, 52, 2.4), (62, 206, 2), (404, 140, 2.6), (440, 226, 2), (222, 430, 2), (146, 366, 2.4), (300, 78, 1.8), (118, 286, 1.6), (372, 92, 1.5), (186, 96, 1.4)]
SPARKS = [(130, 170, 22), (420, 180, 18), (250, 60, 16), (90, 330, 14)]
def embers():
    return ("".join(f'<line x1="{x}" y1="{y}" x2="{x - L * .47:.0f}" y2="{y - L * .88:.0f}" stroke="#FFD27A" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>' for x, y, L in SPARKS)
            + "".join(f'<circle cx="{x}" cy="{y}" r="{r * 2.6}" fill="#FF8A14" opacity=".55" filter="url(#b4)"/><circle cx="{x}" cy="{y}" r="{r}" fill="#FFE9A8"/>' for x, y, r in EMBERS))

def defs(clip_r):
    return f'''<defs>
<radialGradient id="skin" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#F7A55A"/><stop offset=".35" stop-color="#E27722"/><stop offset=".72" stop-color="#B9500F"/><stop offset="1" stop-color="#5A1E04"/></radialGradient>
<radialGradient id="shade" cx="32%" cy="26%" r="90%"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset=".85" stop-color="#140400" stop-opacity=".5"/><stop offset="1" stop-color="#140400" stop-opacity=".78"/></radialGradient>
<radialGradient id="firelight" cx="8%" cy="12%" r="60%"><stop offset="0" stop-color="#FFD27A" stop-opacity=".75"/><stop offset="1" stop-color="#FF8A14" stop-opacity="0"/></radialGradient>
<radialGradient id="bounce" cx="80%" cy="84%" r="30%"><stop offset="0" stop-color="{BUTTON}" stop-opacity=".16"/><stop offset="1" stop-color="{BUTTON}" stop-opacity="0"/></radialGradient>
<pattern id="pebble" patternUnits="userSpaceOnUse" width=".07" height=".07"><circle cx=".018" cy=".018" r=".011" fill="#4A1A04" opacity=".4"/><circle cx=".053" cy=".053" r=".011" fill="#4A1A04" opacity=".4"/></pattern>
<radialGradient id="sky" cx="54%" cy="58%" r="74%"><stop offset="0" stop-color="{mix(BAR, BUTTON, .34)}"/><stop offset=".7" stop-color="{BAR}"/><stop offset="1" stop-color="{mix(BAR, '#000000', .45)}"/></radialGradient>
<radialGradient id="heat"><stop offset="0" stop-color="#FF8A14" stop-opacity=".5"/><stop offset=".6" stop-color="#C21807" stop-opacity=".18"/><stop offset="1" stop-color="#C21807" stop-opacity="0"/></radialGradient>
<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{mix(BUTTON, '#FFFFFF', .55)}"/><stop offset=".5" stop-color="{BUTTON}"/><stop offset="1" stop-color="{mix(BUTTON, BAR, .6)}"/></linearGradient>
<linearGradient id="cord" gradientUnits="userSpaceOnUse" x1="0" y1="{TOP}" x2="0" y2="{TOP + H * 1.02}">{"".join(f'<stop offset="{t}" stop-color="{c}"/>' for t, c in STOPS)}</linearGradient>
<filter id="flame" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".014 .022" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="3.2"/></filter>
<filter id="flame2" x="-60%" y="-60%" width="220%" height="220%"><feTurbulence type="fractalNoise" baseFrequency=".03 .04" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.8"/></filter>
<filter id="b1"><feGaussianBlur stdDeviation="1"/></filter><filter id="b2"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="b4" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="b9" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="bs" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".06"/></filter>
<clipPath id="ballclip"><circle r="1"/></clipPath><clipPath id="disc"><circle cx="256" cy="256" r="{clip_r}"/></clipPath>
<clipPath id="lower"><rect x="0" y="{TOP + H * .55}" width="600" height="400"/></clipPath></defs>'''

def hoop(fit, ground):
    """The hoop, the net, the fire and the ball. `ground`: there's something behind them to glow and to throw a shadow on."""
    behind, ahead, hooks = net()
    on_net = "".join(fire(node(r, j)[0][0], node(r, j)[0][1] + 4, sx, sy, rot) for r, j, sx, sy, rot in [(4, 9, 20, 46, -32), (6, 10, 17, 36, -40), (3, 3, 17, 40, -14), (5, 2, 15, 34, -10), (2, 0, 11, 26, -22)])
    heat = '<circle cx="262" cy="262" r="250" fill="url(#heat)"/>' if ground else ""
    shadow = f'<circle cx="{BX + 10}" cy="{BY + 14}" r="{BR + 2}" fill="#000" opacity=".5" filter="url(#b9)"/>' if ground else ""
    back = f'<g transform="{fit}">{heat}{rim(False)}{behind}<g filter="url(#flame)">{fire(BX - 8, BY - 4, 92, 128, LEAN)}</g>{shadow}</g>'
    return (f'<g clip-path="url(#disc)">{back}</g>' if ground else back) + f'<g transform="{fit}">{ball(BX, BY, BR)}{ahead}<g filter="url(#flame2)">{on_net}</g>{hooks}{rim(True)}{embers()}</g>'

def about(scale, dx, dy): return f"translate(256 256) scale({scale}) translate(-256 -256) translate({dx} {dy})"
DISC = f'<circle cx="256" cy="256" r="246" fill="{mix(BAR, "#000000", .55)}"/><circle cx="256" cy="256" r="240" fill="url(#sky)"/><circle cx="256" cy="256" r="230" fill="none" stroke="url(#ring)" stroke-width="5"/>'
def svg(body, box="0 0 512 512", clip_r=238): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}">{defs(clip_r)}{body}</svg>'
# The logo: the hoop in the club's ring, the ball bursting out of it.
LOGO = svg(DISC + hoop(about(1.1, 24, 12), True))
# A Home Screen icon a phone may crop to any shape: the club's colour to every edge, the hoop inside the safe middle.
MASKABLE = svg(f'<rect width="512" height="512" fill="{BAR}"/><rect width="512" height="512" fill="url(#sky)"/>' + hoop(about(.8, -8, 0), True), clip_r=400)
# The mark alone, on nothing, 5 by 4 like a crest.
MARK = svg(hoop("", False), box="-22 30 560 448")
# A browser tab's icon, too small for a net: the ball on fire in the ring.
SMALL = svg(DISC + f'<g clip-path="url(#disc)"><circle cx="230" cy="230" r="250" fill="url(#heat)"/><g filter="url(#flame)">{fire(268, 290, 150, 118, LEAN)}</g></g>' + ball(282, 300, 150))

def draw(picture, name, size, *more):
    """`picture` at `size` (pixels, or "WxH") in public/, drawn at twice the size and brought down so its edges are clean."""
    w, h = (size, size) if isinstance(size, int) else map(int, size.split("x"))
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f: f.write(picture)
    try: subprocess.run(["magick", "-background", "none", "-density", str(round(96 * 2 * w / (560 if picture is MARK else 512), 2)), f.name, "-resize", f"{w}x{h}!", *more, f"public/{name}"], check=True)
    finally: os.unlink(f.name)
ON_WHITE = ["-background", "white", "-flatten", "-alpha", "off"]
draw(LOGO, "icon-512.png", 512); draw(LOGO, "icon-192.png", 192)
draw(MASKABLE, "icon-maskable-512.png", 512, "-alpha", "off")
draw(LOGO, "apple-touch-icon.png", 180, *ON_WHITE); draw(LOGO, "apple-touch-icon-precomposed.png", 180, *ON_WHITE)
draw(LOGO, "logo.png", 225, *ON_WHITE)
draw(SMALL, "favicon.png", 64)
Image.open("public/favicon.png").save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
draw(MARK, "club-mark.webp", "400x320", "-quality", "88")
# A stand-in for a broken thumbnail: "Please stand by" on the club's deep colour.
td = Image.new("RGB", (360, 354), rgb(BAR)); d = ImageDraw.Draw(td); d.ellipse([130, 60, 230, 160], fill=(232, 122, 36)); d.line([180, 60, 180, 160], fill=rgb(BAR), width=4); d.line([130, 110, 230, 110], fill=rgb(BAR), width=4)
try: f = ImageFont.truetype("/usr/share/fonts/urw-base35/NimbusSansNarrow-Bold.otf", 34)
except OSError: f = ImageFont.load_default()
for i, line in enumerate(["TECHNICAL DIFFICULTIES", "PLEASE STAND BY"]):
    w = d.textlength(line, font=f); d.text(((360-w)/2, 200+i*44), line, font=f, fill=(255, 255, 255))
td.save("public/technical-difficulties.jpg", quality=85)
print("logo set written")
