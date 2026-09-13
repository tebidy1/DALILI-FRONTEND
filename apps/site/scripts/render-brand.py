"""
مولّد أصول علامة «إتقان» — من نفس مسارات الشعار في الموقع، بلا شبكة وبلا مكتبات خارجية (PIL فقط).

    python apps/site/scripts/render-brand.py

يكتب في apps/site/assets/brand/:
  itqan-mark.png              الشعار على أرضية الورق
  itqan-mark-transparent.png  الشعار بخلفية شفافة
  itqan-lockup.png            القفل الكامل (الشعار + ACTIVE. SOP + الخطّان) على الورق
  itqan-lockup-transparent.png

الطريقة: تسطيح منحنيات بيزييه إلى نقاط كثيفة، ثم دوائر بنصف قطر = نصف عرض القلم
(فتنتج نهايات ووصلات مستديرة مطابقة لـ stroke-linecap/linejoin="round")، مع
تكبير ×3 ثم تصغير LANCZOS لحوافّ نظيفة. السطر اللاتيني يُرسم بخطّ النظام
(Arial) لأنه حروف لاتينية بلا تشكيل — والنسخة المرجعية للتراك هي CSS في الموقع.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "brand"

VB = (176, 48, 421, 204)          # إطار الشعار، مضبوط على الحبر بهامش ١٤ وحدة
GROUND = (246, 245, 242, 255)     # #F6F5F2
INK = (43, 42, 38, 255)           # #2B2A26
CLAY = (138, 84, 71, 255)         # #8A5447
RULE = (185, 179, 166, 255)       # #B9B3A6

# (نوع المسار، النقاط، عرض القلم بوحدات viewBox، اللون)
PATHS = [
    ("C", [(574, 66), (570, 102), (575, 144), (572, 185)], 6, INK),          # إ
    ("C", [(579, 207), (567, 199), (558, 208), (565, 216)], 5, INK),         # الهمزة
    ("L", [(565, 216), (578, 216), (560, 226)], 5, INK),
    ("C", [(540, 148), (546, 169), (531, 185), (508, 185)], 6, INK),         # ت
    ("L", [(508, 185), (449, 185)], 6, INK),
    ("L", [(519, 124), (518, 126)], 8, INK),
    ("L", [(502, 124), (501, 126)], 8, INK),
    ("C", [(449, 185), (466, 175), (466, 145), (449, 143)], 6, INK),         # ق
    ("C", [(449, 143), (430, 140), (428, 168), (445, 174)], 6, INK),
    ("C", [(445, 174), (449, 176), (453, 177), (457, 176)], 6, INK),
    ("L", [(452, 116), (451, 118)], 8, INK),
    ("L", [(435, 116), (434, 118)], 8, INK),
    ("C", [(312, 148), (319, 175), (317, 205), (295, 220)], 6, INK),         # ن
    ("C", [(295, 220), (270, 239), (222, 239), (203, 215)], 6, INK),
    ("C", [(203, 215), (191, 200), (192, 183), (198, 168)], 6, INK),
    ("L", [(257, 151), (256, 153)], 8, INK),
    ("C", [(449, 185), (428, 186), (400, 186), (376, 184)], 6, INK),         # امتداد القاف
    ("C", [(373, 66), (371, 103), (374, 142), (376, 184)], 7, CLAY),         # الألف
]

LATIN_FONT = "C:/Windows/Fonts/arial.ttf"
TRACK_EM = 0.30        # التراك نفسه المستعمل في الموقع
WORD_EM = 0.55         # مسافة الكلمة بعد النقطة
FS_RATIO = 0.0425      # حجم الخط = عرض الشعار × هذه النسبة
GAP_RATIO = 0.032      # فجوة بين الخط الرفيع والسطر
TOP_RATIO = 0.05       # مسافة القفل تحت الشعار


def bezier(p0, p1, p2, p3, n=260):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((
            u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
            u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1],
        ))
    return out


def polyline(pts, n=140):
    out = []
    for a, b in zip(pts, pts[1:]):
        out += [(a[0] + (b[0]-a[0])*i/n, a[1] + (b[1]-a[1])*i/n) for i in range(n + 1)]
    return out


def draw_mark(d, scale, ox, oy, ss):
    """يرسم الشعار؛ (ox, oy) ركن إطار الشعار بالبكسل المكبَّر."""
    vx, vy = VB[0], VB[1]
    for kind, pts, w, col in PATHS:
        samples = bezier(*pts) if kind == "C" else polyline(pts)
        r = (w*scale/2) * ss
        for (x, y) in samples:
            px = (x - vx)*scale*ss + ox
            py = (y - vy)*scale*ss + oy
            d.ellipse([px-r, py-r, px+r, py+r], fill=col)


def tracked(d, text, font, x, y, fill, track):
    """يكتب نصًّا بتراك ثابت بعد كل حرف، ويعيد العرض المرسوم (بلا التراك المعلّق)."""
    cur = x
    for i, ch in enumerate(text):
        d.text((cur, y), ch, font=font, fill=fill, anchor="ls")
        cur += d.textlength(ch, font=font) + (track if i < len(text) - 1 else 0)
    return cur - x


def measure(d, text, font, track):
    w = sum(d.textlength(c, font=font) for c in text)
    return w + track*(len(text) - 1)


def render(mark_px=1400, pad=130, ss=3, lockup=False, transparent=False, out="out.png"):
    vw, vh = VB[2], VB[3]
    scale = mark_px / vw
    mark_h = vh * scale
    lock_h = mark_px * TOP_RATIO + mark_px * FS_RATIO * 1.5 if lockup else 0
    W = int(mark_px + pad*2)
    H = int(mark_h + lock_h + pad*2)
    bg = (0, 0, 0, 0) if transparent else GROUND
    img = Image.new("RGBA", (W*ss, H*ss), bg)
    d = ImageDraw.Draw(img)
    draw_mark(d, scale, pad*ss, pad*ss, ss)

    if lockup:
        fs = mark_px * FS_RATIO * ss
        font = ImageFont.truetype(LATIN_FONT, int(round(fs)))
        track = TRACK_EM * fs
        a, b = "ACTIVE.", "SOP"
        wa, wb = measure(d, a, font, track), measure(d, b, font, track)
        total = wa + WORD_EM*fs + wb
        left = pad*ss + (mark_px*ss - total)/2
        baseline = (pad + mark_h + mark_px*TOP_RATIO)*ss + fs*0.72
        tracked(d, a, font, left, baseline, CLAY, track)
        tracked(d, b, font, left + wa + WORD_EM*fs, baseline, INK, track)
        # الخطّان: يملآن ما تبقّى من عرض الشعار بالضبط
        mid = baseline - fs*0.36
        gap = mark_px*GAP_RATIO*ss
        lw = max(1, round(1.4*scale*ss/3))
        d.rectangle([pad*ss, mid-lw/2, left-gap, mid+lw/2], fill=RULE)
        d.rectangle([left+total+gap, mid-lw/2, (pad+mark_px)*ss, mid+lw/2], fill=RULE)

    img = img.resize((W, H), Image.LANCZOS)
    path = OUT / out
    if transparent:
        img.save(path)
    else:
        img.convert("RGB").save(path)
    return path.name, img.size


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for kw in (
        dict(out="itqan-mark.png"),
        dict(out="itqan-mark-transparent.png", transparent=True),
        dict(out="itqan-lockup.png", lockup=True),
        dict(out="itqan-lockup-transparent.png", lockup=True, transparent=True),
    ):
        print(*render(**kw))
