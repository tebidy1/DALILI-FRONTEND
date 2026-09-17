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

/// حارس المسار: ‏localId من إنتاجنا حصرًا «f-<أرقام>» — لا اجتياح مجلدات من IPC
fn local_frame_path(local_id: &str) -> Result<String, String> {
    let digits = local_id.strip_prefix("f-").unwrap_or("");
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("localId غير صالح: {local_id}"));
    }
    Ok(std::env::temp_dir()
        .join("itqan-frames")
        .join(format!("{local_id}.jpg"))
        .display()
        .to_string())
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
    encode_jpeg(&path, &buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sensors::measure::{crop, mean_luma};

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
}
