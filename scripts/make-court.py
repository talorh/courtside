# Builds the empty-player image, public/court.webp: a parquet court in the club's colours with its logo at centre court
# and its name along the baselines. `npm run club -- court` runs it with the club's config; by hand:
#   python3 scripts/make-court.py public/logo.png court.jpg <font.ttf|otf> "SAINTS" "HOME OF THE SAINTS" "#2F6FDB" "#14274E"
# then magick court.jpg -quality 78 public/court.webp (a third the size). The JPEG isn't kept: nothing loads it.
import random, math, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont
random.seed(12)
W, H, SS = 1600, 900, 2            # final size, supersample
w, h = W*SS, H*SS
S = 47*SS                           # px per metre (FIBA court 28 x 15 m)
ox, oy = (w - 28*S)//2, (h - 15*S)//2
def P(x, y): return (ox + x*S, oy + y*S)

# Parquet: maple planks running the length of the court, staggered joints, tone and grain variation.
img = Image.new("RGB", (w, h))
d = ImageDraw.Draw(img)
pw = 20*SS
for row, y in enumerate(range(0, h, pw)):
    x = -random.randint(0, 400*SS)
    while x < w:
        L = random.randint(260, 620)*SS
        t = random.uniform(-1, 1)
        base = (int(214+18*t), int(160+16*t), int(98+14*t))
        d.rectangle([x, y, x+L, y+pw], fill=base)
        for g in range(random.randint(2, 5)):          # grain streaks
            gy = y + random.randint(2, pw-2); k = random.uniform(.9, .97)
            d.line([x, gy, x+L, gy+random.randint(-2, 2)], fill=tuple(int(c*k) for c in base), width=SS)
        d.line([x, y, x, y+pw], fill=(150, 104, 58), width=SS)    # end joint
        x += L
    d.line([0, y, w, y], fill=(165, 116, 66), width=SS)           # board seam
noise = Image.effect_noise((w, h), 18).convert("RGB")
img = ImageChops.blend(img, ImageChops.multiply(img, noise.point(lambda v: 200+v//4)), .35)

# Painted areas (the club's colours, a little translucent so the wood shows through), then white lines.
def hexrgb(hx): return tuple(int(hx[i:i+2], 16) for i in (1, 3, 5))
paint = Image.new("RGBA", (w, h), (0, 0, 0, 0)); pd = ImageDraw.Draw(paint)
GREEN = hexrgb(sys.argv[6]) + (215,)
APRON = hexrgb(sys.argv[7]) + (225,)
x0a, y0a = P(0, 0); x1a, y1a = P(28, 15)
for box in ([0, 0, w, y0a], [0, y1a, w, h], [0, y0a, x0a, y1a], [x1a, y0a, w, y1a]):
    pd.rectangle(box, fill=APRON)
for side in (0, 1):
    x0, x1 = (0, 5.8) if side == 0 else (22.2, 28)
    pd.rectangle([*P(x0, 7.5-2.45), *P(x1, 7.5+2.45)], fill=GREEN)         # key
cx, cy = P(14, 7.5)
img = Image.alpha_composite(img.convert("RGBA"), paint)

d = ImageDraw.Draw(img); LW = int(.05*S)+SS; WHITE = (250, 250, 246, 255)
d.rectangle([*P(0, 0), *P(28, 15)], outline=WHITE, width=LW)
d.line([*P(14, 0), *P(14, 15)], fill=WHITE, width=LW)
d.ellipse([cx-1.8*S, cy-1.8*S, cx+1.8*S, cy+1.8*S], outline=WHITE, width=LW)
for side in (0, 1):
    sgn = 1 if side == 0 else -1; bx = 0 if side == 0 else 28
    x_ft = bx + sgn*5.8
    d.rectangle([*P(min(bx, x_ft), 7.5-2.45), *P(max(bx, x_ft), 7.5+2.45)], outline=WHITE, width=LW)
    fx, fy = P(x_ft, 7.5); r = 1.8*S
    a0, a1 = (-90, 90) if side == 0 else (90, 270)
    d.arc([fx-r, fy-r, fx+r, fy+r], a0, a1, fill=WHITE, width=LW)        # free-throw semicircle
    hx, hy = P(bx + sgn*1.575, 7.5); R = 6.75*S                          # basket centre, 3-point arc
    ang = math.degrees(math.asin(6.6/6.75))
    arc = (-ang, ang) if side == 0 else (180-ang, 180+ang)
    d.arc([hx-R, hy-R, hx+R, hy+R], *arc, fill=WHITE, width=LW)
    cut = hx + sgn*R*math.cos(math.radians(ang)) - ox
    for yy in (0.9, 14.1):
        d.line([*P(bx, yy), (ox+cut, oy+yy*S)], fill=WHITE, width=LW)
    d.arc([hx-1.25*S, hy-1.25*S, hx+1.25*S, hy+1.25*S], *( (-90, 90) if side == 0 else (90, 270)), fill=WHITE, width=LW)  # no-charge

# The logo decal: cut it out of its white background, then place it on centre court.
logo = Image.open(sys.argv[1]).convert("RGBA")
mask = Image.new("L", logo.size, 0)
from PIL import ImageDraw as D2
work = logo.convert("RGB").copy()
for corner in [(0, 0), (logo.width-1, 0), (0, logo.height-1), (logo.width-1, logo.height-1)]:
    D2.floodfill(work, corner, (255, 0, 255), thresh=60)
wp = work.load(); mp = mask.load()
for yy in range(logo.height):
    for xx in range(logo.width):
        mp[xx, yy] = 0 if wp[xx, yy] == (255, 0, 255) else 255
mask = mask.filter(ImageFilter.GaussianBlur(1))
logo.putalpha(mask)
logo = logo.crop(logo.getbbox())
dw = int(5.6*S); dh = int(logo.height*dw/logo.width)
dec = logo.resize((dw, dh), Image.LANCZOS)
# white outline so the black edges read on the green circle
outline = Image.new("RGBA", dec.size, (255, 255, 255, 0)); a = dec.getchannel("A").filter(ImageFilter.MaxFilter(13))
outline.putalpha(a)
img.alpha_composite(outline, (int(cx-dw/2), int(cy-dh/2)))
img.alpha_composite(dec, (int(cx-dw/2), int(cy-dh/2)))

# Soft gym lighting: brighter centre, darker edges.
vig = Image.radial_gradient("L").resize((w, h)).point(lambda v: int(255 - v*0.45))
img = ImageChops.multiply(img.convert("RGB"), Image.merge("RGB", [vig]*3))
img = img.convert("RGBA")
# Lettering on the apron: the club's name up and down both baselines, the home message on the bottom sideline.
font_path = sys.argv[3]
INK = (250, 250, 246, 255)
def text_tile(text, size, spacing):
    f = ImageFont.truetype(font_path, size)
    l, t, r, b = f.getbbox(text)
    tw = int(sum(f.getlength(ch) for ch in text) + spacing*(len(text)-1)) + 4
    tile = Image.new("RGBA", (tw, b - t), (0, 0, 0, 0)); td = ImageDraw.Draw(tile); x = 0
    for ch in text:
        td.text((x, -t), ch, font=f, fill=INK); x += f.getlength(ch) + spacing
    return tile
side_gap = ox                                    # apron width beside each baseline
word = text_tile(sys.argv[4], int(side_gap*0.6), int(side_gap*0.1))
n = 1                                           # the name once, centred on each baseline
for side in (0, 1):
    rot = word.rotate(90 if side == 0 else -90, expand=True)     # read facing the court
    xx = int(side_gap/2 - rot.width/2) if side == 0 else int(w - side_gap/2 - rot.width/2)
    span = 15*S; gap = (span - n*rot.height)/(n+1)
    for i in range(n):
        img.alpha_composite(rot, (xx, int(oy + gap*(i+1) + rot.height*i)))
home = text_tile(sys.argv[5], int(oy*0.5), int(oy*0.1))
img.alpha_composite(home, (int(w/2 - home.width/2), int(oy + 15*S + oy/2 - home.height/2)))

img.convert("RGB").resize((W, H), Image.LANCZOS).save(sys.argv[2], quality=82, optimize=True, progressive=True)
