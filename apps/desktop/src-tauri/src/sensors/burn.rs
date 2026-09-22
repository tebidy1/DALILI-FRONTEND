//! حرق التمويه على الجهاز (٣ج-٤) — بكسلات الحقل الحسّاس لا تغادر الجهاز قطّ.
//! ‏TS يقرّر المستطيلات (سياسة) وRust يحرقها (آليّة): يقرأ JPEG المؤقّت من مخزن
//! `frame_pick` (%TEMP%\itqan-frames)، يملأ كل مستطيل بمتوسّطه الصندوقيّ، ويعيد
//! كتابته بـ`jpeg-encoder` القائم نفسه. لا بنية دليل هنا ولا قراءة JSON دليل
//! (القاعدة الذهبيّة) ولا شبكة. الحرق الخادميّ (api/burn.ts) لطمسات المحرّر ولا
//! يُكرَّر هنا — هذا حرق الالتقاط التلقائيّ حصرًا.

use jpeg_encoder::{ColorType, Encoder};
use zune_core::colorspace::ColorSpace;
use zune_core::options::DecoderOptions;
use zune_jpeg::JpegDecoder;

use crate::sensors::measure::PixBuf;
// جذر مخزن الإطارات المؤقّت — المصدر الوحيد للمسار في ‏transport::queue
use crate::transport::queue::frames_dir;

/// مستطيل حرق ببكسل الصورة (بعد طرح أصل الشاشة في الجلسة) — توأم TS
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct BurnRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// تمويه صندوقيّ نقيّ: كل بكسل داخل المستطيل يصير متوسّط المنطقة قناةً قناة
/// (منعتان: مجموعٌ ثم ملء — لا انحياز اتّجاه). ‏BGRA مضغوط 4 بايت/بكسل؛
/// الألفا كما هي، والخارج عن المستطيل **لا يتغيّر بايتًا**، والمستطيل يُقيَّد
/// بحدود الصورة بلا ذعر (نمط crop في measure).
pub fn box_blur_region(pixels: &mut [u8], w: u32, h: u32, rect: BurnRect) {
    let (x0, y0) = (rect.x.min(w) as usize, rect.y.min(h) as usize);
    let (x1, y1) = (
        rect.x.saturating_add(rect.w).min(w) as usize,
        rect.y.saturating_add(rect.h).min(h) as usize,
    );
    if x1 <= x0 || y1 <= y0 {
        return;
    }
    let stride = w as usize * 4;
    if pixels.len() < y1 * stride {
        return;
    }
    let count = ((x1 - x0) * (y1 - y0)) as u64;
    let mut sum = [0u64; 3];
    for y in y0..y1 {
        for x in x0..x1 {
            let p = y * stride + x * 4;
            sum[0] += pixels[p] as u64;
            sum[1] += pixels[p + 1] as u64;
            sum[2] += pixels[p + 2] as u64;
        }
    }
    let avg = [(sum[0] / count) as u8, (sum[1] / count) as u8, (sum[2] / count) as u8];
    for y in y0..y1 {
        for x in x0..x1 {
            let p = y * stride + x * 4;
            pixels[p] = avg[0];
            pixels[p + 1] = avg[1];
            pixels[p + 2] = avg[2];
        }
    }
}

/// حارس المعرّف: ‏localId من إنتاجنا حصرًا «f-<أرقام>» — لا اجتياح مجلدات من IPC
fn validate_local_id(local_id: &str) -> Result<(), String> {
    let digits = local_id.strip_prefix("f-").unwrap_or("");
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("localId غير صالح: {local_id}"));
    }
    Ok(())
}

/// حارس المسار: يبني مسار إطار المخزن بعد فحص المعرّف
fn local_frame_path(local_id: &str) -> Result<String, String> {
    validate_local_id(local_id)?;
    Ok(frames_dir()
        .join(format!("{local_id}.jpg"))
        .display()
        .to_string())
}

/// ترميز base64 قياسي (RFC 4648 بحشو) بلا تبعيّة جديدة — الحزم ثابتة،
/// والوظيفة عرض JPEG في webview حصرًا. ٣ بايتات ⇐ ٤ محارف والباقي «=».
pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = ((chunk[0] as u32) << 16)
            | ((*chunk.get(1).unwrap_or(&0) as u32) << 8)
            | (*chunk.get(2).unwrap_or(&0) as u32);
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

/// عرض المصغّرة الصغيرة المستهدف — بطاقة اللقطة ٢٤٠ منطقيّة فـ٤٨٠ بكسل
/// تكفي بهامش شبكية، والسلك يهبط من ميغابايتات الإطار الكامل إلى عشرات KB
pub const THUMB_TARGET_W: u32 = 480;

/// مسار المصغّرة الصغيرة لإطار — توأم `frame_path` في capture بلاحقة ‎.thumb
pub fn thumb_frame_path(local_id: &str) -> Result<String, String> {
    validate_local_id(local_id)?;
    Ok(frames_dir()
        .join(format!("{local_id}.thumb.jpg"))
        .display()
        .to_string())
}

/// تصغير صندوقيّ نقيّ: كل بكسل خرجٍ = متوسّط كتلته ‏(stride×stride) — نصّ
/// الشاشة يبقى مقروءًا في البطاقة بدل عيّنة أخذ تُغلّف النصّ الرقيق. أصغر
/// من الهدف أو صفر الأبعاد ⇐ كما هي بلا نسخ (لا عمل لا معنى له)
pub fn downscale_bgra(w: u32, h: u32, bgra: &[u8], target_w: u32) -> PixBuf {
    if w == 0 || h == 0 || w <= target_w {
        return PixBuf { w, h, bgra: bgra.to_vec() };
    }
    let stride = (w / target_w).max(2) as usize;
    let out_w = w as usize / stride;
    let out_h = h as usize / stride;
    let in_w = w as usize;
    let mut out = vec![0u8; out_w * out_h * 4];
    for oy in 0..out_h {
        for ox in 0..out_w {
            let (mut r, mut g, mut b) = (0u64, 0u64, 0u64);
            for sy in 0..stride {
                let row = (oy * stride + sy) * in_w;
                for sx in 0..stride {
                    let p = (row + ox * stride + sx) * 4;
                    r += bgra[p] as u64;
                    g += bgra[p + 1] as u64;
                    b += bgra[p + 2] as u64;
                }
            }
            let n = (stride * stride) as u64;
            let q = (oy * out_w + ox) * 4;
            out[q] = (r / n) as u8;
            out[q + 1] = (g / n) as u8;
            out[q + 2] = (b / n) as u8;
            out[q + 3] = 255;
        }
    }
    PixBuf { w: out_w as u32, h: out_h as u32, bgra: out }
}

/// كتابة المصغّرة الصغيرة للبطاقة الحيّة — تكتب عند `pick` من الذاكرة وتُعاد
/// كتابتها بعد الحرق فلا بكسل حسّاس يصل البطاقة أبدًا. فشلُها مقبول: قراءة
/// `frame_thumb` تسقط للملفّ الكامل
pub fn write_thumb(local_id: &str, w: u32, h: u32, bgra: &[u8]) -> Result<(), String> {
    let small = downscale_bgra(w, h, bgra, THUMB_TARGET_W);
    let path = thumb_frame_path(local_id)?;
    let _ = std::fs::create_dir_all(frames_dir());
    encode_jpeg(&path, &small)
}

/// بايتات الإطار المؤقّت data URL للودجة (المرحلة ١: مصغّرة الخطوة الأحدث) —
/// نقيّة (الجذر محقون) وقابلة للاختبار، **بلا فكّ ترميز ولا تحجيم**: الإحداثيّات
/// في TS تعمل على أبعاد الصورة الطبيعيّة مباشرةً
fn read_frame_data_url(frames_root: &std::path::Path, local_id: &str) -> Result<String, String> {
    validate_local_id(local_id)?;
    let path = frames_root.join(format!("{local_id}.jpg"));
    let bytes = std::fs::read(&path).map_err(|e| format!("تعذّر قراءة الإطار: {e}"))?;
    Ok(format!("data:image/jpeg;base64,{}", base64_encode(&bytes)))
}

/// ردّ المصغّرة على السلك — camelCase: { dataUrl }
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbDto {
    pub data_url: String,
}

/// `frame_thumb(localId)` — بكسلات اللقطة المؤقّتة للودجة (خامٌ يمرّ، لا فهم
/// دليل). المصغّرة الصغيرة أوّلًا (سلك أخفّ للبطاقة الحيّة — بلاغ المالك:
/// لا انتظار) وسقوطٌ للملفّ الكامل لإطاراتٍ أقدم من صيغة المصغّرة
pub fn frame_thumb(local_id: &str) -> Result<ThumbDto, String> {
    validate_local_id(local_id)?;
    let thumb = frames_dir().join(format!("{local_id}.thumb.jpg"));
    if let Ok(bytes) = std::fs::read(&thumb) {
        return Ok(ThumbDto { data_url: format!("data:image/jpeg;base64,{}", base64_encode(&bytes)) });
    }
    let root = frames_dir();
    Ok(ThumbDto { data_url: read_frame_data_url(&root, local_id)? })
}

/// فكّ JPEG → مخزن ‏BGRA (نفس صيغة الالتقاط في capture حصرًا)
fn decode_bgra(jpeg: &[u8]) -> Result<PixBuf, String> {
    let opts = DecoderOptions::default().jpeg_set_out_colorspace(ColorSpace::BGRA);
    let mut dec = JpegDecoder::new_with_options(jpeg, opts);
    let bgra = dec.decode().map_err(|e| format!("فكّ الإطار: {e}"))?;
    let info = dec.info().ok_or("إطار بلا معلومات")?;
    Ok(PixBuf { w: info.width as u32, h: info.height as u32, bgra })
}

/// كتابة JPEG بنفس مسار `save_jpeg` في capture (جودة 85، ‏BGRA)
fn encode_jpeg(path: &str, buf: &PixBuf) -> Result<(), String> {
    let enc = Encoder::new_file(path, 85).map_err(|e| format!("كتابة الإطار: {e}"))?;
    enc.encode(&buf.bgra, buf.w as u16, buf.h as u16, ColorType::Bgra)
        .map_err(|e| format!("ترميز الإطار: {e}"))
}

/// `frame_blur(localId, rects)` — يقرأ الملفّ ويحرق كل مستطيل ويعيد كتابته مكانه
pub fn blur_frame(local_id: &str, rects: &[BurnRect]) -> Result<(), String> {
    let path = local_frame_path(local_id)?;
    let jpeg = std::fs::read(&path).map_err(|e| format!("قراءة الإطار: {e}"))?;
    let mut buf = decode_bgra(&jpeg)?;
    for r in rects {
        box_blur_region(&mut buf.bgra, buf.w, buf.h, *r);
    }
    encode_jpeg(&path, &buf)?;
    // المصغّرة تُعاد كتابتها من المخزن المحروق حصرًا — لو بقيت من لحظة
    // `pick` لبقيت بكسلات الحقل الحسّاس ظاهرةً في البطاقة الحيّة
    let _ = write_thumb(local_id, buf.w, buf.h, &buf.bgra);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sensors::measure::{crop, mean_luma};

    /// التصغير الصندوقي: نصف أحمر ونصف أزرق ⇒ الكتل الوسطى متوسّط صادق
    /// والأبعاد هدفيّة، والأصغر من الهدف يعود بلا نسخ
    #[test]
    fn التصغير_الصندوقي_يوسط_الكتل_وصغير_الهدف_كما_هو() {
        // ‏8×2: أعمدة 0..4 حمراء خالصة وأعمدة 4..8 زرقاء خالصة
        let (w, h) = (8u32, 2u32);
        let mut bgra = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let p = (y * w + x) as usize * 4;
                if x < 4 {
                    bgra[p] = 0;
                    bgra[p + 1] = 0;
                    bgra[p + 2] = 255; // أحمر بصيغة ‏BGRA
                } else {
                    bgra[p] = 255;
                    bgra[p + 1] = 0;
                    bgra[p + 2] = 0; // أزرق
                }
                bgra[p + 3] = 255;
            }
        }
        let small = downscale_bgra(w, h, &bgra, 4);
        // ‏stride=2 ⇒ الخرج 4×1: عمودان من متوسّط الأحمر الخالص وعمودان من الأزرق
        assert_eq!((small.w, small.h), (4, 1));
        for (i, expect) in [(0usize, 255u8), (1, 255), (2, 0), (3, 0)] {
            assert_eq!(small.bgra[i * 4 + 2], expect, "قناة الأحمر للعمود {i}");
        }
        // قناة الأزرق: النصف الأيسر معدوم والنصف الأيمن خالص
        assert_eq!([small.bgra[0], small.bgra[4]], [0u8, 0u8]);
        assert_eq!([small.bgra[8], small.bgra[12]], [255u8, 255u8]);
        // أصغر من الهدف ⇐ كما هي حرفيًّا (بلا عمل)
        let tiny = PixBuf { w: 100, h: 50, bgra: vec![7u8; 100 * 50 * 4] };
        let same = downscale_bgra(tiny.w, tiny.h, &tiny.bgra, 480);
        assert_eq!((same.w, same.h), (100, 50));
        assert_eq!(same.bgra, tiny.bgra);
    }

    /// المصغّرة الصغيرة تُفضَّل في `frame_thumb` وسقوطٌ صادق للملفّ الكامل
    /// بمعرّفٍ فريد كي لا تتسابق الاختبارات المتوازية على الاسم
    #[test]
    fn مصغرة_اللوحة_تفضل_الملف_الصغير_وتسقط_للكامل() {
        let id = "f-987654";
        let root = frames_dir();
        let _ = std::fs::create_dir_all(&root);
        let full = root.join(format!("{id}.jpg"));
        let thumb = root.join(format!("{id}.thumb.jpg"));
        std::fs::write(&thumb, b"THUMB-BYTES").unwrap();
        std::fs::write(&full, b"FULL-BYTES").unwrap();
        let dto = frame_thumb(id).unwrap();
        assert!(
            dto.data_url.ends_with(&base64_encode(b"THUMB-BYTES")),
            "المصغّرة الصغيرة هي المُقرأة: {}",
            &dto.data_url[..40]
        );
        // بلا مصغّرة ⇐ سقوط للكامل (إطارات أقدم من الصيغة)
        std::fs::remove_file(&thumb).unwrap();
        let dto2 = frame_thumb(id).unwrap();
        assert!(dto2.data_url.ends_with(&base64_encode(b"FULL-BYTES")));
        let _ = std::fs::remove_file(&full);
    }

    /// مسار المصغّرة بتوأم ‎.thumb.jpg وبحارس المعرّف نفسه (لا اجتياح مجلدات)
    #[test]
    fn مسار_المصغرة_بلاحقة_thumb_وحارس_المعرف_يرفض_الاجتياح() {
        let p = thumb_frame_path("f-42").unwrap();
        assert!(p.ends_with("f-42.thumb.jpg"), "{p}");
        assert!(p.contains("itqan-frames"), "{p}");
        assert!(thumb_frame_path("f-../x").is_err());
        assert!(thumb_frame_path("thumb").is_err());
    }

    /// تباين الإضاءة على مخزن — مقياس «انهيار التمويه» كما أمرت كتلة التسليم
    fn var_luma(f: &PixBuf) -> f64 {
        let m = mean_luma(f);
        let n = (f.w * f.h).max(1) as f64;
        let mut s = 0.0;
        for px in f.bgra.chunks_exact(4) {
            let d = ((px[0] as u64 + px[1] as u64 + px[2] as u64) / 3) as f64 - m;
            s += d * d;
        }
        s / n
    }

    fn checker(w: u32, h: u32, a: u8, b: u8) -> PixBuf {
        let mut bgra = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let v = if (x + y) % 2 == 0 { a } else { b };
                let p = (y * w + x) as usize * 4;
                bgra[p] = v;
                bgra[p + 1] = v;
                bgra[p + 2] = v;
                bgra[p + 3] = 255;
            }
        }
        PixBuf { w, h, bgra }
    }

    /// جوهر الحرق: داخل المستطيل ينهار التباين إلى صفر (متوسّط صندوقيّ ثابت)،
    /// والخارج عنه لا يتغيّر بايتًا
    #[test]
    fn الحرق_ينهار_تباين_المنطقة_والخارج_ثابت_بايتًا() {
        let (w, h) = (8u32, 8u32);
        let mut buf = checker(w, h, 20, 230);
        let before = buf.bgra.clone();
        let rect = BurnRect { x: 2, y: 2, w: 3, h: 3 };
        box_blur_region(&mut buf.bgra, w, h, rect);

        // الخارج بايتًا بايتًا كما كان
        for y in 0..h as usize {
            for x in 0..w as usize {
                let inside = x >= 2 && x < 5 && y >= 2 && y < 5;
                if !inside {
                    let p = y * w as usize * 4 + x * 4;
                    assert_eq!(
                        &buf.bgra[p..p + 4],
                        &before[p..p + 4],
                        "بكسل خارج المستطيل ({x},{y}) تغيّر"
                    );
                }
            }
        }
        // الداخل: متوسّط صندوقيّ ثابت ⇐ تباين صفر، وقيمة المتوسّط نفسها لكل البكسلات
        let region = crop(&buf, 2, 2, 3, 3);
        assert!(var_luma(&region) < 1e-9, "تباين المنطقة بعد الحرق: {}", var_luma(&region));
        let first = &region.bgra[0..3];
        for px in region.bgra.chunks_exact(4) {
            assert_eq!(&px[0..3], first, "كل بكسلات المنطقة متوسّطٌ واحد");
        }
        // الألفا لم تُلمَس
        for px in region.bgra.chunks_exact(4) {
            assert_eq!(px[3], 255);
        }
    }

    /// مستطيل خارج الحدود أو مُقسَّم جزئيًّا ⇐ تقييد بلا ذعر (نمط crop)
    #[test]
    fn المستطيل_الخارج_عن_الحدود_يقيد_بلا_ذعر() {
        let (w, h) = (4u32, 4u32);
        let mut buf = checker(w, h, 10, 200);
        let before = buf.bgra.clone();
        // مستطيل يمتد خارج اليمين والأسفل: الجزء الداخلي فقط يحترق
        box_blur_region(&mut buf.bgra, w, h, BurnRect { x: 2, y: 2, w: 9, h: 9 });
        // (2,2)..(4,4) داخل الصورة صارت متوسّطًا واحدًا
        let region = crop(&buf, 2, 2, 2, 2);
        assert!(var_luma(&region) < 1e-9);
        // خارجها بايتًا بايتًا ثابت
        for y in 0..2usize {
            for x in 0..2usize {
                let p = y * 4 * 4 + x * 4;
                assert_eq!(&buf.bgra[p..p + 4], &before[p..p + 4]);
            }
        }
        // مستطيل كله خارج ⇐ لا شيء يتغيّر إطلاقًا
        let mut buf2 = checker(w, h, 10, 200);
        box_blur_region(&mut buf2.bgra, w, h, BurnRect { x: 10, y: 10, w: 3, h: 3 });
        assert_eq!(buf2.bgra, before);
    }

    /// حارس المسار: ‏localId أرقامٌ بعد f- حصرًا — أي اجتياح مسار يُرَدّ خطأً
    #[test]
    fn مسار_المعرّف_يحرس_من_اجتياح_المجلدات() {
        let p = local_frame_path("f-42").unwrap();
        assert!(p.ends_with("f-42.jpg") && p.contains("itqan-frames"), "{p}");
        for bad in ["../evil", "f-1x", "f-", "", "x-1", "f-1/2"] {
            assert!(local_frame_path(bad).is_err(), "«{bad}» يجب أن يُرَدّ");
        }
    }

    /// دخان frame_blur على ملفّ تركيبيّ في المخزن نفسه: يعاد كتابته والمنطقة
    /// المحروقة تباينها انهار والخارج ما يزال عالي التباين (JPEG هوزيّ بمحاذاة آمنة)
    #[test]
    fn دخان_حرق_الملف_يعيد_كتابته_مموها_المنطقة() {
        let id = "f-990001";
        let path = local_frame_path(id).unwrap();
        std::fs::create_dir_all(std::path::Path::new(&path).parent().unwrap()).unwrap();
        let (w, h) = (32u32, 32u32);
        let buf = checker(w, h, 20, 230);
        encode_jpeg(&path, &buf).unwrap();

        blur_frame(id, &[BurnRect { x: 8, y: 8, w: 16, h: 16 }]).expect("الحرق يجب أن ينجح");

        let jpeg2 = std::fs::read(&path).unwrap();
        let buf2 = decode_bgra(&jpeg2).unwrap();
        // داخل هامش الحدود: تباين شبه منتهٍ (JPEG قد يهزّ قيمًا وحدات)
        let inside = crop(&buf2, 10, 10, 12, 12);
        assert!(
            var_luma(&inside) < 5.0,
            "تباين المنطقة المحروقة بعد إعادة الكتابة: {}",
            var_luma(&inside)
        );
        // ركن بعيد عن المستطيل: رقعة الشطرنج ما زالت عالية التباين
        let outside = crop(&buf2, 0, 0, 4, 4);
        assert!(
            var_luma(&outside) > 1000.0,
            "تباين الخارج انهار أيضًا — الحرق اجتاح حدوده: {}",
            var_luma(&outside)
        );
        let _ = std::fs::remove_file(&path);
    }

    /// جذر مؤقّت فريد لاختبار المصغّرة — بلا تبعيّة tempfile (الحزم ثابتة)
    fn thumb_test_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("itqan-thumb-tests-{}-{tag}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// المصغّرة: بايتات الإطار تصل الـwebview data URL بلا فكّ ولا تحجيم —
    /// مطابقة سلسلة متوقعة حرفيًّا (بتّيّة أقوى من فكّ ترميز في الاختبار)
    #[test]
    fn المصغّرة_تقرأ_الإطار_رمزه_بيانات_مطابقةً() {
        let dir = thumb_test_dir("ok");
        let bytes: [u8; 7] = [0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02, 0x03]; // بادئة JPEG + حشو
        std::fs::write(dir.join("f-77.jpg"), bytes).unwrap();
        let url = read_frame_data_url(&dir, "f-77").unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"), "{url}");
        // ‏FFD8FFE0010203 ⇒ «/9j/4AEC» ثم «Aw==» لحشو البايت الأخير (RFC 4648)
        assert_eq!(url, "data:image/jpeg;base64,/9j/4AECAw==");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ترميز base64 على حدود المجموعات: ٣ بايتات (بلا حشو) و٢ وبايت واحد
    #[test]
    fn ترميز_القاعدة_على_حدود_المجموعات_صحيح() {
        assert_eq!(base64_encode(&[0xFB, 0xFF, 0xBF]), "+/+/");
        assert_eq!(base64_encode(&[0xFB, 0xFF]), "+/8=");
        assert_eq!(base64_encode(&[0xFB]), "+w==");
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"Man"), "TWFu");
    }

    /// حارس المصغّرة نفسه: localId خارج إنتاجنا يُرَدّ خطأً لا يقرأ شيئًا
    #[test]
    fn حارس_المصغّرة_يرفض_اجتياح_المسار() {
        let dir = thumb_test_dir("guard");
        assert!(read_frame_data_url(&dir, "../secret").is_err());
        assert!(read_frame_data_url(&dir, "f-").is_err());
        assert!(read_frame_data_url(&dir, "x-1").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
