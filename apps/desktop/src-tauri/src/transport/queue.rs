//! الطابور على القرص (٣د-٢) — ‏%LOCALAPPDATA%\Itqan\queue\files\
//! كل عنصر ملفّان: سجلّ ‏{localId}.json ونسخة اللقطة **المملوكة** ‏{localId}.jpg.
//! ‏queue_file تنسخ اللقطة المحروقة من مخزن ‏%TEMP% إلى الطابور **قبل** أيّ رفع —
//! تنظيفُ المؤقّت بعد أيّام لا يفقد بايتًا (سدّ ثقب فقد البيانات). الكتابة
//! ذرّيّة: ‏.tmp ثم ‏rename كي لا يُقرأ سجلٌّ نصف مكتوب. حارس المسار نمط
//! ‏burn.rs نفسه: ‏localId من إنتاجنا ‏«f-<أرقام>» حصرًا.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// حالة العنصر — منتظِر يُعاد أو فشلٌ نهائيّ؛ لا يُحذف في الحالين إلّا بالنجاح
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueueState {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "failed")]
    Failed,
}

/// نوع العنصر — لقطة محروقة أو تعليق صوتي (المرحلة ٢). القديم بلا حقل يقرأ
/// لقطة (توافق تام مع سجلّات القرص القائمة)، والنوع يختار امتداد النسخة
/// المملوكة ومفتاح عدم التكرار
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    Shot,
    Audio,
}

impl ItemKind {
    /// القيمة الافتراضيّة لسجلّات القرص القديمة بلا حقل kind — كلها لقطات
    fn shot_default() -> ItemKind {
        ItemKind::Shot
    }

    /// النوع يتبع بادئة المعرّف حصرًا: ‏f- لقطة و‏v- صوت — أيّ شيء آخر مرفوض.
    /// الاسماء المتفرقة تمنع تصادم لقطةٍ بتعليقٍ على المفتاح والمسار معًا
    pub fn from_local_id(local_id: &str) -> Option<ItemKind> {
        let digits = |d: &str| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit());
        match local_id.strip_prefix("f-") {
            Some(d) if digits(d) => return Some(ItemKind::Shot),
            _ => {}
        }
        match local_id.strip_prefix("v-") {
            Some(d) if digits(d) => Some(ItemKind::Audio),
            _ => None,
        }
    }

    pub fn ext(self) -> &'static str {
        match self {
            ItemKind::Shot => "jpg",
            ItemKind::Audio => "webm",
        }
    }
}

/// سجلّ عنصر الطابور كما يُخزَّن ‏JSON على القرص
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueueRecord {
    pub session_id: String,
    pub local_id: String,
    /// مسار الأصل في مخزن المؤقّت — معلومة تشخيص فقط، النسخة المملوكة هي التي
    /// يرفعها العامل (للصوت: ‏audio-webm-inline فقد وصل بايتاته من الودجة)
    pub shot_path: String,
    pub state: QueueState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_ar: Option<String>,
    #[serde(default)]
    pub attempt: u32,
    #[serde(default = "ItemKind::shot_default")]
    pub kind: ItemKind,
}

/// جذر طابور الملفّات في الإنتاج — ‏%LOCALAPPDATA%\Itqan\queue\files
pub fn queue_files_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA").map_err(|_| "متغيّر LOCALAPPDATA غائب".to_string())?;
    Ok(Path::new(&base).join("Itqan").join("queue").join("files"))
}

/// مخزن الإطارات المؤقّت — البناء نفسه في ‏capture.rs (نمط ‏frame_path)
pub fn frames_dir() -> PathBuf {
    std::env::temp_dir().join("itqan-frames")
}

/// حارس المسار: ‏localId من إنتاجنا حصرًا — ‏f-<أرقام> لقطة و‏v-<أرقام> صوت
pub fn valid_local_id(local_id: &str) -> bool {
    ItemKind::from_local_id(local_id).is_some()
}

fn record_path(root: &Path, local_id: &str) -> Result<PathBuf, String> {
    if !valid_local_id(local_id) {
        return Err(format!("localId غير صالح: {local_id}"));
    }
    Ok(root.join(format!("{local_id}.json")))
}

/// النسخة المملوكة بامتداد نوعها — لقطة ‏.jpg وصوت ‏.webm
fn owned_path(root: &Path, local_id: &str, kind: ItemKind) -> Result<PathBuf, String> {
    if !valid_local_id(local_id) {
        return Err(format!("localId غير صالح: {local_id}"));
    }
    Ok(root.join(format!("{local_id}.{}", kind.ext())))
}

/// مسار النسخة المملوكة من السجلّ — يقرأه عامل الرفع ليرفعها
pub fn queued_owned_path(root: &Path, rec: &QueueRecord) -> Result<PathBuf, String> {
    owned_path(root, &rec.local_id, rec.kind)
}

pub fn serialize_record(rec: &QueueRecord) -> String {
    serde_json::to_string(rec).unwrap_or_else(|_| "{}".into())
}

pub fn parse_record(text: &str) -> Result<QueueRecord, String> {
    serde_json::from_str(text).map_err(|_| "سجلّ طابور غير مفهوم".to_string())
}

/// كتابة ذرّيّة: ‏.tmp ثم ‏rename — ‏rename على ويندوز يستبدل الموجود
fn write_record_atomic(root: &Path, rec: &QueueRecord) -> Result<(), String> {
    let target = record_path(root, &rec.local_id)?;
    let tmp = root.join(format!("{}.json.tmp", rec.local_id));
    std::fs::write(&tmp, serialize_record(rec))
        .map_err(|e| format!("كتابة سجلّ الطابور فشلت: {e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("تثبيت سجلّ الطابور فشل: {e}"))
}

/// إضافة عنصر: **نسخ اللقطة المحروقة إلى ملكيّة الطابور أوّلًا** ثم كتابة
/// السجلّ منتظِرًا بمحاولة صفر — العنصر من هذه اللحظة ينجو من تنظيف المؤقّت
/// وإغلاق التطبيق وانقطاع الشبكة
pub fn queue_file(
    frames: &Path,
    root: &Path,
    session_id: &str,
    local_id: &str,
) -> Result<QueueRecord, String> {
    if ItemKind::from_local_id(local_id) != Some(ItemKind::Shot) {
        return Err(format!("localId غير صالح للقطة: {local_id}"));
    }
    std::fs::create_dir_all(root).map_err(|e| format!("تعذّر إنشاء مجلد الطابور: {e}"))?;
    let src = frames.join(format!("{local_id}.jpg"));
    let dst = owned_path(root, local_id, ItemKind::Shot)?;
    std::fs::copy(&src, &dst).map_err(|_| {
        format!(
            "الإطار المحروق غير موجود عند {} — لا يُسجَّل عنصر بلا بايتاته",
            src.display()
        )
    })?;
    let rec = QueueRecord {
        session_id: session_id.to_string(),
        local_id: local_id.to_string(),
        shot_path: src.display().to_string(),
        state: QueueState::Pending,
        error_ar: None,
        attempt: 0,
        kind: ItemKind::Shot,
    };
    write_record_atomic(root, &rec)?;
    Ok(rec)
}

/// فكّ ‏base64 قياسي (RFC 4648 بحشو) — قرين الترميز في ‏burn.rs، بلا تبعيّة.
/// محارف خارج الأبجدية أو طولٌ غير سليم ⇐ خطأ لا بايتات مصمتة
pub fn base64_decode(text: &str) -> Result<Vec<u8>, String> {
    let value_of = |c: u8| -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };
    let raw: Vec<u8> = text.bytes().filter(|b| !b" \r\n".contains(b)).collect();
    let body = match raw.iter().position(|&c| c == b'=') {
        Some(pos) => {
            let pad = &raw[pos..];
            if pad.len() > 2 || pad.iter().any(|&c| c != b'=') {
                return Err("ترميز base64 بحشو فاسد".into());
            }
            &raw[..pos]
        }
        None => &raw[..],
    };
    if body.len() * 6 % 8 > 5 {
        return Err("ترميز base64 بطول غير سليم".into());
    }
    let mut out = Vec::with_capacity(body.len() * 3 / 4 + 3);
    for chunk in body.chunks(4) {
        if chunk.len() < 2 {
            return Err("ترميز base64 بمجموعة ناقصة".into());
        }
        let mut n: u32 = 0;
        for (i, &c) in chunk.iter().enumerate() {
            let v = value_of(c).ok_or_else(|| format!("محرف base64 غريب: {}", c as char))?;
            n |= (v as u32) << (18 - 6 * i);
        }
        out.push((n >> 16) as u8);
        if chunk.len() > 2 {
            out.push((n >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(n as u8);
        }
    }
    Ok(out)
}

/// إضافة تعليق صوتي: بايتات ‏webm تصل من الودجة (بعد فكّ الترميز في الأمر)
/// وتُكتب **نسخةً مملوكة** ذرّيًّا ثم سجلٌّ منتظِر بنوعه — العنصر من هذه اللحظة
/// ينجو من الإغلاق وانقطاع الشبكة كاللقطات تمامًا
pub fn queue_audio_bytes(
    root: &Path,
    session_id: &str,
    local_id: &str,
    webm: &[u8],
) -> Result<QueueRecord, String> {
    if ItemKind::from_local_id(local_id) != Some(ItemKind::Audio) {
        return Err(format!("localId غير صالح للصوت: {local_id}"));
    }
    std::fs::create_dir_all(root).map_err(|e| format!("تعذّر إنشاء مجلد الطابور: {e}"))?;
    let dst = owned_path(root, local_id, ItemKind::Audio)?;
    let tmp = root.join(format!("{local_id}.webm.tmp"));
    std::fs::write(&tmp, webm).map_err(|e| format!("كتابة الصوت فشلت: {e}"))?;
    std::fs::rename(&tmp, &dst).map_err(|e| format!("تثبيت الصوت فشل: {e}"))?;
    let rec = QueueRecord {
        session_id: session_id.to_string(),
        local_id: local_id.to_string(),
        shot_path: "audio-webm-inline".to_string(),
        state: QueueState::Pending,
        error_ar: None,
        attempt: 0,
        kind: ItemKind::Audio,
    };
    write_record_atomic(root, &rec)?;
    Ok(rec)
}

fn read_records(root: &Path) -> Vec<QueueRecord> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        // ‏.json.tmp قيد الكتابة الذرّيّة لا يُقرأ أبدًا
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        if let Ok(txt) = std::fs::read_to_string(&p) {
            if let Ok(rec) = parse_record(&txt) {
                out.push(rec);
            }
        }
    }
    out.sort_by(|a, b| a.local_id.cmp(&b.local_id));
    out
}

/// المنتظرون مرتَّبين بمعرّفهم — قراءة لقطة (snapshot) للتمريرة
pub fn list_pending(root: &Path) -> Vec<QueueRecord> {
    read_records(root)
        .into_iter()
        .filter(|r| r.state == QueueState::Pending)
        .collect()
}

/// الفاشلون نهائيًّا — لا يُحذفون، بانتظار ‏queue_retry_failed
pub fn list_failed(root: &Path) -> Vec<QueueRecord> {
    read_records(root)
        .into_iter()
        .filter(|r| r.state == QueueState::Failed)
        .collect()
}

/// فشل نهائيّ (‏400/413): علِّم السجلّ بالسبب العربيّ — **النسخة تبقى**
pub fn mark_failed(root: &Path, rec: &QueueRecord, error_ar: &str) -> Result<(), String> {
    let mut r = rec.clone();
    r.state = QueueState::Failed;
    r.error_ar = Some(error_ar.to_string());
    write_record_atomic(root, &r)
}

/// حفظ عدّاد التراجع بعد ردٍّ عابر — الحالة تبقى منتظِرة
pub fn save_attempt(root: &Path, rec: &QueueRecord, attempt: u32) -> Result<(), String> {
    let mut r = rec.clone();
    r.attempt = attempt;
    write_record_atomic(root, &r)
}

/// إعادة كل الفاشلين إلى الانتظار بمحاولة صفر — يعيد العدد المُعاد
pub fn retry_failed(root: &Path) -> Result<u32, String> {
    let mut n = 0u32;
    for rec in list_failed(root) {
        let mut r = rec;
        r.state = QueueState::Pending;
        r.error_ar = None;
        r.attempt = 0;
        write_record_atomic(root, &r)?;
        n += 1;
    }
    Ok(n)
}

/// حذف عنصر نجح: السجلّ **والنسخة** معًا — امتداد النسخة يقرأ من نوع السجلّ
pub fn remove_item(root: &Path, local_id: &str) -> Result<(), String> {
    let record = record_path(root, local_id)?;
    let rec = std::fs::read_to_string(&record)
        .ok()
        .and_then(|t| parse_record(&t).ok());
    let owned = match rec {
        Some(r) => owned_path(root, local_id, r.kind)?,
        None => return Err(format!("سجلّ الطابور غير موجود: {local_id}")),
    };
    // النسخة قد تكون غابت يدويًّا — غيابها ليس عائقًا لحذف السجلّ
    let _ = std::fs::remove_file(&owned);
    std::fs::remove_file(&record).map_err(|e| format!("حذف عنصر الطابور فشل: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// مجلدات اختبار معزولة حسب الاختبار
    struct TmpDirs {
        base: PathBuf,
    }
    impl TmpDirs {
        fn new(tag: &str) -> Self {
            let base = std::env::temp_dir().join(format!("itqan-queue-test-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&base);
            std::fs::create_dir_all(base.join("frames")).unwrap();
            std::fs::create_dir_all(base.join("queue")).unwrap();
            TmpDirs { base }
        }
        fn frames(&self) -> PathBuf {
            self.base.join("frames")
        }
        fn queue(&self) -> PathBuf {
            self.base.join("queue")
        }
        /// بايتات ‏JPEG مقبولة للفحص (بصمة ‏FFD8FF)
        fn put_frame(&self, local_id: &str) {
            let mut b = vec![0xFFu8, 0xD8, 0xFF, 0xE0];
            b.extend(std::iter::repeat(0xABu8).take(64));
            std::fs::write(self.frames().join(format!("{local_id}.jpg")), b).unwrap();
        }
    }
    impl Drop for TmpDirs {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.base);
        }
    }

    #[test]
    fn جولة_السجل_تحفظ_الحقول_والاختيارية_يغيب_بغيابه() {
        let rec = QueueRecord {
            session_id: "s-1a2b".into(),
            local_id: "f-8".into(),
            shot_path: "C:\\Temp\\itqan-frames\\f-8.jpg".into(),
            state: QueueState::Pending,
            error_ar: None,
            attempt: 3,
            kind: ItemKind::Shot,
        };
        let parsed = parse_record(&serialize_record(&rec)).unwrap();
        assert_eq!(parsed, rec);
        // نصّ السجلّ بصيغة الخطة: pending/failed بلا حالة ثالثة
        let txt = serialize_record(&rec);
        assert!(txt.contains("\"state\":\"pending\""), "{txt}");
        assert!(!txt.contains("error_ar"), "الاختياري الغائب لا يُكتب: {txt}");
        // والفاشل يحمل سببه
        let mut f = rec.clone();
        f.state = QueueState::Failed;
        f.error_ar = Some("رفض الخادم الملفّ".into());
        let txt = serialize_record(&f);
        assert!(txt.contains("\"state\":\"failed\"") && txt.contains("رفض الخادم الملفّ"), "{txt}");
    }

    #[test]
    fn حارس_المعرّف_يرفض_اجتياح_المسار_كحارس_الإطارات() {
        assert!(valid_local_id("f-42"));
        assert!(valid_local_id("f-0"));
        for bad in ["../evil", "f-1x", "f-", "", "x-1", "f-1/2", "f--1", "F-1"] {
            assert!(!valid_local_id(bad), "«{bad}» يجب أن يُرَدّ");
        }
    }

    #[test]
    fn الاضافة_تنسخ_اللقطة_الى_ملكيّة_الطابور_وتكتب_سجلا_منتظرا_بلا_ملف_معلق() {
        let t = TmpDirs::new("add");
        t.put_frame("f-9");
        let rec = queue_file(&t.frames(), &t.queue(), "s-itest", "f-9").unwrap();
        assert_eq!(rec.state, QueueState::Pending);
        assert_eq!(rec.attempt, 0);
        assert_eq!(rec.session_id, "s-itest");
        // النسخة المملوكة بايتاتٌ مطابقة
        let owned = t.queue().join("f-9.jpg");
        assert_eq!(
            std::fs::read(&owned).unwrap(),
            std::fs::read(t.frames().join("f-9.jpg")).unwrap()
        );
        // السجلّ مقروء والكتابة تركت لا ‏.tmp
        let parsed = parse_record(&std::fs::read_to_string(t.queue().join("f-9.json")).unwrap()).unwrap();
        assert_eq!(parsed, rec);
        let names: Vec<_> = std::fs::read_dir(t.queue()).unwrap().flatten()
            .map(|e| e.file_name().to_string_lossy().to_string()).collect();
        assert_eq!(names.len(), 2, "سجلّ + نسخة حصرًا، لا ‏.tmp: {names:?}");
    }

    #[test]
    fn الاضافة_بلا_إطار_محرور_ترد_خطأ_ولا_تكتب_شيئا() {
        let t = TmpDirs::new("noframe");
        let err = queue_file(&t.frames(), &t.queue(), "s-itest", "f-7").unwrap_err();
        assert!(err.contains("غير موجود"), "{err}");
        assert!(std::fs::read_dir(t.queue()).unwrap().flatten().count() == 0);
        // ومعرّف اجتياح يُرَدّ قبل أيّ لمس قرص
        assert!(queue_file(&t.frames(), &t.queue(), "s", "../evil").is_err());
    }

    #[test]
    fn القوائم_تفصل_المنتظر_عن_الفاشل_مرتبة_وتتجاهل_قيد_الكتابة() {
        let t = TmpDirs::new("lists");
        for id in ["f-1", "f-2", "f-3"] {
            t.put_frame(id);
            queue_file(&t.frames(), &t.queue(), "s", id).unwrap();
        }
        mark_failed(&t.queue(), &list_pending(&t.queue())[2], "سقف الحجم").unwrap();
        // سجلّ قيد الكتابة الذرّيّة لا يدخل القوائم
        std::fs::write(t.queue().join("f-4.json.tmp"), "نصف مكتوب").unwrap();
        let pending = list_pending(&t.queue());
        let failed = list_failed(&t.queue());
        assert_eq!(pending.iter().map(|r| r.local_id.as_str()).collect::<Vec<_>>(), ["f-1", "f-2"]);
        assert_eq!(failed.iter().map(|r| r.local_id.as_str()).collect::<Vec<_>>(), ["f-3"]);
        assert_eq!(failed[0].error_ar.as_deref(), Some("سقف الحجم"));
    }

    #[test]
    fn الفشل_يبقي_النسخة_وإعادة_المحاولة_تصفّر_العدّاد_والمحاولة_العابرة_ترفع_العدّاد() {
        let t = TmpDirs::new("states");
        t.put_frame("f-5");
        let rec = queue_file(&t.frames(), &t.queue(), "s", "f-5").unwrap();
        // محاولة عابرة: العدّاد يرتفع والحالة منتظرة
        save_attempt(&t.queue(), &rec, 2).unwrap();
        let r2 = &list_pending(&t.queue())[0];
        assert_eq!(r2.attempt, 2);
        // فشل نهائيّ: السبب يُحفظ والنسخة باقية
        mark_failed(&t.queue(), r2, "تجاوز الحجم").unwrap();
        let failed = list_failed(&t.queue());
        assert_eq!(failed.len(), 1);
        assert!(t.queue().join("f-5.jpg").exists(), "النسخة لا تُمسّ عند الفشل");
        // الإعادة: منتظَر بمحاولة صفر وبلا سبب
        assert_eq!(retry_failed(&t.queue()).unwrap(), 1);
        let again = &list_pending(&t.queue())[0];
        assert_eq!(again.attempt, 0);
        assert_eq!(again.error_ar, None);
        assert_eq!(list_failed(&t.queue()).len(), 0);
    }

    #[test]
    fn الحذف_يمسح_السجل_والنسخة_معا_وبمعرّف_فاسد_يرد() {
        let t = TmpDirs::new("remove");
        t.put_frame("f-6");
        queue_file(&t.frames(), &t.queue(), "s", "f-6").unwrap();
        remove_item(&t.queue(), "f-6").unwrap();
        assert!(!t.queue().join("f-6.json").exists());
        assert!(!t.queue().join("f-6.jpg").exists());
        assert!(remove_item(&t.queue(), "../evil").is_err());
        // حذف مُكرَّر بعد غياب النسخة يدويًّا: يسكت إن غاب السجلّ؟ لا — السجلّ هو الحكم
        t.put_frame("f-8");
        queue_file(&t.frames(), &t.queue(), "s", "f-8").unwrap();
        std::fs::remove_file(t.queue().join("f-8.jpg")).unwrap();
        remove_item(&t.queue(), "f-8").unwrap(); // غياب النسخة لا يمنع حذف السجلّ
        assert!(!t.queue().join("f-8.json").exists());
    }

    // ---------- الصوت (المرحلة ٢): معرّفات v- وسجلّ بنوعه وملفّ ‏webm مملوك ----------

    fn audio_dirs(tag: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("itqan-audio-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let queue = base.join("queue");
        std::fs::create_dir_all(&queue).unwrap();
        (queue, base)
    }

    /// بايتات ‏webm شكلية (بصمة ‏EBML + حشو) كما ينتجها MediaRecorder
    fn webm_bytes() -> Vec<u8> {
        let mut b = vec![0x1Au8, 0x45, 0xDF, 0xA3];
        b.extend(std::iter::repeat(0x42u8).take(48));
        b
    }

    #[test]
    fn الصوت_يسجل_بنوعه_وملفه_الويبم_ذرّيا_وبلا_معلق() {
        let (q, base) = audio_dirs("add");
        let rec = queue_audio_bytes(&q, "s-it", "v-7", &webm_bytes()).unwrap();
        assert_eq!(rec.kind, ItemKind::Audio);
        assert_eq!(rec.state, QueueState::Pending);
        assert_eq!(rec.attempt, 0);
        // النسخة المملوكة بامتداد الصوت وبايتات مطابقة
        assert_eq!(std::fs::read(q.join("v-7.webm")).unwrap(), webm_bytes());
        let parsed = parse_record(&std::fs::read_to_string(q.join("v-7.json")).unwrap()).unwrap();
        assert_eq!(parsed.kind, ItemKind::Audio);
        let names: Vec<_> = std::fs::read_dir(&q).unwrap().flatten()
            .map(|e| e.file_name().to_string_lossy().to_string()).collect();
        assert_eq!(names.len(), 2, "سجلّ + نسخة حصرًا لا ‏.tmp: {names:?}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn النوع_يتبع_البادئة_والقديم_بلا_نوع_يقرأ_لقطة() {
        // المعرفات: ‏f- لقطة و‏v- صوت وأيّ شيء آخر مرفوض
        assert_eq!(ItemKind::from_local_id("f-12"), Some(ItemKind::Shot));
        assert_eq!(ItemKind::from_local_id("v-12"), Some(ItemKind::Audio));
        for bad in ["../evil", "f-", "v-", "x-1", "f-1x", "v-1a", "f-v-1"] {
            assert_eq!(ItemKind::from_local_id(bad), None, "«{bad}» مرفوض");
        }
        // سجلّ قديم على القرص بلا حقل kind يقرأ لقطة (توافق تام)
        let legacy = r#"{"session_id":"s","local_id":"f-3","shot_path":"x","state":"pending","attempt":0}"#;
        assert_eq!(parse_record(legacy).unwrap().kind, ItemKind::Shot);
        // والمسارات المملوكة تختار الامتداد بالنوع
        assert!(queued_owned_path(&std::path::Path::new("q").to_path_buf(),
            &QueueRecord { session_id: "s".into(), local_id: "v-1".into(), shot_path: String::new(), state: QueueState::Pending, error_ar: None, attempt: 0, kind: ItemKind::Audio })
            .unwrap().to_string_lossy().ends_with("v-1.webm"));
        // حرس الاسم: لقطة بمعرّف صوت تُرَدّ والعكس
        let (q, base) = audio_dirs("guard");
        assert!(queue_file(&q, &q, "s", "v-1").is_err(), "لقطة بمعرّف v- مرفوضة");
        assert!(queue_audio_bytes(&q, "s", "f-1", &webm_bytes()).is_err(), "صوت بمعرّف f- مرفوض");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn فك_الترميز_يعيد_بايتات_الترميز_بضبط_وعابث_يرد() {
        let bytes = webm_bytes();
        let round = base64_decode(&crate::sensors::burn::base64_encode(&bytes)).unwrap();
        assert_eq!(round, bytes);
        assert!(base64_decode("").unwrap().is_empty());
        assert!(base64_decode("!!! غير ترميز !!!").is_err());
    }
}
