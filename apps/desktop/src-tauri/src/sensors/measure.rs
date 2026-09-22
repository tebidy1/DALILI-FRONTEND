//! أدوات القياس النقيّة لقبول ٣ب-٦ — **المنقول بالاسم من السبايك**:
//! ‏`median` (سطران ٤٣٠–٤٣٣) · `crop` (٦٧١–٦٨٤) · `mean_luma` (٦٨٦–٦٩٢).
//! وحدة نقريّة مُختبَرة تخدم سكربت القياس الحيّ (examples/gate2m.rs).

/// مخزن بكسل ‏BGRA — هيكل السكربت المحليّ (مكافئ `CpuFrame` بلا ختم)
pub struct PixBuf {
    pub w: u32,
    pub h: u32,
    pub bgra: Vec<u8>,
}

/// المنقول `median` حرفيًّا: الوسيط ومئين ‏95 من عيّنة أزمنة (ميلي ثانية)
pub fn median(v: &mut [f64]) -> (f64, f64) {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (v[v.len() / 2], v[(v.len() * 95 / 100).min(v.len() - 1)])
}

/// المنقول `crop` حرفيًّا: مستطيل فرعي مُقيَّد بحدود المخزن (نسخ صفوفًا)
pub fn crop(f: &PixBuf, x: i32, y: i32, w: i32, h: i32) -> PixBuf {
    let x0 = x.clamp(0, f.w as i32) as u32;
    let y0 = y.clamp(0, f.h as i32) as u32;
    let x1 = (x + w).clamp(0, f.w as i32) as u32;
    let y1 = (y + h).clamp(0, f.h as i32) as u32;
    let (cw, ch) = (x1 - x0, y1 - y0);
    let mut out = vec![0u8; (cw * ch * 4) as usize];
    for row in 0..ch {
        let s = ((y0 + row) * f.w + x0) as usize * 4;
        let d = (row * cw) as usize * 4;
        out[d..d + (cw * 4) as usize].copy_from_slice(&f.bgra[s..s + (cw * 4) as usize]);
    }
    PixBuf { w: cw, h: ch, bgra: out }
}

/// المنقول `mean_luma` حرفيًّا: متوسّط الإضاءة ‏(B+G+R)/3 لكل البكسلات
pub fn mean_luma(f: &PixBuf) -> f64 {
    let mut sum = 0u64;
    for px in f.bgra.chunks_exact(4) {
        sum += (px[0] as u64 + px[1] as u64 + px[2] as u64) / 3;
    }
    sum as f64 / (f.w * f.h).max(1) as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// المنقول median: وسيط ومئين 95 — عيّنة معلومة مرتَّبة وعيّنة غير مرتَّبة
    #[test]
    fn الوسيط_والمئين_من_المنقول_حرفيا() {
        let mut v = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let (m, p95) = median(&mut v);
        assert_eq!((m, p95), (3.0, 5.0), "خمسة عناصر: الوسيط الثالث و95% الخامس");
        // غير مرتَّبة: الترتيب الداخلي جزء من المنقول — حتى عدد العناصر يأخذ
        // الوسيطَ الأعلى `v[len/2]` كما في السبايك حرفيًّا
        let mut v = vec![50.0, 10.0, 30.0, 20.0, 40.0, 60.0, 70.0, 80.0, 90.0, 100.0];
        let (m, p95) = median(&mut v);
        assert_eq!(m, 60.0, "عشرة عناصر: v[10/2] = v[5] بعد الترتيب");
        assert_eq!(p95, 100.0, "10*95/100 = 9 ⇒ العاشر");
        // عنصر واحد لا يخرج عن الحدود
        let mut v = vec![7.5];
        assert_eq!(median(&mut v), (7.5, 7.5));
    }

    /// المنقول crop: مستطيل داخلي دقيق + قيد الحدود عند الخروج عن المخزن
    #[test]
    fn القص_المنقول_نسخة_صفوف_مقيَّدة() {
        // ‏2×2 بكسل: (أسود، رمادي 100) بالصف الأول و(أبيض، رمادي 200) بالثاني
        let px = |g: u8| vec![g, g, g, 255];
        let mut bgra = px(0);
        bgra.extend(px(100));
        bgra.extend(px(255));
        bgra.extend(px(200));
        let f = PixBuf { w: 2, h: 2, bgra };
        // بكسل واحد: الزاوية السفلى اليسرى (الأبيض)
        let c = crop(&f, 0, 1, 1, 1);
        assert_eq!((c.w, c.h), (1, 1));
        assert_eq!(c.bgra, px(255));
        // الخروج عن الحدود يُقيَّد لا يُذعِر — صف كامل من الأعلى
        let c = crop(&f, 0, 0, 5, 1);
        assert_eq!((c.w, c.h), (2, 1), "العرض قُيِّد إلى 2");
        assert_eq!(&c.bgra[..4], &px(0)[..]);
        assert_eq!(&c.bgra[4..], &px(100)[..]);
        // مستطيل كامل خارج المخزن ⇐ مخزن فارغ بلا ذعر
        let c = crop(&f, 10, 10, 3, 3);
        assert_eq!((c.w, c.h), (0, 0));
        assert!(c.bgra.is_empty());
    }

    /// المنقول mean_luma: متوسّط الإضاءة على قيم معلومة
    #[test]
    fn متوسط_الإضاءة_منقول_بقيم_معلومة() {
        let px = |g: u8| vec![g, g, g, 255];
        let mut bgra = px(0);
        bgra.extend(px(100));
        bgra.extend(px(200));
        bgra.extend(px(255));
        let f = PixBuf { w: 2, h: 2, bgra };
        assert!((mean_luma(&f) - 138.75).abs() < 1e-9, "‏(0+100+200+255)/4 = 138.75");
        // مخزن فارغ: القاسم محميّ ‏max(1) — صفر بلا ذعر
        let e = PixBuf { w: 0, h: 0, bgra: vec![] };
        assert_eq!(mean_luma(&e), 0.0);
    }
}
