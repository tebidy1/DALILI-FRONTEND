#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub mod sensors;
pub mod transport;

use sensors::events::{FactsEvt, FramePickResult};
use sensors::hook;
use sensors::select::Which;
use tauri::Manager;
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};

/// ردّ `recording_start` حسب العقد §٣.٣: { sessionId }
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StartAck {
    session_id: String,
}

/// يشغّل خيط الخطّاف (٣ب-٢) وحلقة الالتقاط وقراءة الحقائق (٣ب-٣/٤) ويعيد `{ sessionId }`
#[tauri::command]
fn recording_start(app: tauri::AppHandle) -> Result<StartAck, String> {
    let session_id = hook::start(app.clone());
    sensors::capture::start();
    sensors::uia::start(app.clone());
    // مضخّة النبض تُشغَّل أخيرًا وتُفكّ أوّلًا (عكسيّ): ساعة جلسة الـWebView بين
    // البدء والإيقاف حصرًا — بند تدقيق ٣ج-٢ المتابَع
    sensors::tick::start(app);
    Ok(StartAck { session_id })
}

/// إيقاف مؤقّت — الخيوط تعمل والخطّاف يبقى مركّبًا؛ دلالة الإيقاف المؤقّت تُحدَّد في ٣ج
#[tauri::command]
fn recording_pause() {}

/// فكّ نظيف بالترتيب العكسي: النبض ثم الحقائق ثم الحلقة ثم الخطّاف
#[tauri::command]
fn recording_stop() {
    sensors::tick::stop();
    sensors::uia::stop();
    sensors::capture::stop();
    hook::stop();
}

/// `frame_pick(seq, before|after)` — الحلقة تحفظ ٨ إطارات (~٥٠٠ms) على الـGPU (٣ب-٣)
#[tauri::command]
fn frame_pick(seq: u64, which: Which) -> FramePickResult {
    sensors::capture::pick(seq, which)
}

/// `frame_blur(localId, rects)` — حرق التمويه على الجهاز (٣ج-٤): بكسلات الحقل
/// الحسّاس لا تغادر الجهاز قطّ. مستطيلات ببكسل الصورة تقرّرها الجلسة (سياسة
/// في TS) والحرق آليّة هنا — ويمسّ ملفّ الإطار المؤقّت وحده لا شيء آخر
#[tauri::command]
fn frame_blur(local_id: String, rects: Vec<sensors::burn::BurnRect>) -> Result<(), String> {
    sensors::burn::blur_frame(&local_id, &rects)
}

/// `frame_thumb(localId)` — مصغّرة الخطوة الأحدث للودجة (المرحلة ١): بايتات
/// الإطار المؤقّت data URL. خامٌ يمرّ لا فهم دليل (القاعدة الذهبيّة)، والحارس
/// نفسه: localId من إنتاجنا حصرًا
#[tauri::command]
fn frame_thumb(local_id: String) -> Result<sensors::burn::ThumbDto, String> {
    sensors::burn::frame_thumb(&local_id)
}

/// `auth_pair_start(deviceName)` — §٣.٥: ‏{userCode,verifyUrl} فورًا للواجهة
/// والاستطلاع على خيط خلفيّ. الطلب على ‏spawn_blocking كي لا يحجب الواجهة.
/// البيئة عند الحدّ حصرًا (إصلاح ٣د-٤-أ): المنشأ يُقرأ هنا ويُمرَّر وسيطًا
#[tauri::command]
async fn auth_pair_start(
    app: tauri::AppHandle,
    device_name: String,
) -> Result<transport::pair::PairStart, String> {
    let origin = transport::pair::api_origin();
    tauri::async_runtime::spawn_blocking(move || {
        transport::pair::pair_start(app, origin, device_name)
    })
    .await
    .map_err(|e| format!("تعذّر تشغيل مهمّة الاقتران: {e}"))?
}

/// `auth_status` — ‏{paired,email} فقط: الاشتقاق من وجود الرمز في الخزنة،
/// والرمز نفسه لا يعبر الحدود أبدًا
#[tauri::command]
fn auth_status() -> transport::pair::PairStatus {
    transport::pair::status(&transport::pair::api_origin())
}

/// `auth_forget` — محو الخزنة (رمز + بريد) وإبطال استطلاع قائم، لا شيء آخر
#[tauri::command]
fn auth_forget() -> Result<(), String> {
    transport::pair::forget(&transport::pair::api_origin())
}

/// `auth_open_verify(code)` — فتح صفحة موافقة الاقتران في المتصفّح: الرابط
/// يُبنى في Rust من ‏web_origin عند الحدّ (كأخواته) والرمز محروس قبل البناء
#[tauri::command]
fn auth_open_verify(code: String) -> Result<(), String> {
    transport::open::open_verify(&transport::pair::web_origin(), &code)
}

/// `facts_refresh(seq)` — قيمة الحقل بعد الكتابة عبر ‏BuildUpdatedCache (٣ب-٤)
#[tauri::command]
fn facts_refresh(seq: u64) -> FactsEvt {
    sensors::uia::refresh(seq)
}

/// `queue_file(sessionId, localId)` — §٣.٥: نسخ اللقطة **المحروقة** إلى ملكيّة
/// الطابور على القرص وتوقيع السجلّ ثم إيقاظة العامل. العنصر من هذه اللحظة
/// لا يُفقد مهما أُغلق التطبيق أو انقطعت الشبكة أو نُظِّف المؤقّت
#[tauri::command]
fn queue_file(app: tauri::AppHandle, session_id: String, local_id: String) -> Result<(), String> {
    transport::queue::queue_file(
        &transport::queue::frames_dir(),
        &transport::queue::queue_files_dir()?,
        &session_id,
        &local_id,
    )?;
    transport::upload::wake(app);
    Ok(())
}

/// `queue_guide(sessionId, guideJson)` — §٣.٥: جسم الدليل يُكتب إلى الطابور
/// **نصًّا معتِمًا كما هو** — Rust لا يفكّكه ولا يفهرسه (القاعدة الذهبيّة) —
/// ثم إيقاظة العامل. مفتاح عدم التكرار ‏guide-{sessionId}
#[tauri::command]
fn queue_guide(app: tauri::AppHandle, session_id: String, guide_json: String) -> Result<(), String> {
    transport::guide_queue::queue_guide(
        &transport::guide_queue::guides_dir()?,
        &session_id,
        &guide_json,
    )?;
    transport::upload::wake(app);
    Ok(())
}

/// `queue_retry_failed()` — إعادة كل الفاشلين نهائيًّا (ملفّات وأدلّة) إلى
/// الانتظار بمحاولة صفر وإيقاظة العامل — يعيد العدد المُعاد
#[tauri::command]
fn queue_retry_failed(app: tauri::AppHandle) -> Result<u32, String> {
    let files = transport::queue::queue_files_dir()?;
    let guides = transport::guide_queue::guides_dir()?;
    let mut n = transport::queue::retry_failed(&files)?;
    n += transport::guide_queue::retry_failed(&guides)?;
    if n > 0 {
        transport::upload::wake(app);
    }
    Ok(n)
}

/// `open_in_browser(path)` — فتح مسار دليل ‎/g/<معرّف>‎ حصرًا في متصفّح النظام:
/// حارس المسار + حارس المخطط على العنوان المبني من ‏web_origin
#[tauri::command]
fn open_in_browser(path: String) -> Result<(), String> {
    transport::open::open_in_browser(&path)
}

/// `app_exit()` — إغلاق التطبيق تمامًا من قائمة الإعدادات (طلب المالك
/// ٢٠٢٦-٠٩-١٧: ودجة بلا إطار لا تملك زرّ X). الخروج عبر مسار Tauri الرسمي
/// فيُطوى الخطّاف والحلقات مع العملية — لا خيوط يتيمة بعده
#[tauri::command]
fn app_exit(app: tauri::AppHandle) {
    let _ = app.exit(0);
}

pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      recording_start,
      recording_pause,
      recording_stop,
      frame_pick,
      frame_blur,
      frame_thumb,
      facts_refresh,
      auth_pair_start,
      auth_status,
      auth_forget,
      auth_open_verify,
      queue_file,
      queue_guide,
      queue_retry_failed,
      open_in_browser,
      app_exit
    ])
    .setup(|app| {
      // ٣ب-٣ (نقطة المالك ٣): نوافذ إتقان تختفي من لقطاتها نفسها
      for w in app.handle().webview_windows().values() {
        if let Ok(h) = w.hwnd() {
          unsafe {
            let _ = SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
          }
        }
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
