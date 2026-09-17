//! اختبار تكامل ٣د-٢ — **ضدّ خادم api محليّ حقيقيّ** (لا شبكة خارجيّة).
//! يُشغَّل يدويًّا بعد بناء الوحدة:
//! ‏`cargo test --test transport_local_api -- --ignored --nocapture`
//!
//! السيناريو §٤ من خطّة ٣د: رمزٌ مُبذَر في الخزنة ⇒ رفعٌ ينجح ⇒ **قطع الشبكة
//! (إغلاق الخادم)** أثناء عنصر ثانٍ ⇒ العنصر (السجلّ + النسخة) باقٍ ⇒ إعادة
//! تشغيل الخادم ⇒ العامل يكمل ⇒ **صفٌّ واحد في files** ⇒ إعادةُ إرسالٍ صريحة
//! بنفس ‏Idempotency-Key تعيد الملفّ نفسه (عقد api) ⇒ إبطال الرمز من القاعدة ⇒
//! ‏401: الاعتماد يُمحى و**العناصر باقية**.
//!
//! المعزل عن بيئة المالك: خادم الاختبار على منفذٍ عابر ومجلد بيانات مؤقّت
//! (نقطة إقلاع `desktop-integration-server.mts`)، ومفتاح الخزنة يتضمّن المنفذ
//! فلا يلمس اعتماد المالك الحقيقيّ، ويُنظَّف في نهاية الاختبار.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use app_lib::transport::guide_queue;
use app_lib::transport::queue;
use app_lib::transport::upload::{
    idempotency_key, spawn_worker_thread, UploadSink, WorkerDeps, WorkerEvent,
};
use app_lib::transport::vault;
use jpeg_encoder::{ColorType, Encoder};

/// رمز اختبارٍ حصرًا — لا يعمل إلّا على قاعدة الاختبار المؤقّتة ويموت معها
const TOKEN: &str = "itq_itest_desktop_3d2_block";

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("..")
}

fn api_dir() -> PathBuf {
    repo_root().join("apps").join("api")
}

/// خادم api حقيقيّ — إنتاج createApp نفسها على منفذٍ عابر وبياناتٍ مؤقّتة
struct ApiServer {
    child: Child,
    base: String,
}

fn spawn_server(data_dir: &Path, port: u16) -> ApiServer {
    let dir = api_dir();
    let child = Command::new("node")
        .arg(dir.join("node_modules").join("tsx").join("dist").join("cli.mjs"))
        .arg(dir.join("scripts").join("desktop-integration-server.mts"))
        .env("ITQAN_TEST_PORT", port.to_string())
        .env("ITQAN_TEST_DATA_DIR", data_dir)
        .current_dir(&dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("تشغيل خادم api الاختباريّ");
    ApiServer { child, base: format!("http://127.0.0.1:{port}") }
}

impl ApiServer {
    /// انتظار ‏/health حتى الجاهزية — سقف 60 ثانية
    fn wait_health(&self) {
        let client = reqwest::blocking::Client::new();
        let started = Instant::now();
        loop {
            if let Ok(r) = client.get(format!("{}/health", self.base)).send() {
                if r.status().is_success() {
                    return;
                }
            }
            assert!(
                started.elapsed() < Duration::from_secs(60),
                "خادم api لم يجهز خلال 60 ثانية"
            );
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for ApiServer {
    fn drop(&mut self) {
        self.kill();
    }
}

fn free_port() -> u16 {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    drop(l);
    port
}

/// استدعاء مساعد قاعدة الاختبار عبر node — يردّ نصًّا
fn node_db(args: &[&str]) -> String {
    let dir = api_dir();
    let out = Command::new("node")
        .arg(dir.join("scripts").join("desktop-integration-db.mjs"))
        .args(args)
        .current_dir(&dir)
        .output()
        .expect("تشغيل مساعد القاعدة");
    assert!(
        out.status.success(),
        "مساعد القاعدة فشل: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn count_file(db_path: &Path, file_id: &str) -> u32 {
    node_db(&["count-file", db_path.to_str().unwrap(), file_id]).parse().unwrap()
}

/// ‏JPEG حقيقيّ 16×16 — يفحصه الخادم صورةً ويولّد له مصغّرة
fn write_real_jpeg(path: &Path) {
    let (w, h) = (16u16, 16u16);
    let mut bgra = Vec::with_capacity(w as usize * h as usize * 4);
    for _ in 0..(w as usize * h as usize) {
        bgra.extend_from_slice(&[200, 120, 40, 255]);
    }
    let enc = Encoder::new_file(path, 85).unwrap();
    enc.encode(&bgra, w, h, ColorType::Bgra).unwrap();
}

#[derive(Clone, Default)]
struct RecSink(Arc<Mutex<Vec<WorkerEvent>>>);
impl UploadSink for RecSink {
    fn on_event(&self, ev: WorkerEvent) {
        self.0.lock().unwrap().push(ev);
    }
}

fn wait_for(sink: &RecSink, pred: impl Fn(&[WorkerEvent]) -> bool, timeout: Duration) -> bool {
    let started = Instant::now();
    loop {
        if pred(&sink.0.lock().unwrap()) {
            return true;
        }
        if started.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// رفع مباشر بـreqwest — مسبار عقد عدم التكرار على الشارع الحقيقيّ
fn direct_upload(base: &str, key: &str, jpg: &Path) -> (u16, String) {
    let form = reqwest::blocking::multipart::Form::new().part(
        "file",
        reqwest::blocking::multipart::Part::file(jpg).unwrap(),
    );
    let resp = reqwest::blocking::Client::new()
        .post(format!("{base}/api/uploads"))
        .bearer_auth(TOKEN)
        .header("Idempotency-Key", key)
        .multipart(form)
        .send()
        .expect("الرفع المباشر");
    let status = resp.status().as_u16();
    (status, resp.text().unwrap())
}

/// سبايك البنية (٣د-٤): التقاط بثّ الاقتران على ‏MockRuntime — إن فشل هذا
/// ننتقل لمسار ‏PairSink البديل بإعلام المخطِّط
#[test]
#[ignore]
fn سبايك_التقاط_البث_على_وقت_وهمي() {
    use tauri::Listener;
    let app = tauri::test::mock_builder()
        .build(tauri::generate_context!())
        .expect("تطبيق وهمي");
    let handle = app.handle().clone();
    let got: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = got.clone();
    handle.listen("auth://paired", move |evt| {
        sink.lock().unwrap().push(evt.payload().to_string());
    });
    use tauri::Emitter;
    handle
        .emit("auth://paired", serde_json::json!({ "email": "itest@example.invalid" }))
        .unwrap();
    assert!(
        !got.lock().unwrap().is_empty(),
        "التقاط ‏auth://paired على MockRuntime فشل — يلزم مسار PairSink"
    );
    let payload = got.lock().unwrap().join("");
    assert!(payload.contains("itest@example.invalid"), "{payload}");
}

#[test]
#[ignore]
fn التكامل_الحي_رفع_ثم_قطع_ثم_إعادة_بلا_تكرار_ثم_صلاحية() {
    // ---------- تهيئة معزولة ----------
    let base =
        std::env::temp_dir().join(format!("itqan-33d2-integration-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let frames = base.join("frames");
    let qroot = base.join("queue");
    let data_dir = base.join("api-data");
    std::fs::create_dir_all(&frames).unwrap();
    std::fs::create_dir_all(&data_dir).unwrap();
    let db_path = data_dir.join("dalili.db");
    let port = free_port();

    // خادم أوّل + بذر مستخدم ورمز جهاز
    let mut srv = spawn_server(&data_dir, port);
    srv.wait_health();
    node_db(&["seed", db_path.to_str().unwrap(), TOKEN]);

    // الخزنة الحقيقيّة بمفتاحٍ مُعرَّف بالمنفذ — تنظيف أيّ بقايا ثم التخزين
    let origin = srv.base.clone();
    let _ = vault::forget_token(&origin);
    vault::store_token(&origin, TOKEN).expect("تخزين رمز الاختبار في الخزنة");

    let sink = RecSink::default();
    let guides_root = base.join("guides");
    std::fs::create_dir_all(&guides_root).unwrap();
    let (worker, wake_tx) = spawn_worker_thread(
        Arc::new(sink.clone()),
        qroot.clone(),
        guides_root,
        origin.clone(),
        WorkerDeps::vault(),
    );

    // ---------- ‏١ رفع ناجح بمعرّف حقيقيّ ----------
    write_real_jpeg(&frames.join("f-101.jpg"));
    queue::queue_file(&frames, &qroot, "s-itest", "f-101").unwrap();
    wake_tx.send(()).unwrap();
    let uploaded_ok = wait_for(&sink, |evs| {
        evs.iter().any(|e| matches!(
            e, WorkerEvent::Uploaded { local_id, file_id, .. } if local_id == "f-101" && !file_id.is_empty()
        ))
    }, Duration::from_secs(30));
    assert!(uploaded_ok, "الرفع الأول لم ينجح");
    let file_id_101 = sink.0.lock().unwrap().iter().find_map(|e| match e {
        WorkerEvent::Uploaded { local_id, file_id, .. } if local_id == "f-101" => {
            Some(file_id.clone())
        }
        _ => None,
    }).unwrap();
    assert!(queue::list_pending(&qroot).is_empty(), "الطابور خالٍ بعد النجاح");
    assert_eq!(count_file(&db_path, &file_id_101), 1, "صفّ الملفّ الأول واحد");
    // المصغّرة وصلت في الحدث (JPEG حقيقيّ)
    assert!(sink.0.lock().unwrap().iter().any(|e| matches!(
        e, WorkerEvent::Uploaded { local_id, thumb_file_id: Some(_), .. } if local_id == "f-101"
    )));

    // ---------- ‏٢ قطع الشبكة: إغلاق الخادم أثناء عنصر ثانٍ ----------
    srv.kill();
    write_real_jpeg(&frames.join("f-102.jpg"));
    queue::queue_file(&frames, &qroot, "s-itest", "f-102").unwrap();
    wake_tx.send(()).unwrap();
    // العامل يدخل تراجعًا: ننتظر أول زيادة عدّاد محفوظة (برهان محاولة فاشلة)
    let attempt_grew = {
        let started = Instant::now();
        loop {
            let pend = queue::list_pending(&qroot);
            if pend.iter().any(|r| r.local_id == "f-102" && r.attempt >= 1) {
                break true;
            }
            assert!(started.elapsed() < Duration::from_secs(20), "لم تُسجَّل محاولة عابرة");
            std::thread::sleep(Duration::from_millis(100));
        }
    };
    assert!(attempt_grew);
    // **العنصر باقٍ**: السجلّ والنسخة على القرص مهما قطعنا
    assert_eq!(queue::list_pending(&qroot).len(), 1);
    assert!(qroot.join("f-102.jpg").exists(), "النسخة المملوكة باقية عند القطع");

    // ---------- ‏٣ إعادة تشغيل الخادم ⇒ العامل يكمل ⇒ صفٌّ واحد ----------
    let mut srv2 = spawn_server(&data_dir, port);
    srv2.wait_health();
    let resumed = wait_for(&sink, |evs| {
        evs.iter().any(|e| matches!(
            e, WorkerEvent::Uploaded { local_id, .. } if local_id == "f-102"
        ))
    }, Duration::from_secs(60));
    assert!(resumed, "العامل لم يكمل بعد إعادة الخادم");
    let file_id_102 = sink.0.lock().unwrap().iter().find_map(|e| match e {
        WorkerEvent::Uploaded { local_id, file_id, .. } if local_id == "f-102" => {
            Some(file_id.clone())
        }
        _ => None,
    }).unwrap();
    assert_eq!(count_file(&db_path, &file_id_102), 1, "إعادة بعد القطع ⇐ صفّ واحد لا نسختان");
    assert!(queue::list_pending(&qroot).is_empty());

    // ---------- ‏٣ب مسبار replay صريح: طلبان مكتملان بنفس المفتاح ----------
    let key = idempotency_key("s-itest", "f-103");
    let (st1, body1) = direct_upload(&srv2.base, &key, &frames.join("f-102.jpg"));
    let (st2, body2) = direct_upload(&srv2.base, &key, &frames.join("f-102.jpg"));
    assert_eq!(st1, 200, "{body1}");
    assert_eq!(st2, 200, "{body2}");
    let id1: String = serde_json::from_str::<serde_json::Value>(&body1).unwrap()["fileId"]
        .as_str().unwrap().to_string();
    let id2: String = serde_json::from_str::<serde_json::Value>(&body2).unwrap()["fileId"]
        .as_str().unwrap().to_string();
    assert_eq!(id1, id2, "الإعادة بنفس المفتاح تعيد الملفّ نفسه");
    assert_eq!(count_file(&db_path, &id1), 1, "لا صفّ ثانٍ للمفتاح نفسه");

    // ---------- ‏٤ إبطال الرمز ⇒ ‏401: اعتمادٌ محوٌ والعناصر باقية ----------
    node_db(&["unseed-token", db_path.to_str().unwrap()]);
    write_real_jpeg(&frames.join("f-104.jpg"));
    queue::queue_file(&frames, &qroot, "s-itest", "f-104").unwrap();
    wake_tx.send(()).unwrap();
    let lost = wait_for(&sink, |evs| {
        evs.iter().any(|e| matches!(e, WorkerEvent::Lost { .. }))
    }, Duration::from_secs(30));
    assert!(lost, "لم تُبثّ auth://lost عند 401");
    assert!(vault::read_token(&origin).is_none(), "اعتماد الخزنة مُحي بعد 401");
    // **العنصر الرابع باقٍ** — يُستأنف بعد إعادة الاقتران
    let pending = queue::list_pending(&qroot);
    assert_eq!(pending.len(), 1, "‏401 لا يحذف العناصر: {:?}", pending);
    assert_eq!(pending[0].local_id, "f-104");
    assert!(qroot.join("f-104.jpg").exists());
    // لا رفعٌ بعد الإبطال: ‏f-101 وf-102 فقط لهما حدثا نجاح
    let uploads: Vec<_> = sink.0.lock().unwrap().iter().filter_map(|e| match e {
        WorkerEvent::Uploaded { local_id, .. } => Some(local_id.clone()),
        _ => None,
    }).collect();
    assert_eq!(uploads, ["f-101", "f-102"]);

    // ---------- تنظيف ----------
    let _ = vault::forget_token(&origin);
    drop(wake_tx);
    let _ = worker.join();
    srv2.kill();
    let _ = std::fs::remove_dir_all(&base);
}

/// القبول الحيّ الكامل §٣د (٣د-٤) — خيطُ الحلقة من الطلب إلى الويب في اختبار
/// واحد ضدّ api محليّ معزول: **اقتران حيّ** (بدء ⇒ موافقة مُحاكاة من القاعدة ⇒
/// استطلاع ⇒ الرمز في الخزنة و‏auth://paired بالبريد) ⇒ **رفع** ⇒ **قطع وإعادة
/// بلا تكرار** ⇒ **إنشاء دليل حيّ** (بلا فتح متصفّح) ⇒ **إبطال الرمز** ⇒ ‏401
/// بمحو الاعتماد وبقاء عناصر الطابورَين. الرمز لا يظهر في أيّ توكيد —
/// ‏is_some والبريد وحدهما (بريد المالك الاختباريّ غير سرّيّ).
#[test]
#[ignore]
fn القبول_الحي_اقتران_ثم_رفع_ثم_قطع_ثم_دليل_ثم_صلاحية() {
    use tauri::Listener;

    // ---------- تهيئة معزولة (المنشأ مُنفَّذ بالمنفذ فلا يلمس اعتماد المالك) ----------
    let base =
        std::env::temp_dir().join(format!("itqan-33d4-acceptance-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let frames = base.join("frames");
    let qroot = base.join("queue");
    let groot = base.join("guides");
    let data_dir = base.join("api-data");
    for d in [&frames, &groot, &data_dir] {
        std::fs::create_dir_all(d).unwrap();
    }
    let db_path = data_dir.join("dalili.db");
    let port = free_port();
    let mut srv = spawn_server(&data_dir, port);
    srv.wait_health();
    // مستخدم فقط — رمز الجهاز يأتي من الاقتران الحيّ لا من بذر
    node_db(&["seed-user", db_path.to_str().unwrap()]);

    // ---------- ١ اقتران حيّ على وقت وهمي ----------
    let origin = srv.base.clone();
    let _ = vault::forget_token(&origin);
    let _ = vault::forget_email(&origin);

    let app = tauri::test::mock_builder()
        .build(tauri::generate_context!())
        .expect("تطبيق وهمي للاختبار");
    let handle = app.handle().clone();

    let paired_log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let lost_log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let plog = paired_log.clone();
    let llog = lost_log.clone();
    handle.listen("auth://paired", move |evt| {
        plog.lock().unwrap().push(evt.payload().to_string());
    });
    handle.listen("auth://lost", move |evt| {
        llog.lock().unwrap().push(evt.payload().to_string());
    });

    // المنشأ المعزول يُحقَن وسيطًا (إصلاح ٣د-٤-أ) — لا تحوير بيئة عالميّ إطلاقًا:
    // يستحيل بنيويًّا أن يلمس هذا الاختبار خادم المالك التطويريّ (8787)
    let start =
        app_lib::transport::pair::pair_start(handle.clone(), origin.clone(), "جهاز القبول الحيّ".into())
            .expect("بدء الاقتران");
    assert!(start.user_code.contains('-'), "رمز مستخدم بصيغة XXXX-XXXX: {}", start.user_code);
    // **الموافقة من القاعدة** — حاكِ ضغط «وافق» على صفحة ‏/device?code=
    let decided: u32 = node_db(&["approve-code", db_path.to_str().unwrap(), &start.user_code])
        .parse()
        .expect("عدد الصفوف المقرّرة");
    assert_eq!(decided, 1, "الموافقة قرّرت صفًّا واحدًا pending");
    // الاستطلاع كل ٣ ثوانٍ ⇒ الاقتران خلال ثوانٍ
    let paired = {
        let started = Instant::now();
        loop {
            if !paired_log.lock().unwrap().is_empty() {
                break true;
            }
            assert!(started.elapsed() < Duration::from_secs(30), "لم يُبثّ auth://paired");
            assert!(lost_log.lock().unwrap().is_empty(), "بثّ lost أثناء الاقتران السليم");
            std::thread::sleep(Duration::from_millis(100));
        }
    };
    assert!(paired);
    // البثّ بالبريد وحده — **الرمز لا يظهر في أيّ حدث ولا توكيد**
    let payload = paired_log.lock().unwrap().join("");
    assert!(payload.contains("itest@example.invalid"), "{payload}");
    assert!(!payload.contains("itq_"), "لا رمز في البثّ: {payload}");
    // **الرمز في الخزنة** — is_some فحسب، لا قراءة قيمته ولا طباعتها
    assert!(vault::read_token(&origin).is_some(), "رمز الاقتران هبط في الخزنة");
    assert_eq!(
        vault::read_email(&origin).as_deref(),
        Some("itest@example.invalid"),
        "بريد الاقتران محفوظ للعرض"
    );

    // ---------- عامل بالخزنة الحقيقيّة (الوصل الإنتاجيّ نفسه) ----------
    let sink = RecSink::default();
    let (worker, wake_tx) = spawn_worker_thread(
        Arc::new(sink.clone()),
        qroot.clone(),
        groot.clone(),
        origin.clone(),
        WorkerDeps::vault(),
    );

    // ---------- ٢ رفع لقطة محروقة ⇒ معرّف حقيقيّ وصفّ واحد ----------
    write_real_jpeg(&frames.join("f-201.jpg"));
    queue::queue_file(&frames, &qroot, "s-itest", "f-201").unwrap();
    wake_tx.send(()).unwrap();
    assert!(
        wait_for(&sink, |evs| evs.iter().any(
            |e| matches!(e, WorkerEvent::Uploaded { local_id, .. } if local_id == "f-201")
        ), Duration::from_secs(30)),
        "رفع اللقطة الأولى فشل"
    );
    let file_id_201 = sink.0.lock().unwrap().iter().find_map(|e| match e {
        WorkerEvent::Uploaded { local_id, file_id, .. } if local_id == "f-201" => {
            Some(file_id.clone())
        }
        _ => None,
    }).unwrap();
    assert_eq!(count_file(&db_path, &file_id_201), 1);

    // ---------- ٣ قطع أثناء عنصر ثانٍ ⇒ بقاء ⇒ إعادة ⇒ صفّ واحد ----------
    srv.kill();
    write_real_jpeg(&frames.join("f-202.jpg"));
    queue::queue_file(&frames, &qroot, "s-itest", "f-202").unwrap();
    wake_tx.send(()).unwrap();
    let started = Instant::now();
    loop {
        let pend = queue::list_pending(&qroot);
        if pend.iter().any(|r| r.local_id == "f-202" && r.attempt >= 1) {
            break;
        }
        assert!(started.elapsed() < Duration::from_secs(20), "لم تُسجَّل محاولة عابرة أثناء القطع");
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(qroot.join("f-202.jpg").exists(), "النسخة المملوكة باقية عند القطع");
    let mut srv2 = spawn_server(&data_dir, port);
    srv2.wait_health();
    assert!(
        wait_for(&sink, |evs| evs.iter().any(
            |e| matches!(e, WorkerEvent::Uploaded { local_id, .. } if local_id == "f-202")
        ), Duration::from_secs(60)),
        "العامل لم يكمل بعد إعادة الخادم"
    );
    let file_id_202 = sink.0.lock().unwrap().iter().find_map(|e| match e {
        WorkerEvent::Uploaded { local_id, file_id, .. } if local_id == "f-202" => {
            Some(file_id.clone())
        }
        _ => None,
    }).unwrap();
    assert_eq!(count_file(&db_path, &file_id_202), 1, "إعادة بعد القطع ⇐ صفّ واحد لا نسختان");

    // ---------- ٤ إنشاء دليل حيّ ⇒ guide-created بمعرّف حقيقيّ وصفّ في القاعدة ----------
    // الجسم معتِم كما يبنيه TS — ملفّ fixture خارجيّ يُقرأ نصًّا ويُمرَّر كما هو:
    // الطابور والعامل لا يفكّانه ولا يفهرسان بنيتَه (والحارس النصّي نظيف)
    let guide_body: &str = include_str!("fixtures/acceptance-guide.json");
    guide_queue::queue_guide(&groot, "s-itest", guide_body).unwrap();
    wake_tx.send(()).unwrap();
    let guide_id = {
        let started = Instant::now();
        loop {
            let found = sink.0.lock().unwrap().iter().find_map(|e| match e {
                WorkerEvent::GuideCreated { session_id, guide_id }
                    if session_id == "s-itest" =>
                {
                    Some(guide_id.clone())
                }
                _ => None,
            });
            if let Some(id) = found {
                break id;
            }
            assert!(
                started.elapsed() < Duration::from_secs(30),
                "لم يُبثّ queue://guide-created"
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    };
    assert!(!guide_id.is_empty());
    assert_eq!(
        node_db(&["count-guide", db_path.to_str().unwrap(), &guide_id]),
        "1",
        "صفّ الدليل واحد في قاعدة api"
    );
    // لا متصفّح يُفتح هنا — الحارس النقيّ لـopen_in_browser مُختبَر في الوحدة

    // ---------- ٥ إبطال الرمز من الويب ⇒ 401: محو الاعتماد وبقاء الطابورَين ----------
    write_real_jpeg(&frames.join("f-203.jpg"));
    queue::queue_file(&frames, &qroot, "s-itest", "f-203").unwrap();
    guide_queue::queue_guide(&groot, "s-itest2", guide_body).unwrap();
    node_db(&["clear-device-tokens", db_path.to_str().unwrap()]);
    wake_tx.send(()).unwrap();
    assert!(
        wait_for(&sink, |evs| evs.iter().any(|e| matches!(e, WorkerEvent::Lost { .. })), Duration::from_secs(30)),
        "لم يُبثّ auth://lost عند 401"
    );
    assert!(vault::read_token(&origin).is_none(), "اعتماد الخزنة مُحي بعد 401");
    // **عناصر الطابورَين باقية** — تُستأنف بعد إعادة الاقتران
    let files_left: Vec<String> =
        queue::list_pending(&qroot).into_iter().map(|r| r.local_id).collect();
    assert_eq!(files_left, ["f-203"], "عنصر الملفّات باقٍ على 401");
    let guides_left: Vec<String> =
        guide_queue::list_pending(&groot).into_iter().map(|r| r.session_id).collect();
    assert_eq!(guides_left, ["s-itest2"], "عنصر الأدلّة باقٍ على 401");
    // ما بعد الإبطال: لا نجاح جديد
    let uploads_after: Vec<_> = sink.0.lock().unwrap().iter().filter_map(|e| match e {
        WorkerEvent::Uploaded { local_id, .. } => Some(local_id.clone()),
        _ => None,
    }).collect();
    assert!(!uploads_after.contains(&"f-203".to_string()), "لا رفع بعد إبطال الرمز");
    // سبب البثّ من عامل الطابور (الـsink) — مقطوع الاقتران يبثّ من عنده
    assert!(
        sink.0.lock().unwrap().iter().any(|e| matches!(
            e,
            WorkerEvent::Lost { reason_ar } if reason_ar.contains("أعد الاقتران")
        )),
        "بثّ lost بالسبب العربيّ"
    );

    // ---------- تنظيف حتميّ: لا اعتماد اختباريّ متبقٍّ ----------
    let _ = vault::forget_token(&origin);
    let _ = vault::forget_email(&origin);
    assert!(vault::read_token(&origin).is_none() && vault::read_email(&origin).is_none());
    drop(wake_tx);
    let _ = worker.join();
    srv2.kill();
    let _ = std::fs::remove_dir_all(&base);
}
