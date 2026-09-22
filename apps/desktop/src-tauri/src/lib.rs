/// الخطوة ٢ (خطوة خطوة بقرار المالك 2026-09-19): **لا قصّ نافذة إطلاقًا** —
/// كل آليّة قصّ المناطق حُذفت من جذورها لأن ازدواج الرسم (CSS + قصّ
/// النظام) هو مصدر «دائرة داخل مربّع» والتشوهات المتكرّرة. الزر هو
/// النافذة نفسها: مربّع كحليّ بلون هوية التصميم المرجعيّ
/// (‎#243946→‎#1C2B33)، وزواياه باستدارة ويندوز ١١ النظاميّة
/// (DWMWCP_ROUND — تقريبُ المُركِّب نفسه الذي تُقرَّب به كلّ نوافذ
/// النظام؛ سطح النافذة مصمت بلا أيّ بكسل شفّاف فلا تُفلطه حماية WDA).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub mod sensors;
pub mod transport;

use sensors::events::{FactsEvt, FramePickResult};
use sensors::hook;
use sensors::select::Which;
use tauri::Manager;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};
use webview2_com::PermissionRequestedEventHandler;
use windows::Win32::Foundation::COLORREF;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_NCRENDERING_POLICY,
    DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMNCRP_DISABLED, DWMSBT_NONE,
    DWMWCP_ROUND,
};
// (لا استيرادات GDI — الخطوة ١ بلا أي قصّ نوافذ)
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowDisplayAffinity, SetWindowLongPtrW, SetWindowPos, GWL_STYLE,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WDA_EXCLUDEFROMCAPTURE,
    WS_CAPTION, WS_THICKFRAME,
};

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
/// (التتبّع تشخيصيّ دائم — أي مرحلة تعلق يصرخ سجلُّها باسمها)
#[tauri::command]
fn recording_stop() {
    #[cfg(debug_assertions)]
    eprintln!("[stop] tick");
    sensors::tick::stop();
    #[cfg(debug_assertions)]
    eprintln!("[stop] uia");
    sensors::uia::stop();
    #[cfg(debug_assertions)]
    eprintln!("[stop] capture");
    sensors::capture::stop();
    #[cfg(debug_assertions)]
    eprintln!("[stop] hook");
    hook::stop();
    #[cfg(debug_assertions)]
    eprintln!("[stop] done");
}

/// `frame_pick(seq, before|after)` — الحلقة تحفظ ٨ إطارات (~٥٠٠ms) على الـGPU (٣ب-٣)
#[tauri::command]
fn frame_pick(seq: u64, which: Which) -> FramePickResult {
    #[cfg(debug_assertions)]
    eprintln!("[pick] called seq={} {:?}", seq, which);
    // تشخيص النتيجة بالتوقيتات في capture.rs وحده — لا تكرار هنا
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
    // TAM-FIX (2026-09-21): الترميز الكامل صار خلفيًّا — التسليم ينتظر ترميز
    // إطار هذه الخطوة قبل قراءة ملفه (سقف 15ث ثم مضيّ بمسار الفشل الصادق)
    sensors::capture::wait_pending_encoders(std::time::Duration::from_secs(15));
    transport::queue::queue_file(
        &transport::queue::frames_dir(),
        &transport::queue::queue_files_dir()?,
        &session_id,
        &local_id,
    )?;
    transport::upload::wake(app);
    Ok(())
}

/// `queue_audio(sessionId, localId, webmB64)` — ملفّ التعليق الصوتي يدخل ملكيّة
/// الطابور: الترميز يُفكّ داخل Rust وحده (الرمز محروس ولا يعبر للـwebview)،
/// يُكتب ‏.webm مملوكًا ذرّيًّا بسجلّ نوعه صوت، بمفتاح عدم التكرار
/// ‏audio-{sessionId}-{localId} — ثم إيقاظة العامل كاللقطات تمامًا
#[tauri::command]
fn queue_audio(
    app: tauri::AppHandle,
    session_id: String,
    local_id: String,
    webm_b64: String,
) -> Result<(), String> {
    let bytes = transport::queue::base64_decode(&webm_b64)?;
    transport::queue::queue_audio_bytes(
        &transport::queue::queue_files_dir()?,
        &session_id,
        &local_id,
        &bytes,
    )?;
    transport::upload::wake(app);
    Ok(())
}

/// `queue_guide(sessionId, guideJson, hasVoice)` — §٣.٥: جسم الدليل يُكتب إلى
/// الطابور **نصًّا معتِمًا كما هو** — Rust لا يفكّكه ولا يفهرسه (القاعدة
/// الذهبيّة) — ثم إيقاظة العامل. مفتاح عدم التكرار ‏guide-{sessionId}، وعلم
/// ‏hasVoice بسيط يقود إطلاق التفريغ الخادميّ بعد النجاح لا غير
#[tauri::command]
fn queue_guide(
    app: tauri::AppHandle,
    session_id: String,
    guide_json: String,
    has_voice: bool,
) -> Result<(), String> {
    transport::guide_queue::queue_guide(
        &transport::guide_queue::guides_dir()?,
        &session_id,
        &guide_json,
        has_voice,
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
      queue_audio,
      queue_guide,
      queue_retry_failed,
      open_in_browser,
      app_exit
    ])
    .setup(|app| {
      // ٣ب-٣ (نقطة المالك ٣): نوافذ إتقان تختفي من لقطاتها نفسها.
      // بوّابة تشخيص: ‏ITQAN_DEBUG_VISIBLE=1 تُسقط الحجب كي تُرى الودجة في
      // لقطات الشاشة أثناء تشخيص الزجاج حيًّا — الإنتاج لا يضبطها أبدًا
      let debug_visible = std::env::var("ITQAN_DEBUG_VISIBLE").is_ok();
      // حلقتا النوافذ ونداءات DWM الأربعة مكررة ظاهريًّا — وترتيب WDA/الخلفية مقابل خلع الأنماط حسّاس بتقارير مالك،
      // فأُبقي الفصل؛ يكفي استخراج مساعد dwm_set عند اللمس القادم.
      for w in app.handle().webview_windows().values() {
        // نافذتان منذ «فصل المنبثقة» (طلب المالك 2026-09-19): ‏main هي
        // الحصاة الدائمة وpopout البطاقات المنبثقة — لكلٍّ خلفيّةُ شكلها
        let is_main = w.label() == "main";
        if let Ok(h) = w.hwnd() {
          unsafe {
            if !debug_visible {
              let _ = SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
            }
          }
          // الأساس من أول إطار بلون الزر نفسه فلا «لونان»: الحصاة كحليّة
          // والبطاقات المنبثقة فاتحة ‎#FCFCFC
          if is_main {
            let _ = w.set_background_color(Some(tauri::utils::config::Color(
              0x1c, 0x2b, 0x33, 255,
            )));
          } else {
            let _ = w.set_background_color(Some(tauri::utils::config::Color(
              0xfc, 0xfc, 0xfc, 255,
            )));
          }
        }
      }
      // تشخيص 2026-09-18 المكتمل بالتجربة الحيّة: ‏WDA_EXCLUDEFROMCAPTURE
      // إلزاميّ مرتين — للمنتج (الودجة لا تظهر في لقطات المستخدم) وللرؤية
      // نفسها (بلا WDA لا تُركَّب النافذة على الشاشة إطلاقًا). ومسار الحماية
      // الذي يرسمه WDA يُفلط ألفا النافذة ⇒ لا أكريليك نظاميّ ولا شفافيّة
      // حقيقيّة ممكنة أصلًا. لذا: نُطفئ أيّ خلفيّة نظامية صراحةً (DWMSBT_NONE
      // كي لا يرسم ويندوز إطارها الحدوديّ)، وبلا حدّ وبلا لون شريط العنوان
      // (‏CAPTION — سطر ويندوز العلويّ الذي بقي ظاهرًا بعد حيلة الفيض)،
      // والزوايا باستدارة ويندوز ١١ النظاميّة (ROUND — انظر أدناه).
      // البطاقة نفسها تفيض خارج حدود النافذة في CSS (‎.shell بهامش سالب) كي
      // يكون كل بكسل على حافّة النافذة معتمًا — لا هالة إطار مفلطَة.
      for w in app.handle().webview_windows().values() {
        let is_main = w.label() == "main";
        if let Ok(h) = w.hwnd() {
          unsafe {
            // قصّ الزوايا يجعل ويندوز يعيد الإطار الكلاسيكيّ (شريط عنوان
            // بأزراره خلف البطاقة الشفافة) — ‏NCRENDERING_POLICY=DISABLED
            // يطفئ رسم الإطار غير العمِلي كليًّا فيغيب الشريط الشبحيّ
            let no_nc = DWMNCRP_DISABLED;
            let _ = DwmSetWindowAttribute(
              h,
              DWMWA_NCRENDERING_POLICY,
              &no_nc as *const _ as *const core::ffi::c_void,
              std::mem::size_of_val(&no_nc) as u32,
            );
            let no_backdrop = DWMSBT_NONE;
            let _ = DwmSetWindowAttribute(
              h,
              DWMWA_SYSTEMBACKDROP_TYPE,
              &no_backdrop as *const _ as *const core::ffi::c_void,
              std::mem::size_of_val(&no_backdrop) as u32,
            );
            let none = COLORREF(0xFFFF_FFFE); // DWMWA_COLOR_NONE
            let _ = DwmSetWindowAttribute(
              h,
              DWMWA_BORDER_COLOR,
              &none as *const COLORREF as *const core::ffi::c_void,
              std::mem::size_of::<COLORREF>() as u32,
            );
            // ⚠ لا تكتب هنا سمة «لون شريط العنوان» ولو بقيمة NONE — تحديد
            // لون الشريط يجعل ويندوز يفعّل رسم الشريط نفسه (أزرار إغلاق/
            // تصغير/تكبير + العنوان) خلف البطاقة الشفافة («الحاوية الشبحيّة»
            // — بلاغ المالك 2026-09-18). الشريط العلويّ المتبقّي أمرٌ به.
            // الخطوة ٢ (طلب المالك 2026-09-19: «اجعل حوافّ المربّع منحنيّة
            // قليلًا… كي يشبه ثيم ويندوز ١١»): استدارة النظام نفسه — تقريب
            // المُركِّب DWM الذي تُقرَّب به كلّ نوافذ النظام وقوائمه (والقوائم
            // نوافذ POPUP بلا إطار، فالنافذة المخلوعة من الأنماط تُقرَّب
            // مثلها تمامًا). السطح يبقى مصمتًا كاملًا والاستدارة تُطبَّق في
            // التركيب على الشاشة لا داخل السطح ⇒ لا بكسل شفّاف تُفلطه حماية
            // WDA («الحلقة السماويّة» مستحيلة من هذا الباب)، ولا قصّ
            // برمجيًّا إطلاقًا
            let pref = DWMWCP_ROUND;
            let _ = DwmSetWindowAttribute(
              h,
              DWMWA_WINDOW_CORNER_PREFERENCE,
              &pref as *const _ as *const core::ffi::c_void,
              std::mem::size_of_val(&pref) as u32,
            );
            // بلاغ «الحلقة السماويّة» (2026-09-19 ليلًا): قياسنا الفيزيائي
            // أثبت أن نافذة decorations:false تحمل رغمًا عنها WS_CAPTION
            // (شريط عنوان خفيّ يُبقي منطقة غير عميلة حول المحتوى) و
            // WS_THICKFRAME (حوافّ تحجيم خفيّة) — وويندوز يرسم حولها تركيزًا
            // حدوديًّا سماويًّا. نفصل النمطين فتصبح النافذة = الزر بكسلًا
            // بكسلًا بلا أيّ إطار يُرى أو يُفلط — وهذا هو «الشبح» نفسه الذي
            // طالما رُصد في الجولات السابقة من بابه
            let style = GetWindowLongPtrW(h, GWL_STYLE);
            let frame_bits = WS_CAPTION.0 | WS_THICKFRAME.0;
            let stripped = (style as usize & !(frame_bits as usize)) as isize;
            SetWindowLongPtrW(h, GWL_STYLE, stripped);
            let _ = SetWindowPos(
              h,
              None,
              0,
              0,
              0,
              0,
              SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
            // مكتبة النافذة تحفظ سماكة الإطار من لحظة الإنشاء وتضيفها فوق
            // كل تحجيم لاحق — فنضغط الخارج إلى ٦٦×٦٦ فيزيائيًّا مباشرة
            // (المربع ٤٤ منطقيًّا عند ‏DPI ‏1.5) بعد خلع الأنماط — للحصاة
            // حصرًا: مقاس المنبثقة تديره الواجهة حسب بطاقتها المعروضة
            if is_main {
              let _ = SetWindowPos(
                h,
                None,
                0,
                0,
                66,
                66,
                SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
              );
            }
          }
        }
      }
      // المرحلة ٢-م٠: منح نافذتنا إذن الميكروفون داخل التطبيق حصرًا (wry يمنح
      // الحافظة وحدها). قفل خصوصية ويندوز العام — إعدادات الميكروفون للجهاز —
      // يبقى ساريًا فوقنا، والرفض يمرّ لاحقًا رسالته العربية الصادقة من مسار
      // VOX-06: «لا صوت — الالتقاط مستمر»
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.with_webview(|webview| {
          unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else { return };
            // توكن تسجيل الحدث — i64 كما تعامل wry معه
            let mut token = 0i64;
            let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
              if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                  // ‏SetState وحده فصلٌ حاسم — واجهة args في webview2-com 0.38
                  // بلا خاصيّة Handled، والإعداد يمنع نافذة الطلب الافتراضيّة
                  args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
              }
              Ok(())
            }));
            let _ = core.add_PermissionRequested(&handler, &mut token);
          }
        });
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
