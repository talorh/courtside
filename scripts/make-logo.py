# The example club's logo set: a basketball roundel, drawn here so the repository carries no real club's mark. A club
# replaces every file it writes with its own (INSTALL.md): logo.png (square, on white), the Home Screen icons, the
# favicon, and club-mark.webp (the mark alone on a transparent background, for the Game break and Full time cards).
#   python3 scripts/make-logo.py "#14274E" "#2F6FDB"
import sys
from PIL import Image, ImageDraw, ImageFilter
bar, button = sys.argv[1], sys.argv[2]
def hexrgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
BAR, BUTTON = hexrgb(bar), hexrgb(button)
SS = 4
def roundel(size, pad_ratio=0.06, ring=True, bg=None):
    s = size*SS; im = Image.new("RGBA", (s, s), bg or (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pad = int(s*pad_ratio); r = s - 2*pad
    if ring:
        d.ellipse([pad, pad, s-pad, s-pad], fill=BAR)
        inner = int(r*0.09); d.ellipse([pad+inner, pad+inner, s-pad-inner, s-pad-inner], fill=BUTTON)
        bp = pad + int(r*0.2)
    else:
        bp = pad
    # The ball: orange with a darker rim, seams in the club's deep colour.
    b0, b1 = bp, s - bp; br = (b1 - b0)/2; cx = cy = s/2
    d.ellipse([b0, b1-2*br, b1, b1], fill=(232, 122, 36))
    d.ellipse([b0+SS*2, b0+SS*2, b1-SS*2, b1-SS*2], fill=(240, 140, 50))
    lw = max(SS*3, int(br*0.07))
    d.line([cx, b0, cx, b1], fill=BAR, width=lw); d.line([b0, cy, b1, cy], fill=BAR, width=lw)
    for sgn in (-1, 1):
        ox = cx + sgn*br*1.05
        d.arc([ox-br*0.9, cy-br*0.95, ox+br*0.9, cy+br*0.95], 90 if sgn == 1 else -90, 270 if sgn == 1 else 90, fill=BAR, width=lw)
    d.ellipse([b0, b0, b1, b1], outline=BAR, width=lw)
    return im.resize((size, size), Image.LANCZOS)
def on_white(im):
    out = Image.new("RGBA", im.size, (255, 255, 255, 255)); out.alpha_composite(im); return out
roundel(512).save("public/icon-512.png"); roundel(192).save("public/icon-192.png")
roundel(512, pad_ratio=0.16, bg=BAR + (255,)).save("public/icon-maskable-512.png")
on_white(roundel(180, 0.04)).convert("RGB").save("public/apple-touch-icon.png"); on_white(roundel(180, 0.04)).convert("RGB").save("public/apple-touch-icon-precomposed.png")
on_white(roundel(225, 0.04)).convert("RGB").save("public/logo.png")
fav = roundel(64, 0.02); fav.save("public/favicon.png"); fav.save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
# The mark on its own, 400 x 320 like a crest, transparent: the cards draw it over their own green.
mark = Image.new("RGBA", (400, 320), (0, 0, 0, 0)); ball = roundel(300, 0.02, ring=False); mark.alpha_composite(ball, (50, 10)); mark.save("public/club-mark.webp", quality=90)
# A stand-in for a broken thumbnail: "Please stand by" on the club's deep colour.
td = Image.new("RGB", (360, 354), BAR); d = ImageDraw.Draw(td); d.ellipse([130, 60, 230, 160], fill=(232, 122, 36)); d.line([180, 60, 180, 160], fill=BAR, width=4); d.line([130, 110, 230, 110], fill=BAR, width=4)
from PIL import ImageFont
try: f = ImageFont.truetype("/usr/share/fonts/urw-base35/NimbusSansNarrow-Bold.otf", 34)
except OSError: f = ImageFont.load_default()
for i, line in enumerate(["TECHNICAL DIFFICULTIES", "PLEASE STAND BY"]):
    w = d.textlength(line, font=f); d.text(((360-w)/2, 200+i*44), line, font=f, fill=(255, 255, 255))
td.save("public/technical-difficulties.jpg", quality=85)
print("logo set written")
