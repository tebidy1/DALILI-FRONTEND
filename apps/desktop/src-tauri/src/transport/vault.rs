//! خزنة رمز الجهاز — مدير اعتماد ويندوز حصرًا. المنقول النمطيّ من سبايك ٣ب
//! (`vault()`: ‏CredWriteW/CredReadW/CredDeleteW على ‏CRED_TYPE_GENERIC).
//! **الرمز سرّ:** لا يخرج من Rust ولا يُسجَّل ولا يُبثّ ولا يعود بأيّ أمر
//! Tauri — يُقرأ داخل Rust وقت الرفع (٣د-٢) حصرًا. بريد المالك (غير سرّيّ)
//! يسكن المدير نفسه بمفتاح مجاور كي يعبر الاقترانُ الوحيد.

use windows::core::{HRESULT, PCWSTR, PWSTR};
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

/// مفتاح الاعتماد — نقية كي تُختبَر صيغتُها بلا مدير اعتماد
pub fn cred_key(kind: &str, origin: &str) -> String {
    format!("itqan/{kind}/{origin}")
}

/// UTF-16 منظوف البطلان — صيغة ‏TargetName لدى واجهات الاعتماد
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn write_cred(key: &str, value: &str) -> Result<(), String> {
    let mut target = wide(key);
    let mut user = wide("itqan-device");
    let mut blob = value.as_bytes().to_vec();
    let cred = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        UserName: PWSTR(user.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    unsafe { CredWriteW(&cred, 0).map_err(|e| format!("كتابة الاعتماد فشلت: {e}")) }
}

fn read_cred(key: &str) -> Option<String> {
    let target = wide(key);
    let mut out: *mut CREDENTIALW = std::ptr::null_mut();
    unsafe {
        CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None, &mut out).ok()?;
        let c = &*out;
        let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
        let value = String::from_utf8_lossy(bytes).to_string();
        CredFree(out as *const _);
        Some(value)
    }
}

fn delete_cred(key: &str) -> Result<(), String> {
    let target = wide(key);
    unsafe {
        match CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None) {
            Ok(()) => Ok(()),
            // الغياب ليس خطأ: الإبطال مُكرَّر الاستدعاء يعيد النجاح (ERROR_NOT_FOUND)
            Err(e) if e.code() == HRESULT::from_win32(1168) => Ok(()),
            Err(e) => Err(format!("حذف الاعتماد فشل: {e}")),
        }
    }
}

/// يخزّن رمز الجهاز — من مسار الاقتران حصرًا
pub fn store_token(origin: &str, token: &str) -> Result<(), String> {
    write_cred(&cred_key("device-token", origin), token)
}

/// يقرأ الرمز — **من داخل Rust وقت الرفع حصرًا (٣د-٢)**؛ لا أمر Tauri يستعملها
pub fn read_token(origin: &str) -> Option<String> {
    read_cred(&cred_key("device-token", origin))
}

/// يمحو الرمز — من «إبطال الاقتران» حصرًا
pub fn forget_token(origin: &str) -> Result<(), String> {
    delete_cred(&cred_key("device-token", origin))
}

/// بريد المالك — يُكتب لحظة الاقتران الناجح ليعرضه ‏auth_status لاحقًا
pub fn store_email(origin: &str, email: &str) -> Result<(), String> {
    write_cred(&cred_key("device-email", origin), email)
}

pub fn read_email(origin: &str) -> Option<String> {
    read_cred(&cred_key("device-email", origin))
}

pub fn forget_email(origin: &str) -> Result<(), String> {
    delete_cred(&cred_key("device-email", origin))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// صيغة المفتاح نقية: ‏itqan/<نوع>/<origin> — بلا لمس مدير الاعتماد
    #[test]
    fn صيغة_مفتاح_الخزنة_مثبتة() {
        assert_eq!(
            cred_key("device-token", "http://127.0.0.1:8787"),
            "itqan/device-token/http://127.0.0.1:8787"
        );
        assert_eq!(
            cred_key("device-email", "https://api.itqan.example"),
            "itqan/device-email/https://api.itqan.example"
        );
    }

    /// جولة حيّة كاملة على مدير الاعتماد الحقيقيّ: اكتب ⇐ اقرأ ⇐ امحُ ⇐ غاب ⇐
    /// المحو المُكرَّر نجاح. تُشغَّل يدويًّا (تلمس اعتماديات الجهاز الحقيقيّة)
    #[test]
    #[ignore]
    fn جولة_الخزنة_الحيّة_اكتب_اقرأ_امح_يغيب() {
        let origin = "test://itqan-vault-roundtrip";
        let key = cred_key("device-token", origin);
        // تنظيف أيّ متسرّب من تشغيل سابق
        let _ = delete_cred(&key);

        assert_eq!(read_cred(&key), None, "يبدأ غائبًا");
        write_cred(&key, "itq_live_roundtrip_token").expect("الكتابة تنجح");
        assert_eq!(read_cred(&key).as_deref(), Some("itq_live_roundtrip_token"));
        // الكتابة فوق القديم تحديثٌ لا خطأ
        write_cred(&key, "itq_live_roundtrip_2").expect("التحديث يننجح");
        assert_eq!(read_cred(&key).as_deref(), Some("itq_live_roundtrip_2"));
        delete_cred(&key).expect("المحو ينجح");
        assert_eq!(read_cred(&key), None, "غاب بعد المحو");
        // المحو المُكرَّر نجاحٌ لا خطأ (الغياب ليس خطأ)
        delete_cred(&key).expect("المحو المكرر نجاح");
    }
}
