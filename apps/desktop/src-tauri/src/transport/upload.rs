//! عامل الرفع (٣د-٢) — خيط خلفيّ واحد يمسح الطابور ويرفع **النسخة المملوكة
//! المحروقة** إلى ‏/api/uploads: ‏multipart حقل ‏file + ‏Bearer من الخزنة داخل
//! Rust + ‏Idempotency-Key مشتقّ من الجلسة والمعرّف. القرار بعد كلّ ردّ من
//! سياسة §٣.٥ حصرًا. ‏401 يمحو الاعتماد ويوقف العامل **ولا يمسّ أيّ عنصر** —
//! وبقاؤهما اختبارٌ صريح. الرمز لا يُسجَّل ولا يُبثّ؛ رسائل الخطأ ثابتة.
//!
//! تنويه مفتاح عدم التكرار: عقد ‏api يقبل ‏٨–١٢٨ حرفًا من ‏[A-Za-z0-9_-] فقط
//! (‏`IDEM_KEY_RE`)، و‏localId الخام ‏«f-8» أقصرُ من ذلك ويصطدم عبر الجلسات —
//! فالمفتاح المشتقّ ‏`file-{sessionId}-{localId}` يحمل الهويّتين ويحقّ العقد.

use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use crate::transport::{guide_queue, pair, policy, queue, vault};

/// مفتاح عدم التكرار المشتقّ — نقية للتثبيت
pub fn idempotency_key(session_id: &str, local_id: &str) -> String {
    format!("file-{session_id}-{local_id}")
}

/// مفتاح الصوت المشتقّ — بادئة مغايرة كي لا يتصادم تعليقٌ بلقطةٍ ولو تساوت
/// اللاحقة الرقميّة (‏v-8 مقابل ‏f-8)
pub fn audio_idempotency_key(session_id: &str, local_id: &str) -> String {
    format!("audio-{session_id}-{local_id}")
}

/// مفتاح العنصر من سجلّه بنوعه
pub fn key_for(rec: &queue::QueueRecord) -> String {
    match rec.kind {
        queue::ItemKind::Shot => idempotency_key(&rec.session_id, &rec.local_id),
        queue::ItemKind::Audio => audio_idempotency_key(&rec.session_id, &rec.local_id),
    }
}

/// خطوة العامل بعد التصنيف — قرار نقية يُختبَر صفًّا صفًّا
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ItemStep {
    /// 200: احذف السجلّ والنسخة وابثّ uploaded
    Finish,
    /// 400/413: فشل نهائيّ بسبب عربيّ — النسخة تبقى
    Fail { error_ar: String },
    /// 409 ثوانٍ ثابتة بلا زيادة عدّاد · 429/5xx/شبكة تراجعٌ يزيد العدّاد
    Retry { delay_ms: u64, grow_attempt: bool },
    /// 401: امحُ الاعتماد وأوقف وبثّ lost — لا تمسّ العناصر
    Lost,
}

/// خريطة فعل §٣.٥ إلى خطوة العامل
pub fn next_step(action: policy::Action, attempt: u32) -> ItemStep {
    match action {
        policy::Action::Done => ItemStep::Finish,
        policy::Action::AuthLost => ItemStep::Lost,
        policy::Action::Failed => ItemStep::Fail {
            error_ar: "رفض الخادم الملفّ — تجاوز الحدّ أو صيغة غير مدعومة".into(),
        },
        policy::Action::RetrySoon => ItemStep::Retry { delay_ms: 3_000, grow_attempt: false },
        // العابر: التراجع الأُسّي من المحاولة الحالية؛ ‏428 لا يصحّ من الرفع
        // فيُعامَل عابرًا كأبقى الأسلم
        policy::Action::Backoff | policy::Action::Pending => ItemStep::Retry {
            delay_ms: policy::backoff_next(attempt).as_millis() as u64,
            grow_attempt: true,
        },
    }
}

/// بثّ العامل — الإنتاج يبثّ لأحداث §٢ والاختبار يسجّل
pub enum WorkerEvent {
    Uploaded {
        session_id: String,
        local_id: String,
        file_id: String,
        thumb_file_id: Option<String>,
    },
    /// نجاح إنشاء دليل — ‏guideId من حقل ‏id في الردّ وحده (القاعدة الذهبيّة)
    GuideCreated {
        session_id: String,
        guide_id: String,
    },
    Lost {
        reason_ar: String,
    },
    Status(QueueStatus),
}

/// عدّادات حالة الطابور لعقد ‏queue://status (pendingGuides تصفيرٌ حتى ٣د-٣)
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStatus {
    pub pending_files: u32,
    pub pending_guides: u32,
    pub failed: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error_ar: Option<String>,
}

pub trait UploadSink: Send + Sync {
    fn on_event(&self, ev: WorkerEvent);
}

/// محقونات الإدخال/الخارج للتمريرة — الإنتاج يغلّف الخزنة والسكون الحقيقيّ
/// والاختبار يحقن بدائل حاسمة (فالمنطق يُختبر بلا مدير اعتماد ولا انتظار)
pub struct WorkerIo<'a> {
    pub token_of: &'a dyn Fn(&str) -> Option<String>,
    pub forget_token: &'a dyn Fn(&str) -> Result<(), String>,
    pub sleep: &'a mut dyn FnMut(Duration),
}

/// حصيلة تمريرة واحدة على الطابور
#[derive(Debug, Default, PartialEq)]
pub struct PassReport {
    pub uploaded: u32,
    pub failed: u32,
    /// توقّف العامل (‏401 أو لا رمز) — العناصر بقيت
    pub stopped: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadOk {
    file_id: String,
    thumb_file_id: Option<String>,
}

enum UploadReply {
    Status(u16, String),
    Network,
}

/// ‏POST مشترك لمسارات الرفع الثلاثة: الحامل + ‏Idempotency-Key ثم إرسال
/// وخريطة الردّ نفسها (status/نصّ أو شبكة) — ما يميّز كل مسار يُكمل البناء
fn post_once(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    key: &str,
    finish: impl FnOnce(reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder,
) -> UploadReply {
    match finish(client.post(url).bearer_auth(token).header("Idempotency-Key", key)).send() {
        Ok(r) => {
            let status = r.status().as_u16();
            match r.text() {
                Ok(b) => UploadReply::Status(status, b),
                Err(_) => UploadReply::Network,
            }
        }
        Err(_) => UploadReply::Network,
    }
}

fn upload_once(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    key: &str,
    shot: &Path,
) -> UploadReply {
    let part = match reqwest::blocking::multipart::Part::file(shot) {
        Ok(p) => p,
        Err(_) => return UploadReply::Network, // نسخة غابت: عابر — السجلّ يحكمها الدورة القادمة
    };
    let form = reqwest::blocking::multipart::Form::new().part("file", part);
    post_once(client, url, token, key, |r| r.multipart(form))
}

/// بثّ حالة الطابور من القرصين — ‏pendingGuides عدّادٌ حقيقيّ (٣د-٣)،
/// ‏failed جمعُ الطابورين، والسبب الأخير يُحمَل بالبثّ (طيّ معلَّق ج)
fn emit_status<S: UploadSink + ?Sized>(
    sink: &S,
    files_root: &Path,
    guides_root: &Path,
    last_error_ar: Option<&str>,
) {
    let st = QueueStatus {
        pending_files: queue::list_pending(files_root).len() as u32,
        pending_guides: guide_queue::list_pending(guides_root).len() as u32,
        failed: (queue::list_failed(files_root).len() + guide_queue::list_failed(guides_root).len())
            as u32,
        last_error_ar: last_error_ar.map(|s| s.to_string()),
    };
    sink.on_event(WorkerEvent::Status(st));
}

/// سياق الشبكة للتمريرة المشتركة — تعتمده مغلقات الرفع والنجاح بدل تكرار
/// الوسائط في كلّ توقيع
struct PassCtx<'a> {
    client: &'a reqwest::blocking::Client,
    url: &'a str,
    origin: &'a str,
}

/// حصيلة تحليل ردّ النجاح داخل التمريرة المشتركة — تُكمِل السلّم أو تُغلِق
/// جولات العنصر
enum SuccessOutcome {
    /// حُذف العنصر وبُثّ نجاحه — سجِّل نجاحًا وأغلِق جولاته
    Done,
    /// تعذّر حذف العنصر — بثِّ السبب وأغلِق جولاته
    Blocked(String),
    /// ‏200 بلا معرّف مفهوم — لا حذف ولا نجاح زائف: عابر يتدرّج
    Unreadable,
}

/// عدّاد المحاولات المشترك بين سجلّي الطابورين — سلّم التراجع يقرؤه ويزيده
/// مهما اختلف السجلّ (اسمَي المعرّف وبقية الحقول لا يشتركان في شيء هنا)
trait PassItem {
    fn attempt(&self) -> u32;
    fn set_attempt(&mut self, attempt: u32);
}

impl PassItem for queue::QueueRecord {
    fn attempt(&self) -> u32 {
        self.attempt
    }
    fn set_attempt(&mut self, attempt: u32) {
        self.attempt = attempt;
    }
}

impl PassItem for guide_queue::QueuedGuide {
    fn attempt(&self) -> u32 {
        self.attempt
    }
    fn set_attempt(&mut self, attempt: u32) {
        self.attempt = attempt;
    }
}

/// ما يميّز تمريرة طابورٍ عن غيره حصرًا — والبقيّة سلّمٌ مشترك في ‏run_pass:
/// مسارُ ‏API، ولقطةُ عناصر الطابور، ومفتاحُه ومسارُ بايتاته ورفعُه وتحليلُ
/// نجاحه، وعملياتُ حالته على سجلّيه، وعبارةُ رفضه النهائيّ بمصطلحه
struct PassSpec<'a, T> {
    api_path: &'a str,
    /// الجذران لبثّ الحالة بترتيب ‏emit_status نفسه (ملفّات ثم أدلّة)
    status_roots: (&'a Path, &'a Path),
    /// رسالة الرفض النهائيّ من الخادم بمصطلح الطابور
    fail_msg: &'a str,
    items: Vec<T>,
    key_of: &'a dyn Fn(&T) -> String,
    /// مسار بايتات العنصر — فشلُه يوقف التمريرة كلّها بلا شبكة (حكم مشترك)
    prep_path: &'a dyn Fn(&T) -> Result<PathBuf, String>,
    /// الرفع بجسمه الخاص — ‏Err فشلُ العنصر نهائيًّا بسببِه العربيّ
    /// (فقدُ الجسم من القرص لا يُرمق بجولات)
    upload: &'a dyn Fn(&PassCtx<'_>, &T, &Path, &str, &str) -> Result<UploadReply, String>,
    /// تحليل ردّ النجاح وحسمُه: حذفٌ وبثٌّ نجاح (وتفريغٌ خادميّ للأدلّة
    /// فيه الصوت) — والردّ غير المفهوم يعود عابرًا يتدرّج
    on_success: &'a mut dyn FnMut(&PassCtx<'_>, &T, &str, &str) -> SuccessOutcome,
    mark_failed: &'a dyn Fn(&T, &str),
    save_attempt: &'a dyn Fn(&T, u32),
}

/// السلّم المشترك للتمريرتين — بناءُ العميل وعنوانُ الرفع ثم جولاتٌ لكل عنصر
/// حتى حكمٍ نهائيّ أو نفاد الجولات: رمزٌ قبل كلّ محاولة، تصنيفُ الردّ بفعل
/// ‏§٣.٥، وحسمُ النجاح بفكّ الجسم قبل الثقة. ‏401 يوقف التمريرة كلّها فورًا
/// بما بقي فيها من عناصر
fn run_pass<T: PassItem, S: UploadSink + ?Sized>(
    origin: &str,
    sink: &S,
    io: &mut WorkerIo<'_>,
    max_rounds: u32,
    spec: PassSpec<'_, T>,
) -> PassReport {
    let PassSpec {
        api_path,
        status_roots: (files_root, guides_root),
        fail_msg,
        items,
        key_of,
        prep_path,
        upload,
        on_success,
        mark_failed,
        save_attempt,
    } = spec;
    let mut report = PassReport::default();
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            emit_status(sink, files_root, guides_root, Some("تهيئة عميل الشبكة فشلت"));
            return report;
        }
    };
    let url = match pair::http_url(origin, api_path) {
        Ok(u) => u,
        Err(e) => {
            emit_status(sink, files_root, guides_root, Some(&e));
            return report;
        }
    };
    let ctx = PassCtx { client: &client, url: &url, origin };
    for item in items {
        let mut rec = item;
        let key = key_of(&rec);
        let mut rounds = 0u32;
        loop {
            if rounds >= max_rounds {
                break; // ما زال منتظِرًا — الدورة القادمة تكمل من عدّاده المحفوظ
            }
            rounds += 1;
            let Some(token) = (io.token_of)(origin) else {
                // لا اعتماد: لم يُقترن أو أُبطل — توقّف بلا شبكة ولا مسّ عناصر
                report.stopped = true;
                emit_status(sink, files_root, guides_root, None);
                return report;
            };
            let path = match prep_path(&rec) {
                Ok(p) => p,
                Err(e) => {
                    emit_status(sink, files_root, guides_root, Some(&e));
                    return report;
                }
            };
            // فشل الدليل/الملفّ بمصطلحه — البقيّة من السلّم المشترك
            let classified = |status: u16| {
                match next_step(policy::classify_response(status), rec.attempt()) {
                    ItemStep::Fail { .. } => ItemStep::Fail { error_ar: fail_msg.to_string() },
                    other => other,
                }
            };
            let (body, mut step) = match upload(&ctx, &rec, &path, &token, &key) {
                Ok(UploadReply::Status(s, b)) => (b, classified(s)),
                Ok(UploadReply::Network) => (String::new(), classified(0)),
                Err(error_ar) => (String::new(), ItemStep::Fail { error_ar }),
            };
            if step == ItemStep::Finish {
                match on_success(&ctx, &rec, &body, &token) {
                    SuccessOutcome::Done => {
                        report.uploaded += 1;
                        emit_status(sink, files_root, guides_root, None);
                        break;
                    }
                    SuccessOutcome::Blocked(e) => {
                        emit_status(sink, files_root, guides_root, Some(&e));
                        break;
                    }
                    SuccessOutcome::Unreadable => {
                        step = next_step(policy::Action::Backoff, rec.attempt())
                    }
                }
            }
            match step {
                ItemStep::Finish => unreachable!("النجاح حُدِّث أعلاه"),
                ItemStep::Fail { error_ar } => {
                    mark_failed(&rec, &error_ar);
                    report.failed += 1;
                    // طيّ معلَّق (ج): سبب الفشل يعبر في البثّ لا في السجلّ وحده
                    emit_status(sink, files_root, guides_root, Some(&error_ar));
                    break;
                }
                ItemStep::Retry { delay_ms, grow_attempt } => {
                    if grow_attempt {
                        rec.set_attempt(rec.attempt() + 1);
                        save_attempt(&rec, rec.attempt());
                    }
                    emit_status(sink, files_root, guides_root, None);
                    (io.sleep)(Duration::from_millis(delay_ms));
                    continue;
                }
                ItemStep::Lost => {
                    // الرمز أُبطل: امحُ الاعتماد وابثّ واحكم ببقاء العناصر
                    let _ = (io.forget_token)(origin);
                    sink.on_event(WorkerEvent::Lost {
                        reason_ar: "انتهت صلاحية اتصال الجهاز — أعد الاقتران من الإعدادات".into(),
                    });
                    report.stopped = true;
                    emit_status(
                        sink,
                        files_root,
                        guides_root,
                        Some("انتهت صلاحية اتصال الجهاز — أعد الاقتران"),
                    );
                    return report;
                }
            }
        }
    }
    report
}
/// تمريرة واحدة على طابور الملفّات: كل منتظِر يُجرَّب حتى حكمٍ نهائيّ أو نفاد
/// الجولات. التراجع **داخل العنصر** بالمفتاح نفسه كما تقضي §٣.٥، و‏401 يوقف
/// التمريرة كلّها فورًا بما بقي فيها من عناصر.
pub fn process_pending<S: UploadSink + ?Sized>(
    root: &Path,
    guides_root: &Path,
    origin: &str,
    sink: &S,
    io: &mut WorkerIo<'_>,
    max_rounds: u32,
) -> PassReport {
    run_pass(origin, sink, io, max_rounds, PassSpec {
        api_path: "/api/uploads",
        status_roots: (root, guides_root),
        fail_msg: "رفض الخادم الملفّ — تجاوز الحدّ أو صيغة غير مدعومة",
        items: queue::list_pending(root),
        key_of: &|rec| key_for(rec),
        prep_path: &|rec| queue::queued_owned_path(root, rec),
        upload: &|ctx, _rec, path, token, key| {
            Ok(upload_once(ctx.client, ctx.url, token, key, path))
        },
        // الجسم يُحلَّ قبل الثقة بالنجاح — ‏200 بلا معرّف لا يحذف شيئًا
        on_success: &mut |_ctx, rec, body, _token| {
            match serde_json::from_str::<UploadOk>(body) {
                Ok(ok) => match queue::remove_item(root, &rec.local_id) {
                    Ok(()) => {
                        sink.on_event(WorkerEvent::Uploaded {
                            session_id: rec.session_id.clone(),
                            local_id: rec.local_id.clone(),
                            file_id: ok.file_id,
                            thumb_file_id: ok.thumb_file_id,
                        });
                        SuccessOutcome::Done
                    }
                    Err(e) => SuccessOutcome::Blocked(e),
                },
                Err(_) => SuccessOutcome::Unreadable,
            }
        },
        mark_failed: &|rec, error_ar| {
            let _ = queue::mark_failed(root, rec, error_ar);
        },
        save_attempt: &|rec, attempt| {
            let _ = queue::save_attempt(root, rec, attempt);
        },
    })
}

/// ‏POST بجسم نصّي جاهز (دليل معتِم) — بلا فكّ ولا بناء
fn upload_json_once(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    key: &str,
    body: &str,
) -> UploadReply {
    post_once(client, url, token, key, |r| {
        r.header(reqwest::header::CONTENT_TYPE, "application/json").body(body.to_string())
    })
}

/// ‏POST تفريغ خادميّ بلا جسم — كماليّة بعد نجاح الدليل: فشلُه الصامت مقصود
/// (يُعاد من المحرّر لاحقًا) ولا يمسّ الدليل ولا الطابور. المفتاح ‏stt-{id}
/// نيةَ منع التكرار إن قبله الخادم وتجاهله إن لم يكن بحاجته
fn transcribe_steps_once(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    key: &str,
) -> UploadReply {
    post_once(client, url, token, key, |r| r)
}

/// تمريرة واحدة على طابور الأدلّة (٣د-٣) — سلّم §٣.٥ نفسه: الجسم نصٌّ
/// **معتِم** يُقرأ من الطابور ويُرسل كما بناه TS بلا فكّ (القاعدة الذهبيّة)،
/// ومفتاح عدم التكرار ‏guide-{sessionId}، ومن الردّ يُقرأ حقل ‏id وحده.
pub fn process_guides<S: UploadSink + ?Sized>(
    root: &Path,
    files_root: &Path,
    origin: &str,
    sink: &S,
    io: &mut WorkerIo<'_>,
    max_rounds: u32,
) -> PassReport {
    run_pass(origin, sink, io, max_rounds, PassSpec {
        api_path: "/api/guides",
        status_roots: (files_root, root),
        fail_msg: "رفض الخادم الدليل — بنية غير صالحة",
        items: guide_queue::list_pending(root),
        key_of: &|rec| guide_queue::guide_key(&rec.session_id),
        prep_path: &|rec| guide_queue::queued_body_path(root, &rec.session_id),
        // الجسم من القرص كما هو — فقدُه فشلٌ نهائيّ صادق لا عابر يُرمق
        upload: &|ctx, _rec, path, token, key| match std::fs::read_to_string(path) {
            Ok(body_text) => Ok(upload_json_once(ctx.client, ctx.url, token, key, &body_text)),
            Err(_) => Err("فقد جسم الدليل من الطابور".into()),
        },
        // حقل ‏id وحده هو العقد — لا فكّ لردّ الدليل ولا فهرسة بنيته
        on_success: &mut |ctx, rec, body, token| {
            let guide_id = serde_json::from_str::<serde_json::Value>(body)
                .ok()
                .and_then(|v| v.get("id").and_then(|x| x.as_str()).map(String::from));
            match guide_id {
                Some(guide_id) => match guide_queue::remove_item(root, &rec.session_id) {
                    Ok(()) => {
                        sink.on_event(WorkerEvent::GuideCreated {
                            session_id: rec.session_id.clone(),
                            guide_id: guide_id.clone(),
                        });
                        // المرحلة ٢-م٥: فيه تعليق صوتيّ ⇐ أطلق التفريغ الخادميّ
                        // بBearer الجهاز (الرمز محروس هنا). الصمتُ عند الفشل عهد
                        // VOX — التفريغ كماليّ يُعاد من المحرّر ولا يُسقِط شيئًا
                        if rec.has_voice {
                            if let Ok(url) = pair::http_url(
                                ctx.origin,
                                &format!("/api/guides/{guide_id}/transcribe-steps"),
                            ) {
                                let _ = transcribe_steps_once(
                                    ctx.client,
                                    &url,
                                    token,
                                    &format!("stt-{guide_id}"),
                                );
                            }
                        }
                        SuccessOutcome::Done
                    }
                    Err(e) => SuccessOutcome::Blocked(e),
                },
                // ‏200 بلا معرّف مفهوم: لا حذف ولا نجاح زائف — عابر يتدرّج
                None => SuccessOutcome::Unreadable,
            }
        },
        mark_failed: &|rec, error_ar| {
            let _ = guide_queue::mark_failed(root, rec, error_ar);
        },
        save_attempt: &|rec, attempt| {
            let _ = guide_queue::save_attempt(root, rec, attempt);
        },
    })
}

/// تبعيات الخزنة حَقنة — الإنتاج يمرّر الخزنة الحقيقيّة والاختبار بدائل
pub struct WorkerDeps {
    pub token_of: Arc<dyn Fn(&str) -> Option<String> + Send + Sync>,
    pub forget_token: Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync>,
}

impl WorkerDeps {
    /// الوصل الإنتاجي: الرمز من مدير الاعتماد داخل Rust حصرًا
    pub fn vault() -> Self {
        WorkerDeps {
            token_of: Arc::new(vault::read_token),
            forget_token: Arc::new(vault::forget_token),
        }
    }
}

/// حلقة العامل: تمريرة على الملفّات ثم الأدلّة، ثم انتظار إيقاظة (أو دورة
/// دقائقيّة) — خيطٌ خلفيّ يعيش مع التطبيق
fn worker_loop(
    sink: Arc<dyn UploadSink>,
    files_root: PathBuf,
    guides_root: PathBuf,
    origin: String,
    deps: WorkerDeps,
    rx: mpsc::Receiver<()>,
) {
    loop {
        let mut io = WorkerIo {
            token_of: &*deps.token_of,
            forget_token: &*deps.forget_token,
            sleep: &mut |d| std::thread::sleep(d),
        };
        process_pending(&files_root, &guides_root, &origin, sink.as_ref(), &mut io, u32::MAX);
        process_guides(&guides_root, &files_root, &origin, sink.as_ref(), &mut io, u32::MAX);
        match rx.recv_timeout(Duration::from_secs(60)) {
            Ok(()) => {}
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// تشغيل خيط العامل على الجذرين ومنشأٍ وتبعيات معلومة — الإنتاج يغلّفه ‏wake،
/// والاختبار يستدعيه مباشرة بمحقونات
pub fn spawn_worker_thread(
    sink: Arc<dyn UploadSink>,
    files_root: PathBuf,
    guides_root: PathBuf,
    origin: String,
    deps: WorkerDeps,
) -> (std::thread::JoinHandle<()>, mpsc::Sender<()>) {
    let (tx, rx) = mpsc::channel();
    let join = std::thread::spawn(move || worker_loop(sink, files_root, guides_root, origin, deps, rx));
    (join, tx)
}

/// بثّ الإنتاج — أحداث §٢ كما هي
struct AppSink<R: tauri::Runtime> {
    app: tauri::AppHandle<R>,
}

impl<R: tauri::Runtime> UploadSink for AppSink<R> {
    fn on_event(&self, ev: WorkerEvent) {
        use tauri::Emitter;
        let _ = match ev {
            WorkerEvent::Uploaded { session_id, local_id, file_id, thumb_file_id } => self.app.emit(
                "queue://uploaded",
                serde_json::json!({
                    "sessionId": session_id,
                    "localId": local_id,
                    "fileId": file_id,
                    "thumbFileId": thumb_file_id,
                }),
            ),
            // ‏guideId من حقل id في ردّ الخادم وحده — لا بنية دليل تعبر من هنا
            WorkerEvent::GuideCreated { session_id, guide_id } => self.app.emit(
                "queue://guide-created",
                serde_json::json!({ "sessionId": session_id, "guideId": guide_id }),
            ),
            WorkerEvent::Lost { reason_ar } => {
                self.app.emit("auth://lost", serde_json::json!({ "reasonAr": reason_ar }))
            }
            WorkerEvent::Status(st) => self.app.emit("queue://status", st),
        };
    }
}

/// إيقاظة الإنتاج: خيط واحد حيّ دائمًا — الإيقاظة تصله بالقناة
pub fn wake<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    static WORKER_TX: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);
    let Ok(mut guard) = WORKER_TX.lock() else { return };
    let (Ok(files_root), Ok(guides_root)) =
        (queue::queue_files_dir(), guide_queue::guides_dir())
    else {
        return;
    };
    let origin = pair::api_origin();
    match guard.as_ref() {
        Some(tx) => {
            let _ = tx.send(());
        }
        None => {
            let sink: Arc<dyn UploadSink> = Arc::new(AppSink { app });
            let (_, tx) = spawn_worker_thread(sink, files_root, guides_root, origin, WorkerDeps::vault());
            *guard = Some(tx);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, Ordering};

    // ---------- نقية ----------

    #[test]
    fn مفتاح_عدم_التكرار_يحمل_الجلسة_والمعرّف_ويحقق_عقد_الخادم() {
        assert_eq!(idempotency_key("s-1a2b", "f-8"), "file-s-1a2b-f-8");
        // عقد api: ‏٨–١٢٨ من [A-Za-z0-9_-] — localId الخام «f-8» يُرفض وحده
        let k = idempotency_key("s-1a2b", "f-8");
        assert!(k.len() >= 8 && k.len() <= 128 && !k.is_empty());
        assert!(k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'));
        // جلستان بنفس localId ⇐ مفتاحان (لا replay يسرق لقطة جلسة أخرى)
        assert_ne!(idempotency_key("s-1", "f-8"), idempotency_key("s-2", "f-8"));
        // ومفتاح الصوت مميز عن اللقطة ويحقق العقد نفسه
        assert_eq!(audio_idempotency_key("s-1", "v-8"), "audio-s-1-v-8");
        assert_ne!(audio_idempotency_key("s-1", "v-8"), idempotency_key("s-1", "f-8"));
        let k = audio_idempotency_key("s-1", "v-8");
        assert!(k.len() >= 8 && k.len() <= 128);
        assert!(k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'));
        let audio_rec = queue::QueueRecord {
            session_id: "s-1".into(), local_id: "v-8".into(), shot_path: String::new(),
            state: queue::QueueState::Pending, error_ar: None, attempt: 0, kind: queue::ItemKind::Audio,
        };
        assert_eq!(key_for(&audio_rec), "audio-s-1-v-8");
    }

    #[test]
    fn خريطة_القرار_من_سياسة_الخطة_صفا_صفا() {
        assert_eq!(next_step(policy::Action::Done, 0), ItemStep::Finish);
        assert_eq!(next_step(policy::Action::AuthLost, 5), ItemStep::Lost);
        // ‏409: ثلاث ثوانٍ ثابتة والعدّاد لا يكبر
        assert_eq!(
            next_step(policy::Action::RetrySoon, 4),
            ItemStep::Retry { delay_ms: 3_000, grow_attempt: false }
        );
        // الفشل النهائيّ بسبب عربيّ غير فارغ
        match next_step(policy::Action::Failed, 0) {
            ItemStep::Fail { error_ar } => assert!(!error_ar.is_empty()),
            other => panic!("متوقع Fail فجاء {other:?}"),
        }
        // العابر: تراجع من المحاولة الحالية ويزيد العدّاد — ‏2s ثم ‏8s عند 2
        assert_eq!(
            next_step(policy::Action::Backoff, 0),
            ItemStep::Retry { delay_ms: 2_000, grow_attempt: true }
        );
        assert_eq!(
            next_step(policy::Action::Backoff, 2),
            ItemStep::Retry { delay_ms: 8_000, grow_attempt: true }
        );
        // ‏428 لا يصحّ من الرفع فتُعامَل عابرًا الأسلم
        assert_eq!(
            next_step(policy::Action::Pending, 1),
            ItemStep::Retry { delay_ms: 4_000, grow_attempt: true }
        );
    }

    // ---------- عتاد الاختبار: خادم مقبس مصغّر وسجلّ أحداث ومحقونات ----------

    /// طلب مؤرشف: الرأس كاملًا + الجسم (لبرهان عبور الجسم المعتِم حرفيًّا)
    #[derive(Clone)]
    struct ReqCapture {
        head: String,
        body: String,
    }

    /// خادم ‏HTTP مصغّر على منفذ عابر: كل قبول يسحب ردًّا من السيناريو
    /// (وإن نفد فـ500)، ويؤرشف رأس كل طلب وجسمه. ‏Connection: close لاتصال نظيف لكل طلب
    struct StubServer {
        base: String,
        requests: Arc<Mutex<Vec<ReqCapture>>>,
        shutdown: Arc<AtomicBool>,
        handle: Option<std::thread::JoinHandle<()>>,
    }

    impl StubServer {
        fn spawn(script: Vec<(u16, String)>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let requests: Arc<Mutex<Vec<ReqCapture>>> = Arc::new(Mutex::new(Vec::new()));
            let script = Arc::new(Mutex::new(script));
            let shutdown = Arc::new(AtomicBool::new(false));
            let sd = shutdown.clone();
            let reqs = requests.clone();
            let handle = std::thread::spawn(move || {
                listener.set_nonblocking(true).unwrap();
                while !sd.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            stream.set_nonblocking(false).unwrap();
                            // الرأس حتى ‏\r\n\r\n ثم تصريف الجسم بطول المحتوى
                            let mut head: Vec<u8> = Vec::new();
                            let mut body_read = 0usize;
                            let mut content_len = 0usize;
                            let mut buf = [0u8; 8192];
                            loop {
                                let n = match stream.read(&mut buf) {
                                    Ok(0) | Err(_) => break,
                                    Ok(n) => n,
                                };
                                head.extend_from_slice(&buf[..n]);
                                if content_len == 0 {
                                    if let Some(pos) = find_head_end(&head) {
                                        let text = String::from_utf8_lossy(&head[..pos]).to_lowercase();
                                        content_len = text
                                            .lines()
                                            .find_map(|l| l.strip_prefix("content-length:"))
                                            .and_then(|v| v.trim().parse().ok())
                                            .unwrap_or(0);
                                        body_read = head.len() - pos - 4;
                                    }
                                } else {
                                    body_read += n;
                                }
                                if content_len > 0 && body_read >= content_len {
                                    break;
                                }
                                if content_len == 0 && find_head_end(&head).is_some() {
                                    break;
                                }
                            }
                            // الأرشفة: الرأس كاملًا + الجسم بحسب طول المحتوى
                            let (head_txt, body_txt) = match find_head_end(&head) {
                                Some(pos) => {
                                    let body_start = pos + 4;
                                    let end = (body_start + content_len).min(head.len());
                                    (
                                        String::from_utf8_lossy(&head[..pos]).to_string(),
                                        String::from_utf8_lossy(&head[body_start..end]).to_string(),
                                    )
                                }
                                None => (String::from_utf8_lossy(&head).to_string(), String::new()),
                            };
                            reqs.lock().unwrap().push(ReqCapture { head: head_txt, body: body_txt });
                            let (status, body) =
                                script.lock().unwrap().pop().unwrap_or((500, "{}".into()));
                            let resp = format!(
                                "HTTP/1.1 {status} IT\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                body.len(),
                                body
                            );
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.flush();
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(_) => break,
                    }
                }
            });
            StubServer { base, requests, shutdown, handle: Some(handle) }
        }

        #[allow(dead_code)]
        fn url_of(&self, path: &str) -> String {
            format!("{}{}", self.base, path)
        }
    }

    impl Drop for StubServer {
        fn drop(&mut self) {
            self.shutdown.store(true, Ordering::SeqCst);
            if let Some(h) = self.handle.take() {
                let _ = h.join();
            }
        }
    }

    fn find_head_end(buf: &[u8]) -> Option<usize> {
        buf.windows(4).position(|w| w == b"\r\n\r\n")
    }

    /// بايتات ‏JPEG حقيقية صغيرة (بصمة + حشو) — الفحص على الأربعة الأولى
    fn jpeg_bytes() -> Vec<u8> {
        let mut b = vec![0xFFu8, 0xD8, 0xFF, 0xE0];
        b.extend(std::iter::repeat(0x7Fu8).take(256));
        b
    }

    struct Tmp {
        base: std::path::PathBuf,
    }
    impl Tmp {
        fn new(tag: &str) -> Self {
            let base =
                std::env::temp_dir().join(format!("itqan-upload-test-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&base);
            std::fs::create_dir_all(base.join("frames")).unwrap();
            std::fs::create_dir_all(base.join("queue")).unwrap();
            Tmp { base }
        }
        fn queue(&self) -> std::path::PathBuf {
            self.base.join("queue")
        }
        fn frames(&self) -> std::path::PathBuf {
            self.base.join("frames")
        }
        fn enqueue(&self, session: &str, id: &str) -> queue::QueueRecord {
            std::fs::write(self.frames().join(format!("{id}.jpg")), jpeg_bytes()).unwrap();
            queue::queue_file(&self.frames(), &self.queue(), session, id).unwrap()
        }
        /// مجلد الأدلّة الموازي (جذر تمريرة الأدلّة في بثّ الحالة)
        fn guides(&self) -> PathBuf {
            let g = self.base.join("guides");
            std::fs::create_dir_all(&g).unwrap();
            g
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.base);
        }
    }

    #[derive(Clone, Default)]
    struct RecSink(Arc<Mutex<Vec<WorkerEvent>>>);
    impl UploadSink for RecSink {
        fn on_event(&self, ev: WorkerEvent) {
            self.0.lock().unwrap().push(ev);
        }
    }

    /// محقونات بلا مدير اعتماد ولا انتظار — السكون يُؤرشف فحسب. ماكرو كي
    /// تُعاش المغلقات في نطاق الاختبار نفسه لا في نطاق دالةٍ عائدة
    macro_rules! let_io {
        ($name:ident, $token:expr, $forgotten:expr, $sleeps:expr) => {
            let tf = |_o: &str| $token.lock().unwrap().clone();
            let ff = |_o: &str| {
                $forgotten.store(true, Ordering::SeqCst);
                Ok(())
            };
            let mut sf = |d: Duration| $sleeps.lock().unwrap().push(d.as_millis() as u64);
            let mut $name = WorkerIo { token_of: &tf, forget_token: &ff, sleep: &mut sf };
        };
    }

    fn uploaded_of(events: &[WorkerEvent]) -> Vec<(String, String)> {
        events
            .iter()
            .filter_map(|e| match e {
                WorkerEvent::Uploaded { session_id, local_id, .. } => {
                    Some((session_id.clone(), local_id.clone()))
                }
                _ => None,
            })
            .collect()
    }

    // ---------- تمريرات على خادم حقيقيّ مصغّر ----------

    #[test]
    fn النجاح_يحذف_العنصر_ويبث_المعرّفات_ويرسل_الحامل_والمفتاح() {
        let t = Tmp::new("ok");
        let stub = StubServer::spawn(vec![(
            200,
            r#"{"fileId":"fidABC123","thumbFileId":null,"fileUrl":"u"}"#.into(),
        )]);
        t.enqueue("s-it", "f-1");
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        assert_eq!(
            report,
            PassReport { uploaded: 1, failed: 0, stopped: false }
        );
        // العنصر حُذف بسجلّه ونسخته
        assert!(queue::list_pending(&t.queue()).is_empty());
        assert!(!t.queue().join("f-1.jpg").exists());
        // الأحداث: uploaded بالمعرّف الحقيقي ثم status صفرٌ منتظر
        let events = sink.0.lock().unwrap();
        assert_eq!(uploaded_of(&events), vec![("s-it".to_string(), "f-1".to_string())]);
        let has_uploaded_fileid = events.iter().any(|e| matches!(
            e,
            WorkerEvent::Uploaded { file_id, thumb_file_id, .. }
                if file_id == "fidABC123" && thumb_file_id.is_none()
        ));
        assert!(has_uploaded_fileid);
        // العقد على الشبكة: حامل الخزنة ومفتاح عدم التكرار المشتقّ وmultipart
        let reqs = stub.requests.lock().unwrap();
        let head = reqs.iter().map(|r| r.head.clone())
            .collect::<Vec<_>>().join("\n====\n").to_lowercase();
        let body = reqs.iter().map(|r| r.body.clone()).collect::<Vec<_>>().join("\n");
        assert!(head.contains("authorization: bearer itq_tok"), "{head}");
        assert!(head.contains("idempotency-key: file-s-it-f-1"), "{head}");
        assert!(head.contains("multipart/form-data"), "{head}");
        assert!(body.contains("name=\"file\""), "{body}");
        // لا سكون في النجاح
        assert!(sleeps.lock().unwrap().is_empty());
    }

    #[test]
    fn الفشل_النهائي_يعلم_فاشلا_بالسبب_ويبقي_النسخة() {
        let t = Tmp::new("bad");
        let stub = StubServer::spawn(vec![(
            413,
            r#"{"errorAr":"حجم الصورة يتجاوز 5 ميغابايت"}"#.into(),
        )]);
        t.enqueue("s-it", "f-2");
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 0, failed: 1, stopped: false });
        let failed = queue::list_failed(&t.queue());
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].attempt, 0, "الفشل النهائي لا يراكم محاولات");
        assert!(failed[0].error_ar.as_deref().unwrap_or("").contains("رفض الخادم"),
            "السبب ثابت من القرار لا جسم الردّ: {:?}", failed[0].error_ar);
        assert!(t.queue().join("f-2.jpg").exists(), "النسخة تبقى بعد الفشل");
        assert!(sleeps.lock().unwrap().is_empty());
    }

    #[test]
    fn القطع_العابر_يبقي_العنصر_ويتدرج_بالتراجع_من_العداد_المحفوظ() {
        let t = Tmp::new("cut");
        // لا خادم إطلاقًا: كل المحاولات شبكةٌ مقطوعة
        t.enqueue("s-it", "f-3");
        // عدّاد سابق محفوظ من دورة سابقة: التراجع يكمل من عنده لا من الصفر
        let rec = &queue::list_pending(&t.queue())[0];
        queue::save_attempt(&t.queue(), rec, 1).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), "http://127.0.0.1:1", &sink, &mut io, 2);
        assert_eq!(report, PassReport { uploaded: 0, failed: 0, stopped: false });
        // العنصر باقٍ منتظرًا بعدّاده المتقدم
        let after = &queue::list_pending(&t.queue())[0];
        assert_eq!(after.attempt, 3, "جولتان زادتا العدّاد من 1 إلى 3");
        assert!(t.queue().join("f-3.jpg").exists());
        // التراجع الأُسّي من المحاولة الحالية: ‏4s (attempt=1) ثم ‏8s (attempt=2)
        assert_eq!(*sleeps.lock().unwrap(), vec![4_000, 8_000]);
        // بثّ الحالة رافق كلّ تغيّر حالة (جولتا تراجع = ‏status اثنان)
        assert_eq!(sink.0.lock().unwrap().len(), 2);
    }

    #[test]
    fn صفر_وعشرة_وخمس_مئة_عابرة_كما_جدول_الخطة() {
        // نفس مسار القطع مع رموز ‏5xx: التصنيف يوحّدها تراجعًا
        let t = Tmp::new("statuses");
        let stub = StubServer::spawn(vec![(500, "{}".into()), (503, "{}".into()), (429, "{}".into())]);
        t.enqueue("s-it", "f-4");
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 3);
        assert_eq!(report.uploaded, 0);
        assert_eq!(*sleeps.lock().unwrap(), vec![2_000, 4_000, 8_000]);
        assert_eq!(queue::list_pending(&t.queue())[0].attempt, 3);
    }

    #[test]
    fn صلاحية_401_تمحو_الاعتماد_وتوقف_ولاتمس_أي_عنصر() {
        let t = Tmp::new("lost");
        // العنصر الأول يُصادف 401 والثاني لم يصل — الترتيب مرتَّب
        let stub = StubServer::spawn(vec![(200, r#"{"fileId":"never"}"#.into()), (401, "{}".into())]);
        t.enqueue("s-it", "f-5");
        t.enqueue("s-it", "f-6");
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        assert!(report.stopped, "العامل توقّف");
        assert_eq!(report.uploaded, 0, "لا نجاح بعد إبطال الرمز");
        assert!(forgotten.load(Ordering::SeqCst), "الاعتماد مُحي من الخزنة");
        // **العنصران باقيان** — قلب أمان §٣.٥
        let pending = queue::list_pending(&t.queue());
        assert_eq!(pending.len(), 2, "العناصر لا تُحذف على 401");
        assert!(t.queue().join("f-5.jpg").exists() && t.queue().join("f-6.jpg").exists());
        // أحداث: lost ثم status — ولا uploaded إطلاقًا
        let events = sink.0.lock().unwrap();
        assert!(events.iter().any(|e| matches!(e, WorkerEvent::Lost { .. })));
        assert!(uploaded_of(&events).is_empty());
    }

    #[test]
    fn تعارض_409_يعيد_بعد_ثلاث_ثوان_بلا_زيادة_العداد() {
        let t = Tmp::new("conflict");
        let stub = StubServer::spawn(vec![
            (200, r#"{"fileId":"fidOK99"}"#.into()),
            (409, "{}".into()),
        ]);
        t.enqueue("s-it", "f-7");
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report.uploaded, 1);
        assert_eq!(*sleeps.lock().unwrap(), vec![3_000]);
        let after = queue::list_pending(&t.queue());
        assert!(after.is_empty(), "نجح في النهاية فحُذف");
    }

    #[test]
    fn رد_نجاح_بجسم_غير_مفهوم_لا_ينجح_زيفا_ولا_يحذف() {
        let t = Tmp::new("garbage");
        let stub = StubServer::spawn(vec![
            (200, r#"{"fileId":"fidReal"}"#.into()),
            (200, "لست json".into()),
        ]);
        t.enqueue("s-it", "f-8");
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        // الجولة الأولى عابرة (بلا حذف) ثم الجولة الثانية نجحت بالمعرّف
        assert_eq!(report.uploaded, 1);
        assert_eq!(*sleeps.lock().unwrap(), vec![2_000]);
        assert!(queue::list_pending(&t.queue()).is_empty());
    }

    #[test]
    fn غياب_الاعتماد_يوقف_بلا_شبكة_والعناصر_بانتظار_الاقتران() {
        let t = Tmp::new("unpaired");
        let stub = StubServer::spawn(vec![]);
        t.enqueue("s-it", "f-9");
        let token = Mutex::new(None);
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        assert!(report.stopped);
        assert!(stub.requests.lock().unwrap().is_empty(), "لا طلب بلا رمز");
        assert_eq!(queue::list_pending(&t.queue()).len(), 1);
        assert!(!sink.0.lock().unwrap().iter().any(|e| matches!(e, WorkerEvent::Lost { .. })),
            "بلا اقترانٍ سابق لا lost — الصمت الصادق");
    }

    // ---------- تمريرات الأدلّة (٣د-٣): الجسم معتِم والمفتاح guide-{sid} ----------

    /// جسم دليل للاختبار — **مقصود ألّا يحوي أيّ رمز بنية محظور** (الحارس):
    /// العتامة تعني أنّ المحتوى لا يهمّ للطابور ولا للعامل
    const GUIDE_BODY: &str = r#"{"title":"دليل تجربة","items":[1,2,3]}"#;

    fn guide_tmp(tag: &str) -> (Tmp, PathBuf) {
        let t = Tmp::new(tag);
        let g = t.base.join("guides");
        std::fs::create_dir_all(&g).unwrap();
        (t, g)
    }

    #[test]
    fn الدليل_الناجح_يحذف_العنصر_ويبث_المعرّف_والجسم_يعبر_حرفيًا() {
        let (t, g) = guide_tmp("gok");
        let stub = StubServer::spawn(vec![(200, r#"{"id":"gXYZ789"}"#.into())]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, false).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 1, failed: 0, stopped: false });
        assert!(guide_queue::list_pending(&g).is_empty());
        assert!(!g.join("s-it.body").exists(), "الجسم يُحذف مع النجاح");
        // الحدث: ‏guideId من حقل id وحده
        assert!(sink.0.lock().unwrap().iter().any(|e| matches!(
            e,
            WorkerEvent::GuideCreated { session_id, guide_id }
                if session_id == "s-it" && guide_id == "gXYZ789"
        )));
        // **العتامة الحرفيّة**: الجسم وصل كما هو، والعقد: content-type json + مفتاح guide-
        let reqs = stub.requests.lock().unwrap();
        assert_eq!(reqs.len(), 1);
        let head = reqs[0].head.to_lowercase();
        assert!(head.contains("authorization: bearer itq_tok"), "{head}");
        assert!(head.contains("idempotency-key: guide-s-it"), "{head}");
        assert!(head.contains("content-type: application/json"), "{head}");
        assert_eq!(reqs[0].body, GUIDE_BODY, "الجسم المعتِم لا يُمَسّ");
    }

    #[test]
    fn دليل_مرفوض_400_يعلم_فاشلا_بسبب_الدليل_ويبقي_الجسم_ويبث_السبب() {
        let (t, g) = guide_tmp("gbad");
        let stub = StubServer::spawn(vec![(400, r#"{"errorAr":"دليل غير صالح"}"#.into())]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, false).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 0, failed: 1, stopped: false });
        let failed = guide_queue::list_failed(&g);
        assert_eq!(failed.len(), 1);
        assert!(
            failed[0].error_ar.as_deref().unwrap_or("").contains("الدليل"),
            "رسالة الفشل بمصطلح الدليل لا الملفّ: {:?}",
            failed[0].error_ar
        );
        assert!(g.join("s-it.body").exists(), "الجسم يبقى بعد الفشل");
        // طيّ معلَّق (ج): السبب في بثّ الحالة
        assert!(sink.0.lock().unwrap().iter().any(|e| matches!(
            e,
            WorkerEvent::Status(st) if st.last_error_ar.as_deref().map_or(false, |s| s.contains("الدليل"))
        )));
    }

    #[test]
    fn دليل_على_401_يتوقف_كالملفات_ولا_يمس_العنصر_والجسم() {
        let (t, g) = guide_tmp("glost");
        let stub = StubServer::spawn(vec![(401, "{}".into())]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, false).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert!(report.stopped);
        assert!(forgotten.load(Ordering::SeqCst), "الاعتماد مُحي");
        assert_eq!(guide_queue::list_pending(&g).len(), 1, "العنصر باقٍ على 401");
        assert!(g.join("s-it.body").exists(), "الجسم باقٍ على 401");
        let events = sink.0.lock().unwrap();
        assert!(events.iter().any(|e| matches!(e, WorkerEvent::Lost { .. })));
        assert!(!events.iter().any(|e| matches!(e, WorkerEvent::GuideCreated { .. })));
    }

    #[test]
    fn جسم_مفقود_من_القرص_يفشل_نهائيا_بلا_رمي_للأبد() {
        let (t, g) = guide_tmp("gnobody");
        let stub = StubServer::spawn(vec![]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, false).unwrap();
        std::fs::remove_file(g.join("s-it.body")).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 0, failed: 1, stopped: false });
        // لا شبكة إطلاقًا: الفقد نهائيّ لا عابر — ورمقُ الجولات ظلمٌ لما بعده
        assert!(stub.requests.lock().unwrap().is_empty());
        assert_eq!(guide_queue::list_failed(&g).len(), 1);
        assert!(guide_queue::list_failed(&g)[0]
            .error_ar
            .as_deref()
            .unwrap_or("")
            .contains("فقد جسم"));
    }

    #[test]
    fn الحالة_تبث_عدد_الأدلة_المنتظرة_الحقيقي() {
        let (t, g) = guide_tmp("gstatus");
        let stub = StubServer::spawn(vec![(
            200,
            r#"{"fileId":"fidStatus1"}"#.into(),
        )]);
        // ملفّ منتظر + دليل منتظر: بثّ تمريرة الملفّات يجب أن يحمل pendingGuides=1
        t.enqueue("s-it", "f-20");
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, false).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        process_pending(&t.queue(), &g, &stub.base, &sink, &mut io, 5);
        assert!(sink.0.lock().unwrap().iter().any(|e| matches!(
            e,
            WorkerEvent::Status(st) if st.pending_files == 0 && st.pending_guides == 1
        )));
    }

    #[test]
    fn الخيط_الخلفي_يستيقظ_يرفع_وينتهي_بإغلاق_القناة() {
        let t = Tmp::new("thread");
        let stub = StubServer::spawn(vec![(
            200,
            r#"{"fileId":"fidTHR1","thumbFileId":"th1"}"#.into(),
        )]);
        t.enqueue("s-it", "f-10");
        let guides_root = t.base.join("guides-thread");
        std::fs::create_dir_all(&guides_root).unwrap();
        let rec_sink = RecSink::default();
        let sink: Arc<dyn UploadSink> = Arc::new(rec_sink.clone());
        // تبعيات محقونة تحاكي وصل الخزنة الإنتاجي (نفس الأنواع حرفيًّا)
        let deps = WorkerDeps {
            token_of: Arc::new(|_o: &str| Some("itq_tok".to_string())),
            forget_token: Arc::new(|_o: &str| Ok(())),
        };
        let join_tx = spawn_worker_thread(sink, t.queue(), guides_root, stub.base.clone(), deps);
        // الانتظار حتى الحدث بسقف معقول
        let mut got = false;
        for _ in 0..150 {
            let events = rec_sink.0.lock().unwrap();
            if uploaded_of(&events).len() == 1 {
                got = true;
                break;
            }
            drop(events);
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(got, "العامل رفع العنصر خلال المهلة");
        assert!(queue::list_pending(&t.queue()).is_empty());
        // المصغّرة عبرت في الحدث كما في العقد
        let events = rec_sink.0.lock().unwrap();
        assert!(events.iter().any(|e| matches!(
            e,
            WorkerEvent::Uploaded { thumb_file_id: Some(th), .. } if th == "th1"
        )));
        drop(events);
        drop(join_tx.1); // إغلاق القناة ⇒ الخيط ينتهي نظيفًا
        join_tx.0.join().unwrap();
    }

    // ---------- الصوت (المرحلة ٢): مساره المملوك ومفتاحه الخاص ----------

    #[test]
    fn الصوت_يرفع_من_نسخته_الويبم_بمفتاحه_الخاص_ويبث_المعرّف_ويحذف() {
        let t = Tmp::new("audio");
        let stub = StubServer::spawn(vec![(200, r#"{"fileId":"fidVox77"}"#.into())]);
        // تعليق صوتي يدخل الطابور بنوعه (الوصفة نفسها التي يكتبها أمر queue_audio)
        let webm = queue::base64_decode(&crate::sensors::burn::base64_encode(&[0x1Au8, 0x45, 0xDF, 0xA3, 9, 9])).unwrap();
        queue::queue_audio_bytes(&t.queue(), "s-it", "v-7", &webm).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_pending(&t.queue(), &t.guides(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 1, failed: 0, stopped: false });
        assert!(queue::list_pending(&t.queue()).is_empty());
        assert!(!t.queue().join("v-7.webm").exists(), "النسخة الصوتية تحذف مع النجاح");
        let events = sink.0.lock().unwrap();
        assert!(events.iter().any(|e| matches!(
            e,
            WorkerEvent::Uploaded { session_id, local_id, file_id, .. }
                if session_id == "s-it" && local_id == "v-7" && file_id == "fidVox77"
        )));
        // العقد على الشبكة: مفتاح audio- الخاص لا مفتاح اللقطات
        let reqs = stub.requests.lock().unwrap();
        let head = reqs.iter().map(|r| r.head.clone()).collect::<Vec<_>>().join("\n").to_lowercase();
        assert!(head.contains("idempotency-key: audio-s-it-v-7"), "{head}");
        assert!(head.contains("multipart/form-data"), "{head}");
    }

    // ---------- التفريغ الخادميّ (المرحلة ٢-م٥) ----------

    #[test]
    fn الدليل_فيه_صوت_يطلق_التفريغ_بالمسار_والحامل_بعد_النجاح() {
        let (t, g) = guide_tmp("gstt");
        // الردّان: إنشاء الدليل ثم نجاح التفريغ (السيناريو يُسحب من الآخر)
        let stub = StubServer::spawn(vec![
            (200, "{}".into()),
            (200, r#"{"id":"gVOX9"}"#.into()),
        ]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, true).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 1, failed: 0, stopped: false });
        // طلبان: الإنشاء ثم التفريغ على مسار الدليل بالحامل والمفتاح
        let reqs = stub.requests.lock().unwrap();
        assert_eq!(reqs.len(), 2, "طلب التفريغ إضافيّ على الإنشاء");
        let stt = reqs.iter().find(|r| r.head.contains("transcribe-steps")).expect("طلب التفريغ غائب");
        assert!(stt.head.starts_with("POST /api/guides/gVOX9/transcribe-steps"), "{}", stt.head);
        assert!(stt.head.to_lowercase().contains("authorization: bearer itq_tok"), "{}", stt.head);
        assert!(stt.head.to_lowercase().contains("idempotency-key: stt-gvox9"), "{}", stt.head);
    }

    #[test]
    fn دليل_بلا_صوت_لا_يطلق_طلب_التفريغ_إطلاقا() {
        let (t, g) = guide_tmp("gnostt");
        let stub = StubServer::spawn(vec![(200, r#"{"id":"gQuiet"}"#.into())]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, false).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 1, failed: 0, stopped: false });
        assert_eq!(stub.requests.lock().unwrap().len(), 1, "الإنشاء وحده بلا تفريغ");
    }

    #[test]
    fn فشل_التفريغ_الصامت_لا_يمس_نجاح_الدليل() {
        let (t, g) = guide_tmp("gsttfail");
        // التفريغ يردّ 500 — الدليل ناجح وحُذف من الطابور رغمًا (كماليّة صادقة)
        let stub = StubServer::spawn(vec![
            (500, "خطأ".into()),
            (200, r#"{"id":"gFail"}"#.into()),
        ]);
        guide_queue::queue_guide(&g, "s-it", GUIDE_BODY, true).unwrap();
        let token = Mutex::new(Some("itq_tok".to_string()));
        let forgotten = AtomicBool::new(false);
        let sleeps = Mutex::new(Vec::new());
        let sink = RecSink::default();
        let_io!(io, &token, &forgotten, &sleeps);
        let report = process_guides(&g, &t.queue(), &stub.base, &sink, &mut io, 5);
        assert_eq!(report, PassReport { uploaded: 1, failed: 0, stopped: false });
        assert!(guide_queue::list_pending(&g).is_empty());
        assert!(guide_queue::list_failed(&g).is_empty());
    }
}
