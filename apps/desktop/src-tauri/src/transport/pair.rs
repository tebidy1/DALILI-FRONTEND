//! تدفّق اقتران الجهاز (٣د-١) — «ابدأ» يجيب الواجهة فورًا برمز المستخدم ورابط
//! موافقته، والاستطلاع على **خيط خلفيّ** كل interval حتى ‏expiresIn. الرمز لا
//! يمرّ من هنا إلّا إلى الخزنة: لا يعود بأيّ أمر ولا يُسجَّل ولا يُبثّ —
//! ‏auth_status يعيد ‏{paired,email} فقط (تسريبُه هنا هو الخطر الأول للخطّة §٥).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;

use crate::transport::{policy, vault};

/// جيل الاستطلاع الحاليّ — بدءُ اقترانٍ جديد أو إبطالٌ يُبطلان الاستطلاع القائم
static POLL_GEN: AtomicU64 = AtomicU64::new(0);

/// ردّ بدء الاقتران للواجهة — برمز المستخدم ورابط موافقته، بلا رمز جهاز أبدًا
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairStart {
    pub user_code: String,
    pub verify_url: String,
}

/// ردّ حالة الاقتران — ‏{paired,email} فقط بعقد §٣.٥
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairStatus {
    pub paired: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartResp {
    device_code: String,
    user_code: String,
    expires_in: u64,
    interval: u64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenOk {
    token: String,
    #[allow(dead_code)]
    device_id: String,
    user: UserEmail,
}

#[derive(serde::Deserialize)]
struct UserEmail {
    email: String,
}

/// ‏origin الـAPI من البيئة — الافتراضيّ تطويرٌ محليّ على جهاز المالك (8787)،
/// والإنتاج يتجاوزه بمتغيّر البيئة (لا ترميز صلب لخادم إنتاج). بلا شرطة
/// مائلة ذيليّة (نِتّ تدقيق ٣د-١: ‏//device لو كتبها المالك بالبيئة).
/// **تُقرأ عند حدّ أوامر Tauri حصرًا** (إصلاح ٣د-٤-أ): ‏pair_start/status/forget
/// تأخذ المنشأ وسيطًا، فالاختبار يمرّره صراحةً — لا قراءة بيئة ولا تحويرها
/// في أيّ اختبار، ويستحيل بنيويًّا أن يلمس اختبارٌ خادم المالك
pub fn api_origin() -> String {
    clean_base(&std::env::var("ITQAN_API_ORIGIN").unwrap_or_else(|_| "http://127.0.0.1:8787".into()))
        .to_string()
}

/// ‏origin صفحة موافقة الجهاز (يخدِمها تطبيق الويب) — بقصّ الذيل كالـAPI
pub fn web_origin() -> String {
    clean_base(&std::env::var("ITQAN_WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:5174".into()))
        .to_string()
}

/// قصّ الشرطات المائلة الذيليّة من origin — نقية ومُختبَرة
pub fn clean_base(origin: &str) -> &str {
    origin.trim_end_matches('/')
}

/// حارس المخطط: ‏http/https حصرًا على كل عنوان صادر
pub fn http_url(base: &str, path: &str) -> Result<String, String> {
    if base.starts_with("http://") || base.starts_with("https://") {
        Ok(format!("{base}{path}"))
    } else {
        Err("origin غير مدعوم — ‏http/https حصرًا".into())
    }
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("تهيئة عميل الشبكة فشلت: {e}"))
}

/// ‏POST بجسم ‏JSON يدويًّا — بلا ميزة json (قائمة الميزات مثبتة من كتلة
/// التسليم): النصّ يُحلَّل بـserde_json عند الاستقبال
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &serde_json::Value,
) -> Result<reqwest::blocking::Response, reqwest::Error> {
    client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(serde_json::to_string(body).unwrap_or_else(|_| "{}".into()))
        .send()
}

/// تحليل ردّ JSON من نصّه — الخطأ يُبلَّع في رسالة ثابتة كي لا يعلق جسمُ
/// الردّ (ومعه الرمز) في أيّ لوج
fn parse_json<T: serde::de::DeserializeOwned>(text: String) -> Result<T, String> {
    serde_json::from_str(&text).map_err(|_| "ردّ غير مفهوم".to_string())
}

/// «ابدأ الاقتران»: طلب بدء واحد ثم خيط استطلاع خلفيّ — الردّ للواجهة فوريّ.
/// المنشأ وسيطٌ محقون (إصلاح ٣د-٤-أ) لا قراءة بيئة من الداخل
pub fn pair_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    origin: String,
    device_name: String,
) -> Result<PairStart, String> {
    let url = http_url(&origin, "/api/device/start")?;
    let client = client()?;
    let resp = post_json(&client, &url, &serde_json::json!({ "deviceName": device_name }))
        .map_err(|_| "تعذّر الاتصال بالخادم — تأكّد من تشغيله".to_string())?;
    if !resp.status().is_success() {
        return Err(format!("الخادم رفض بدء الاقتران ({})", resp.status().as_u16()));
    }
    let sr: StartResp = parse_json(resp.text().map_err(|_| "ردّ بدء غير مفهوم".to_string())?)
        .map_err(|_| "ردّ بدء غير مفهوم".to_string())?;
    let verify_url = format!("{}/device?code={}", web_origin(), sr.user_code);
    // جيل جديد يُبطل أيّ استطلاع قائم، ثم الخيط الخلفيّ
    let gen = POLL_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let interval = Duration::from_secs(sr.interval.max(1));
    let ttl = Duration::from_secs(sr.expires_in.max(1));
    std::thread::spawn(move || {
        poll_loop(app, origin, sr.device_code, interval, ttl, gen);
    });
    Ok(PairStart { user_code: sr.user_code, verify_url })
}

/// حلقة الاستطلاع: ‏428 واصل · ‏200 خزّن الرمز في الخزنة وابثّ ‏auth://paired
/// بالبريد وحده · ‏410/403 فشلٌ عربيّ · ‏429/5xx/شبكة تراجعٌ (تصنيف §٣.٥) والدورة
/// تُعاد. الأجسام لا تُسجَّل — رسائل الخطأ ثابتة كي لا يعلق الرمز في لوجٍ أبدًا
fn poll_loop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    origin: String,
    device_code: String,
    interval: Duration,
    ttl: Duration,
    gen: u64,
) {
    let url = match http_url(&origin, "/api/device/token") {
        Ok(u) => u,
        Err(e) => {
            let _ = app.emit("auth://lost", serde_json::json!({ "reasonAr": e }));
            return;
        }
    };
    let client = match client() {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit("auth://lost", serde_json::json!({ "reasonAr": e }));
            return;
        }
    };
    let started = Instant::now();
    // عدّاد الردود العابرة المتتالية — يُصفَّر مع أول 428 (معلَّق أ من تدقيق ٣د-١:
    // الفرع العابر كان يحسب الفعل ويرميه، فلم يُحترم ‏429 slow_down ولا تراجع 5xx)
    let mut transient: u32 = 0;
    loop {
        // اقترانٌ أحدث بدأ أو أُبطل ⇐ هذا الاستطلاع يموت صامتًا
        if gen != POLL_GEN.load(Ordering::SeqCst) {
            return;
        }
        if started.elapsed() >= ttl {
            let _ = app.emit(
                "auth://lost",
                serde_json::json!({ "reasonAr": "انتهت مهلة الربط — ابدأ من جديد" }),
            );
            return;
        }
        std::thread::sleep(interval);
        let resp = post_json(&client, &url, &serde_json::json!({ "deviceCode": device_code }));
        // خطأ الشبكة يُمثَّل صفرًا بعقد الآلة — تصنيفه تراجعًا والدورة تُعاد
        let status = match &resp {
            Ok(r) => r.status().as_u16(),
            Err(_) => 0,
        };
        match status {
            428 => {
                transient = 0;
                continue;
            }
            200 => {
                match resp
                    .unwrap()
                    .text()
                    .map_err(|_| "ردّ اقتران غير مفهوم".to_string())
                    .and_then(parse_json::<TokenOk>)
                {
                    // الرمز إلى الخزنة حصرًا — البريد وحده يعبر إلى الواجهة
                    Ok(tok) => {
                        match vault::store_token(&origin, &tok.token)
                            .and_then(|_| vault::store_email(&origin, &tok.user.email))
                        {
                            Ok(()) => {
                                let _ = app.emit(
                                    "auth://paired",
                                    serde_json::json!({ "email": tok.user.email }),
                                );
                            }
                            Err(e) => {
                                let _ = app.emit(
                                    "auth://lost",
                                    serde_json::json!({
                                        "reasonAr": format!("تعذّر حفظ الرمز آمنًا: {e}")
                                    }),
                                );
                            }
                        }
                    }
                    Err(_) => {
                        let _ = app.emit(
                            "auth://lost",
                            serde_json::json!({ "reasonAr": "ردّ اقتران غير مفهوم" }),
                        );
                    }
                }
                return;
            }
            410 => {
                let _ = app.emit(
                    "auth://lost",
                    serde_json::json!({ "reasonAr": "انتهت مهلة الربط — ابدأ من جديد" }),
                );
                return;
            }
            403 => {
                let _ = app.emit(
                    "auth://lost",
                    serde_json::json!({ "reasonAr": "رُفض ربط الجهاز" }),
                );
                return;
            }
            _s => {
                // عابر (‏429 slow_down/‏5xx/شبكة): فاصلٌ إضافيّ يتدرّج وفق §٣.٥
                // فوق interval — الخادم الخانق يُحترَم والعدّاد يُصفَّر عند 428
                transient = transient.saturating_add(1);
                std::thread::sleep(policy::backoff_next(transient - 1));
            }
        }
    }
}

/// ‏auth_status — الاشتقاق من وجود الرمز في الخزنة، والرمز لا يعود أبدًا.
/// المنشأ وسيطٌ محقون (إصلاح ٣د-٤-أ)
pub fn status(origin: &str) -> PairStatus {
    PairStatus {
        paired: vault::read_token(origin).is_some(),
        email: vault::read_email(origin),
    }
}

/// ‏auth_forget — محو الخزنة (رمز + بريد) وإبطال استطلاع قائم، لا شيء آخر.
/// المنشأ وسيطٌ محقون (إصلاح ٣د-٤-أ)
pub fn forget(origin: &str) -> Result<(), String> {
    POLL_GEN.fetch_add(1, Ordering::SeqCst);
    vault::forget_token(origin)?;
    vault::forget_email(origin)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// حارس المخطط: ‏http/https تمرّ وكلّ ما عداه يُرَدّ
    #[test]
    fn حارس_المخطط_يجيز_ويب_ويك_وغيرهما_يرد() {
        assert!(http_url("http://127.0.0.1:8787", "/api/device/start").is_ok());
        assert!(http_url("https://api.itqan.example", "/api/device/token").is_ok());
        assert!(http_url("ftp://x", "/a").is_err());
        assert!(http_url("file:///c", "/a").is_err());
        assert!(http_url("", "/a").is_err());
    }

    /// نِتّ تدقيق ٣د-١: الشرطة المائلة الذيليّة في origin لا تكسر المسار
    #[test]
    fn قص_الشرطة_الذيلية_من_المنشأ_لا_يكرر_المائلة() {
        assert_eq!(clean_base("http://localhost:5174"), "http://localhost:5174");
        assert_eq!(clean_base("http://localhost:5174/"), "http://localhost:5174");
        assert_eq!(clean_base("http://itqan.example//"), "http://itqan.example");
        // الدمج الفعلي: بلا ‏//device
        let base = clean_base("http://localhost:5174/");
        assert_eq!(format!("{base}/device?code=X"), "http://localhost:5174/device?code=X");
    }
}
