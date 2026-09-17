//! سياسة النقل §٣.٥ — دوالّ نقية حاكمة لسلوك الطابور: تصنيف ردّ الخادم
//! والتراجع الأُسّي. بلا شبكة ولا I/O ولا حالة — تُختبَر صفًّا صفًّا ضدّ
//! جدول §٣.٥ في الخطّة الأمّ (تُنتَج كما هي، لا تُغيَّر).

use std::time::Duration;

/// قاعدة التراجع: ثانيتان
pub const BACKOFF_BASE_MS: u64 = 2_000;
/// سقف التراجع الصلب: 5 دقائق — لا يتجاوزه مهما تزايدت المحاولة
pub const BACKOFF_CAP_MS: u64 = 300_000;

/// فعل الطابور بعد ردّ الخادم — قلب أمان §٣.٥ (لا فقد بيانات في كل الفروع)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// 200 — نجح: احذف العنصر وابثّ
    Done,
    /// 401 — الرمز أُبطل: احذف الاعتماد وأوقف الطابور وابثّ ‏auth://lost،
    /// **لا تحذف العناصر** (تُستأنف بعد إعادة الاقتران)
    AuthLost,
    /// 409 — تعارض مفتاح: أعد بعد 3 ثوانٍ بالمفتاح نفسه
    RetrySoon,
    /// 400/413 — فشل نهائيّ: علِّم العنصر failed بسبب عربيّ
    Failed,
    /// 429/5xx/انقطاع شبكة (يُمثَّل 0) — تراجع أُسّي وأعد
    Backoff,
    /// 428 — بانتظار الموافقة: استطلع كل interval
    Pending,
}

/// تصنيف رمز الحالة وفق جدول §٣.٥ حرفيًّا. كل ما لم يُسمَّ (404 مثلًا)
/// يُعامَل انقطاعًا عابرًا (تراجع) — الأأمن: لا فشل نهائيّ زائف ولا نجاح زائف
pub fn classify_response(status: u16) -> Action {
    match status {
        200 => Action::Done,
        401 => Action::AuthLost,
        409 => Action::RetrySoon,
        400 | 413 => Action::Failed,
        428 => Action::Pending,
        // ‏429 وكل ‏5xx وصفرُ الشبكة وغيرُ المسمّى: انقطاعٌ عابر
        _ => Action::Backoff,
    }
}

/// التراجع الأُسّي: ‏2s × 2^attempt بسقف صلب عند 5 دقائق. لا فيض مهما كبر
/// attempt (إزاحة مُقيَّدة وتشبُّع ضربٍ)
pub fn backoff_next(attempt: u32) -> Duration {
    let exp = BACKOFF_BASE_MS.saturating_mul(1u64 << attempt.min(31));
    Duration::from_millis(exp.min(BACKOFF_CAP_MS))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// جدول §٣.٥ صفًّا صفًّا — كل رمز له تأكيد صريح لا اجتهاد
    #[test]
    fn تصنيف_الحالات_يطابق_جدول_الخطة_صفا_صفا() {
        assert_eq!(classify_response(200), Action::Done);
        assert_eq!(classify_response(401), Action::AuthLost);
        assert_eq!(classify_response(409), Action::RetrySoon);
        assert_eq!(classify_response(400), Action::Failed);
        assert_eq!(classify_response(413), Action::Failed);
        assert_eq!(classify_response(428), Action::Pending);
        // الانقطاع العابر: ‏429 وكل صفوف ‏5xx وصفرُ الشبكة
        assert_eq!(classify_response(429), Action::Backoff);
        assert_eq!(classify_response(500), Action::Backoff);
        assert_eq!(classify_response(502), Action::Backoff);
        assert_eq!(classify_response(503), Action::Backoff);
        assert_eq!(classify_response(0), Action::Backoff, "خطأ شبكة يُمثَّل صفرًا");
        // غير المسمّى يُعامَل عابرًا الأأمن
        assert_eq!(classify_response(404), Action::Backoff);
    }

    /// التراجع: يبدأ ثانيتين ويتصاعد أُسّيًّا ويلتزم السقف الصلب بالضبط
    #[test]
    fn التراجع_يبدأ_ثانيتين_يتصاعد_ويلتزم_سقف_الخمس_دقائق() {
        assert_eq!(backoff_next(0), Duration::from_secs(2));
        assert_eq!(backoff_next(1), Duration::from_secs(4));
        assert_eq!(backoff_next(2), Duration::from_secs(8));
        let d3 = backoff_next(3);
        let d4 = backoff_next(4);
        assert!(d3 > Duration::from_secs(8) && d4 > d3, "تصاعد أُسّيّ");
        // تحت السقف: ‏2s×2^7 = 256s
        assert_eq!(backoff_next(7), Duration::from_secs(256));
        // السقف الصلب: ‏2s×2^8 = 512s تُقصُّ إلى 300s بالضبط، ولا يتجاوزه 20 ولا u32::MAX
        assert_eq!(backoff_next(8), Duration::from_secs(300));
        assert_eq!(backoff_next(20), Duration::from_secs(300));
        assert_eq!(backoff_next(u32::MAX), Duration::from_secs(300));
    }
}
