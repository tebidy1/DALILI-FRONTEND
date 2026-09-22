//! طابور الأدلّة (٣د-٣) — وازٍ لطابور الملفّات: ‏%LOCALAPPDATA%\Itqan\queue\guides\
//! كل عنصر ملفّان: سجلّ ‏{sessionId}.json وجسم الدليل **نصًّا معتِمًا** ‏{sessionId}.body.
//! **القاعدة الذهبيّة:** الطابور والعامل لا يفكّكان الجسم ولا يفهرسان بنية —
//! يُكتب ويُرفع حرفيًّا كما بناه TS، ومن الردّ يُقرأ ‏id الوحيد (حقل عقد).
//! الكتابة ذرّيّة، وحارس ‏sessionId ‏«s-<آمن للملفّ>» يضمن صلاحية مفتاح
//! عدم التكرار ‏guide-{sessionId} لعقد الخادم (‏٨–١٢٨ من ‏[A-Za-z0-9_-]).

// طابور موازٍ لطابور queue.rs بنيويًّا عن قصد (عتامة الدليل) — أي توحيد يكون بغلاف خفيف لا بدمج عميق (فحص 2026-09-21).

use super::queue::QueueState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// سجلّ عنصر طابور الأدلّة كما يُخزَّن ‏JSON على القرص
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueuedGuide {
    pub session_id: String,
    /// مسار جسم الدليل المعتِم على القرص — معلومة تشخيص، الجسم لا يُفكَّك
    pub body_path: String,
    pub state: QueueState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_ar: Option<String>,
    #[serde(default)]
    pub attempt: u32,
    /// علم بسيط من TS: فيه تعليق صوتيّ ⇐ بعد النجاح يُطلَق التفريغ الخادميّ.
    /// القديم بلا حقل يقرأ مطفأً (توافق تام)
    #[serde(default)]
    pub has_voice: bool,
}

/// جذر طابور الأدلّة في الإنتاج — ‏%LOCALAPPDATA%\Itqan\queue\guides
pub fn guides_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA").map_err(|_| "متغيّر LOCALAPPDATA غائب".to_string())?;
    Ok(Path::new(&base).join("Itqan").join("queue").join("guides"))
}

/// حارس ‏sessionId: ‏«s-» ثم ‏[A-Za-z0-9_-] حتى ‏64 — آمن لاسم ملفّ ويضمن
/// أنّ ‏guide-{sessionId} يحقّق عقد مفتاح عدم التكرار (الحدّ الأدنى ‏9 أحرف)
pub fn valid_session_id(session_id: &str) -> bool {
    let Some(rest) = session_id.strip_prefix("s-") else {
        return false;
    };
    !rest.is_empty()
        && rest.len() <= 64
        && rest
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// مفتاح عدم التكرار لعنصر الدليل — ‏guide-{sessionId}
pub fn guide_key(session_id: &str) -> String {
    format!("guide-{session_id}")
}

fn record_path(root: &Path, session_id: &str) -> Result<PathBuf, String> {
    if !valid_session_id(session_id) {
        return Err(format!("sessionId غير صالح: {session_id}"));
    }
    Ok(root.join(format!("{session_id}.json")))
}

fn body_path(root: &Path, session_id: &str) -> Result<PathBuf, String> {
    if !valid_session_id(session_id) {
        return Err(format!("sessionId غير صالح: {session_id}"));
    }
    Ok(root.join(format!("{session_id}.body")))
}

/// مسار الجسم المعتِم — يقرأه العامل ليرفعه حرفيًّا
pub fn queued_body_path(root: &Path, session_id: &str) -> Result<PathBuf, String> {
    body_path(root, session_id)
}

pub fn serialize_record(rec: &QueuedGuide) -> String {
    serde_json::to_string(rec).unwrap_or_else(|_| "{}".into())
}

pub fn parse_record(text: &str) -> Result<QueuedGuide, String> {
    serde_json::from_str(text).map_err(|_| "سجلّ طابور أدلّة غير مفهوم".to_string())
}

/// كتابة ذرّيّة بنمط ‏queue.rs: ‏.tmp ثم ‏rename (يستبدل الموجود على ويندوز)
fn write_atomic(target: &Path, tmp: &Path, bytes: &[u8], what: &str) -> Result<(), String> {
    std::fs::write(tmp, bytes).map_err(|e| format!("كتابة {what} فشلت: {e}"))?;
    std::fs::rename(tmp, target).map_err(|e| format!("تثبيت {what} فشل: {e}"))
}

/// إضافة عنصر دليل: الجسم المعتِم إلى القرص أوّلًا ثم السجلّ منتظِرًا —
/// الجسم يُكتب **كما هو** بلا فكّ ولا تحقّق بنية (القاعدة الذهبيّة).
/// ‏has_voice علم بسيط من TS (هل فيه أيّ تعليق صوتيّ) يقود إطلاق التفريغ
/// الخادميّ بعد النجاح — لا بنية دليل تعبر إلى Rust إطلاقًا
pub fn queue_guide(
    root: &Path,
    session_id: &str,
    body_text: &str,
    has_voice: bool,
) -> Result<QueuedGuide, String> {
    std::fs::create_dir_all(root).map_err(|e| format!("تعذّر إنشاء مجلد طابور الأدلّة: {e}"))?;
    let body = body_path(root, session_id)?;
    let body_tmp = root.join(format!("{session_id}.body.tmp"));
    write_atomic(&body, &body_tmp, body_text.as_bytes(), "جسم الدليل")?;
    let rec = QueuedGuide {
        session_id: session_id.to_string(),
        body_path: body.display().to_string(),
        state: QueueState::Pending,
        error_ar: None,
        attempt: 0,
        has_voice,
    };
    let record = record_path(root, session_id)?;
    let record_tmp = root.join(format!("{session_id}.json.tmp"));
    write_atomic(&record, &record_tmp, serialize_record(&rec).as_bytes(), "سجلّ الدليل")?;
    Ok(rec)
}

fn read_records(root: &Path) -> Vec<QueuedGuide> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        if let Ok(txt) = std::fs::read_to_string(&p) {
            if let Ok(rec) = parse_record(&txt) {
                out.push(rec);
            }
        }
    }
    out.sort_by(|a, b| a.session_id.cmp(&b.session_id));
    out
}

/// المنتظرون مرتَّبين — قراءة لقطة للتمريرة
pub fn list_pending(root: &Path) -> Vec<QueuedGuide> {
    read_records(root)
        .into_iter()
        .filter(|r| r.state == QueueState::Pending)
        .collect()
}

/// الفاشلون نهائيًّا — الجسم باقٍ، بانتظار إعادة المحاولة
pub fn list_failed(root: &Path) -> Vec<QueuedGuide> {
    read_records(root)
        .into_iter()
        .filter(|r| r.state == QueueState::Failed)
        .collect()
}

pub fn mark_failed(root: &Path, rec: &QueuedGuide, error_ar: &str) -> Result<(), String> {
    let mut r = rec.clone();
    r.state = QueueState::Failed;
    r.error_ar = Some(error_ar.to_string());
    let record = record_path(root, &r.session_id)?;
    let tmp = root.join(format!("{}.json.tmp", r.session_id));
    write_atomic(&record, &tmp, serialize_record(&r).as_bytes(), "سجلّ الدليل")
}

pub fn save_attempt(root: &Path, rec: &QueuedGuide, attempt: u32) -> Result<(), String> {
    let mut r = rec.clone();
    r.attempt = attempt;
    let record = record_path(root, &r.session_id)?;
    let tmp = root.join(format!("{}.json.tmp", r.session_id));
    write_atomic(&record, &tmp, serialize_record(&r).as_bytes(), "سجلّ الدليل")
}

/// إعادة كل الفاشلين إلى الانتظار بمحاولة صفر — يعيد العدد المُعاد
pub fn retry_failed(root: &Path) -> Result<u32, String> {
    let mut n = 0u32;
    for rec in list_failed(root) {
        let mut r = rec;
        r.state = QueueState::Pending;
        r.error_ar = None;
        r.attempt = 0;
        let record = record_path(root, &r.session_id)?;
        let tmp = root.join(format!("{}.json.tmp", r.session_id));
        write_atomic(&record, &tmp, serialize_record(&r).as_bytes(), "سجلّ الدليل")?;
        n += 1;
    }
    Ok(n)
}

/// حذف عنصر نجح: السجلّ ثم الجسم — السجلّ هو نقطة الالتزام فيُحذف أوّلًا
/// كي لا يبقى عنصرٌ بلا جسم إن قُطع التنفيذ بينهما
pub fn remove_item(root: &Path, session_id: &str) -> Result<(), String> {
    let record = record_path(root, session_id)?;
    let body = body_path(root, session_id)?;
    std::fs::remove_file(&record).map_err(|e| format!("حذف سجلّ الدليل فشل: {e}"))?;
    let _ = std::fs::remove_file(&body);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Tmp {
        root: PathBuf,
    }
    impl Tmp {
        fn new(tag: &str) -> Self {
            let root =
                std::env::temp_dir().join(format!("itqan-guideq-test-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            Tmp { root }
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn جولة_السجل_تحفظ_الحقول() {
        let rec = QueuedGuide {
            session_id: "s-1a2b".into(),
            body_path: "C:\\q\\guides\\s-1a2b.body".into(),
            state: QueueState::Pending,
            error_ar: None,
            attempt: 2,
            has_voice: true,
        };
        assert_eq!(parse_record(&serialize_record(&rec)).unwrap(), rec);
        let mut f = rec.clone();
        f.state = QueueState::Failed;
        f.error_ar = Some("رفض الخادم الدليل".into());
        let txt = serialize_record(&f);
        assert!(txt.contains("\"state\":\"failed\"") && txt.contains("رفض الخادم الدليل"), "{txt}");
        assert!(txt.contains("\"has_voice\":true"), "{txt}");
        // سجلّ قديم بلا حقل has_voice يقرأ مطفأً (توافق تام)
        let legacy = r#"{"session_id":"s-1","body_path":"x","state":"pending","attempt":0}"#;
        assert!(!parse_record(legacy).unwrap().has_voice);
    }

    #[test]
    fn حارس_الجلسة_يرفض_اجتياح_المسار_والمفرط_الطول() {
        assert!(valid_session_id("s-1a2b"));
        assert!(valid_session_id("s-ABC_x-9"));
        for bad in ["", "x-1", "s-", "../evil", "s-a/b", "s-a b", "s-أ"] {
            assert!(!valid_session_id(bad), "«{bad}» يجب أن يُرَدّ");
        }
        // ‏64 مقبول و65 مرفوض
        let ok = format!("s-{}", "a".repeat(64));
        let long = format!("s-{}", "a".repeat(65));
        assert!(valid_session_id(&ok));
        assert!(!valid_session_id(&long));
    }

    #[test]
    fn مفتاح_الدليل_يحقق_عقد_الخادم_لأقصر_وأطول_معرّف() {
        assert_eq!(guide_key("s-1a2b"), "guide-s-1a2b");
        for sid in ["s-x", &format!("s-{}", "a".repeat(64))] {
            let k = guide_key(sid);
            // عقد api: ‏٨–١٢٨ من [A-Za-z0-9_-]
            assert!(k.len() >= 8 && k.len() <= 128, "{k}");
            assert!(k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'), "{k}");
        }
    }

    #[test]
    fn الاضافة_تكتب_الجسم_والسجل_بلا_ملف_معلق() {
        let t = Tmp::new("add");
        // جسم محايد الرموز عمدًا — عتامة الطابور تعني أنّ المحتوى لا يهمّ
        let body = r#"{"title":"دليل تجربة","items":[1,2]}"#;
        let rec = queue_guide(&t.root, "s-9", body, false).unwrap();
        assert_eq!(rec.state, QueueState::Pending);
        assert_eq!(rec.attempt, 0);
        // الجسم كما هو حرفيًّا
        assert_eq!(std::fs::read_to_string(t.root.join("s-9.body")).unwrap(), body);
        // السجلّ مقروء ولا ‏.tmp
        parse_record(&std::fs::read_to_string(t.root.join("s-9.json")).unwrap()).unwrap();
        let names: Vec<_> = std::fs::read_dir(&t.root).unwrap().flatten()
            .map(|e| e.file_name().to_string_lossy().to_string()).collect();
        assert_eq!(names.len(), 2, "{names:?}");
        assert!(rec.body_path.ends_with("s-9.body"));
    }

    #[test]
    fn الجسم_المعتم_النص_الاعتباطي_يكتب_بلا_فك_وقراءة_سجل_فاسد_تتجاهل() {
        let t = Tmp::new("opaque");
        // نصّ ليس ‏JSON أصلًا — الطابور يكتبه كما هو بلا شكوى (التحقّق لعهد TS والخادم)
        queue_guide(&t.root, "s-1", "هذا ليس JSON{{{", false).unwrap();
        assert_eq!(
            std::fs::read_to_string(t.root.join("s-1.body")).unwrap(),
            "هذا ليس JSON{{{"
        );
        // سجلّ عابث على القرص لا يُوقع القوائم — والأصالح وحده يُقرأ
        std::fs::write(t.root.join("s-2.json"), "نصف مكتوب{{{").unwrap();
        let pending = list_pending(&t.root);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].session_id, "s-1");
    }

    #[test]
    fn الاضافة_بمعرّف_فاسد_ترد_خطأ_ولا_تكتب_شيئا() {
        let t = Tmp::new("badid");
        assert!(queue_guide(&t.root, "../evil", "{}", false).is_err());
        assert!(queue_guide(&t.root, "s-", "{}", false).is_err());
        assert!(std::fs::read_dir(&t.root).unwrap().flatten().count() == 0);
    }

    #[test]
    fn القوائم_تفصل_مرتبة_والفشل_يبقي_الجسم_والإعادة_تصفر_والحذف_يمسح_الاثنين() {
        let t = Tmp::new("states");
        queue_guide(&t.root, "s-1", "ب1", false).unwrap();
        queue_guide(&t.root, "s-2", "ب2", false).unwrap();
        queue_guide(&t.root, "s-3", "ب3", true).unwrap();
        // قيد الكتابة الذرّيّة لا يدخل القوائم
        std::fs::write(t.root.join("s-4.json.tmp"), "x").unwrap();
        mark_failed(&t.root, &list_pending(&t.root)[2], "دليل غير صالح").unwrap();
        assert_eq!(
            list_pending(&t.root).iter().map(|r| r.session_id.as_str()).collect::<Vec<_>>(),
            ["s-1", "s-2"]
        );
        let failed = list_failed(&t.root);
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].session_id, "s-3");
        // الفشل النهائيّ يبقي الجسم
        assert!(t.root.join("s-3.body").exists());
        // محاولة عابرة ثم إعادة: تصفير
        save_attempt(&t.root, &list_pending(&t.root)[0], 2).unwrap();
        assert_eq!(list_pending(&t.root)[0].attempt, 2);
        assert_eq!(retry_failed(&t.root).unwrap(), 1);
        let pending_after = list_pending(&t.root);
        let again = pending_after.iter().find(|r| r.session_id == "s-3").unwrap();
        assert_eq!(again.attempt, 0);
        assert_eq!(again.error_ar, None);
        // الحذف يمسح السجلّ والجسم معًا
        remove_item(&t.root, "s-1").unwrap();
        assert!(!t.root.join("s-1.json").exists());
        assert!(!t.root.join("s-1.body").exists());
        assert!(remove_item(&t.root, "../evil").is_err());
    }
}
