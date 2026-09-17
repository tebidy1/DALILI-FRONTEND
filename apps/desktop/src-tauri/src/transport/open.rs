//! فتح الدليل في المتصفّح (٣د-٣) — أمرٌ مصون: المسار من TS يجب أن يكون
//! مسار دليل ‏‎/g/<معرّف>‎ حصرًا (بلا اجتياح ولا مخطط غريب)، والعنوان يُبنى
//! من ‏web_origin بحارس المخطط نفسه (‏http_url) ثم يُفوَض لمتصفّح النظام.
//! لا تبعية جديدة: ‏ShellExecuteW من صندوق ‏windows القائم بميزة ‏Win32_UI_Shell.

use crate::transport::pair;

/// حارس المسار النقيّ: ‏‎/g/<حروف وأرقام و- و_>‎ حصرًا — لا اجتياح ولا مخطط
/// ولا مسار دليل آخر. يوازي ‏^/g/[\w-]+$ بأحرف ASCII دون ‏regex
pub fn guide_path_ok(path: &str) -> bool {
    let Some(rest) = path.strip_prefix("/g/") else {
        return false;
    };
    !rest.is_empty()
        && rest.len() <= 128
        && !rest.contains('/')
        && rest.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// بناء العنوان النقيّ — origin منظَّف + حارس المخطط + مسار محروس
pub fn browser_url(origin: &str, path: &str) -> Result<String, String> {
    if !guide_path_ok(path) {
        return Err(format!("مسار غير مسموح — مسارات الأدلّة ‎/g/<معرّف>‎ حصرًا: {path}"));
    }
    pair::http_url(pair::clean_base(origin), path)
}

/// الفتح الفعليّ عبر متصفّح النظام — بعد الحارسين
pub fn open_in_browser(path: &str) -> Result<(), String> {
    let url = browser_url(&pair::web_origin(), path)?;
    let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    let operation: Vec<u16> = "open\0".encode_utf16().collect();
    unsafe {
        let h = windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::PCWSTR(operation.as_ptr()),
            windows::core::PCWSTR(wide.as_ptr()),
            windows::core::PCWSTR::null(),
            windows::core::PCWSTR::null(),
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        );
        // ‏ShellExecuteW يعيد ‏HINSTANCE قيمته الصحيحيّة أكبر من ‏32 دليل نجاح (عقد ويندوز)
        let code = h.0 as usize;
        if code <= 32 {
            return Err("تعذّر فتح المتصفّح".to_string());
        }
    }
    Ok(())
}

// ───────────────── صفحة موافقة الاقتران (اق-١) ─────────────────

/// حارس رمز التحقّق وباني رابط صفحة الموافقة: الرمز غير فارغ ≤32 ‏ASCII
/// أبجديّ-رقميّ و`-` حصرًا (صيغة ‏XXXX-XXXX من الخادم؛ ما عداه — فراغ أو
/// `?` أو `/` أو `&` — يُرَدّ فلا حقن سلسلة استعلام في الرابط)، والرابط
/// يُبنى عبر حارس المخطط نفسه. الأصل يمرَّ وسيطًا ويُقرأ عند الحدّ.
pub fn verify_url(origin: &str, code: &str) -> Result<String, String> {
    let code_ok = !code.is_empty()
        && code.len() <= 32
        && code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if !code_ok {
        return Err("رمز التحقّق غير صالح".into());
    }
    pair::http_url(pair::clean_base(origin), &format!("/device?code={code}"))
}

/// فتح صفحة موافقة الاقتران في متصفّح النظام — محاكٍ حرفيّ لـopen_in_browser
/// (العملية نفسها وحارس الخروج نفسه)، والرابط مبنى هنا لا مُمرَّرًا من TS
pub fn open_verify(origin: &str, code: &str) -> Result<(), String> {
    let url = verify_url(origin, code)?;
    let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    let operation: Vec<u16> = "open\0".encode_utf16().collect();
    unsafe {
        let h = windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::PCWSTR(operation.as_ptr()),
            windows::core::PCWSTR(wide.as_ptr()),
            windows::core::PCWSTR::null(),
            windows::core::PCWSTR::null(),
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        );
        // ‏ShellExecuteW يعيد ‏HINSTANCE قيمته الصحيحيّة أكبر من ‏32 دليل نجاح (عقد ويندوز)
        let code = h.0 as usize;
        if code <= 32 {
            return Err("تعذّر فتح المتصفّح".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn حارس_مسار_الدليل_يجيز_المعرّفات_ويرفض_كل_ما_عداها() {
        assert!(guide_path_ok("/g/abc123"));
        assert!(guide_path_ok("/g/a-B_9"));
        assert!(guide_path_ok(&format!("/g/{}", "x".repeat(128))));
        for bad in [
            "",
            "/g/",
            "/g/../evil",
            "/g/a/b",
            "//evil.com/g/x",
            "http://evil.com/g/x",
            "/guides/abc",
            "/g/abc?x=1",
            "/g/abc def",
            "/G/abc",
        ] {
            assert!(!guide_path_ok(bad), "«{bad}» يجب أن يُرَدّ");
        }
        assert!(!guide_path_ok(&format!("/g/{}", "x".repeat(129))), "الطول المفرط يُرَدّ");
    }

    #[test]
    fn عنوان_المتصفح_يلتحم_بمنشأ_منظف_ويرفض_المنشأ_السيء_والمسار_السيء() {
        assert_eq!(
            browser_url("http://localhost:5174/", "/g/abc123").unwrap(),
            "http://localhost:5174/g/abc123"
        );
        // منشأ سيء (حارس المخطط) يُرَدّ كي لا يُبنى عنوانٌ بلا http/https
        assert!(browser_url("file:///c", "/g/abc123").is_err());
        // مسار سيء يُرَدّ قبل أيّ لمسٍ لنظام النوافذ
        assert!(browser_url("http://localhost:5174", "/g/../evil").is_err());
        assert!(browser_url("http://localhost:5174", "http://evil.com").is_err());
    }

    /// اق-١: رابط صفحة موافقة الاقتران — الرمز ‏XXXX-XXXX محروس (ASCII
    /// أبجديّ-رقميّ و`-` حصرًا ≤32 فلا حقن سلسلة استعلام) والرابط عبر حارس
    /// المخطط نفسه، والأصل السيء يُرَدّ
    #[test]
    fn رابط_التحقق_يبني_عبر_حارس_المخطط_ويرفض_الرموز_الخربشة() {
        assert_eq!(
            verify_url("http://localhost:5174/", "WDJB-MJHT").unwrap(),
            "http://localhost:5174/device?code=WDJB-MJHT"
        );
        for bad in ["", "a b", "a?b", "a/b", "a&b", " WDJB", "http://evil.example"] {
            assert!(
                verify_url("http://localhost:5174", bad).is_err(),
                "رمز سيّئ مرّ: «{bad}»"
            );
        }
        assert!(
            verify_url("http://localhost:5174", &"x".repeat(33)).is_err(),
            "الطول المفرط يُرَدّ"
        );
        // منشأ سيء (حارس المخطط) يُرَدّ كعادته
        assert!(verify_url("file:///c", "ok").is_err());
    }
}
