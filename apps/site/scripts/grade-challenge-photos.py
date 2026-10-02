# -*- coding: utf-8 -*-
"""معالجة صور التحديات لتنتمي للهوية:
١) قص ٣:٢ بإزاحة أفقية لكل صورة · ٢) العنصر الأحمر الوحيد يُنقل إلى لون الألف #8A5447
٣) بقية المشهد تُخفَّض تشبّعها وتُدفَّأ نحو ورق/جرافيت الهوية · ٤) تصدير 1440×960 JPEG."""
from PIL import Image, ImageChops, ImageFilter, ImageEnhance, ImageOps
import os, sys
SRC = r"D:\TM-SOOT NOTE\itqan-challenges"
DST = r"D:\ideas testing\dalili\apps\site\assets\challenges"
os.makedirs(DST, exist_ok=True)
ROI = dict(
    expert=[(0.66, 0.40, 0.95, 1.0)],
    onboarding=[(0.46, 0.47, 0.64, 0.90), (0.30, 0.84, 0.58, 1.0)],
    interruptions=[(0.25, 0.78, 0.44, 0.97)],
    consistency=[(0.0, 0.54, 1.0, 0.70)],
    quality=[(0.38, 0.64, 0.50, 0.86)],
    tomorrow=[(0.80, 0.32, 0.96, 0.50)],
)
OFFSET = dict(expert=160, onboarding=320, interruptions=160, consistency=160, quality=120, tomorrow=200)

def ramp(lo, hi):
    return [0 if v <= lo else 255 if v >= hi else int(255 * (v - lo) / (hi - lo)) for v in range(256)]

def grade(name):
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGB")
    w, h = im.size
    cw = int(h * 3 / 2)
    x = min(OFFSET[name] * w // 2048, w - cw)
    im = im.crop((x, 0, x + cw, h))

    H, S, V = im.convert("HSV").split()
    # قناع العنصر الأحمر: تدرّج أحمر (حول الصفر) × تشبّع مرتفع × ليس شديد الإضاءة
    mh = H.point([255 if (v <= 7 or v >= 236) else 0 for v in range(256)])
    ms = S.point(ramp(36, 66))
    mv = V.point([255 if 18 <= v <= 225 else 0 for v in range(256)])
    mask = ImageChops.multiply(ImageChops.multiply(mh, ms), mv)
    # العنصر معروف الموضع في كل صورة: القناع يُحصر في مستطيلاته (فلا يلتقط شفاهًا ولا خشبًا)
    roi = Image.new("L", im.size, 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(roi)
    for (x0, y0, x1, y1) in ROI[name]:
        d.rectangle((x0 * cw, y0 * h, x1 * cw, y1 * h), fill=255)
    roi = roi.filter(ImageFilter.GaussianBlur(8))
    mask = ImageChops.multiply(mask, roi)
    # إغلاق الثقوب داخل العنصر ثم تنعيم الحافة
    mask = mask.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MinFilter(15))
    mask = mask.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.8))

    # (أ) العنصر بلون الألف تمامًا: الإضاءة تُسقط على سلّم الألف (ظل ← #8A5447 ← ضوء)
    g = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=0) if False else ImageOps.grayscale(im)
    g = g.point([min(255, int(v * 1.25 + 22)) for v in range(256)])
    accent = ImageOps.colorize(g, black=(44, 24, 20), white=(222, 178, 164), mid=(138, 84, 71))

    # (ب) المشهد: تشبّع منخفض + دفء خفيف نحو ورق/جرافيت الهوية
    base = ImageEnhance.Color(im).enhance(0.42)
    tone = ImageOps.colorize(ImageOps.grayscale(im), black=(34, 33, 29), white=(246, 243, 234), mid=(150, 145, 134))
    base = Image.blend(base, tone, 0.34)
    base = ImageEnhance.Contrast(base).enhance(1.06)

    out = Image.composite(accent, base, mask)
    out = out.resize((1440, 960), Image.LANCZOS)
    out.save(os.path.join(DST, name + ".jpg"), quality=84, optimize=True, progressive=True)
    cov = sum(mask.resize((160, 107)).tobytes()) / 255 / (160 * 107)
    print(name, out.size, os.path.getsize(os.path.join(DST, name + ".jpg")) // 1024, "KB", "mask %.2f%%" % (cov * 100))
    return out, mask

names = ["expert", "onboarding", "interruptions", "consistency", "quality", "tomorrow"]
sheet = Image.new("RGB", (720 * 2, 480 * 3), "white")
msheet = Image.new("L", (720 * 2, 480 * 3), 0)
for i, n in enumerate(names):
    o, m = grade(n)
    sheet.paste(o.resize((720, 480)), ((i % 2) * 720, (i // 2) * 480))
    msheet.paste(m.resize((720, 480)), ((i % 2) * 720, (i // 2) * 480))
sheet.save("graded-sheet.jpg", quality=85)
msheet.save("graded-mask.jpg", quality=70)
