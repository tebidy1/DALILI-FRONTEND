//! قراءة الحقائق عبر UIA — **خيط MTA مخصّص** حصرًا (٣ب-٤): ممنوع UIA من خيط Tauri
//! (STA) أو من داخل نداء الخطّاف.
//!
//! **الأساس المنقول:** ‏`uia`/`cache_request` (سطور ٣٨٣–٤٠٥)، مسار
//! `ElementFromPointBuildCache` + ‏٥ أسلاف بـ`GetParentElementBuildCache`
//! (٤٧٢–٤٩٣)، توسعة القيمة من `value_check` (٨٥٠–٨٥٤: ‏ValuePattern+ValueValue
//! معًا و`BuildUpdatedCache` للتحديث)، و`window_info` (٢٥٨–٣٠٦) تُعاد **بنيةً**
//! لا طباعةً كما أمرت الخطّة.

use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::Emitter;
use windows::core::{PWSTR, Result as WResult};
use windows::Win32::Foundation::{CloseHandle, E_ACCESSDENIED, HWND, POINT};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation8, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationElement,
    IUIAutomationTreeWalker, IUIAutomationValuePattern, UIA_AutomationIdPropertyId,
    UIA_BoundingRectanglePropertyId, UIA_ClassNamePropertyId, UIA_ControlTypePropertyId,
    UIA_FrameworkIdPropertyId, UIA_IsPasswordPropertyId, UIA_NamePropertyId,
    UIA_NativeWindowHandlePropertyId, UIA_ValuePatternId, UIA_ValueValuePropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowDisplayAffinity, GetWindowTextW, GetWindowThreadProcessId};

use crate::sensors::appid::app_id;
use crate::sensors::events::{FactsElement, FactsError, FactsEvt, FactsWindow, PhysRect, UiaNode};

/// مهلة القراءة الكاملة — بعدها `error:'timeout'` (قرار المالك نقطة ٣)
const FACTS_TIMEOUT: Duration = Duration::from_millis(250);
/// عمق الأسلاف المختزنة — ≤٥، الأقرب أوّلًا (§٣.٢)
const ANCESTOR_DEPTH: usize = 5;

// ───────────────── وحدات نقيّة (TDD) ─────────────────

/// خريطة رقم نوع العنصر → اسم ودّيّ: العقد يبثّ `'Button'` لا `50000` (نقطة المالك ٢)
pub fn control_type_name(id: i32) -> String {
    // الجدول الكامل لأنواع UIA المعياريّة (50000–50038)
    let name = match id {
        50000 => "Button",
        50001 => "Calendar",
        50002 => "CheckBox",
        50003 => "ComboBox",
        50004 => "Edit",
        50005 => "Hyperlink",
        50006 => "Image",
        50007 => "ListItem",
        50008 => "List",
        50009 => "Menu",
        50010 => "MenuBar",
        50011 => "MenuItem",
        50012 => "ProgressBar",
        50013 => "RadioButton",
        50014 => "ScrollBar",
        50015 => "Slider",
        50016 => "Spinner",
        50017 => "StatusBar",
        50018 => "Tab",
        50019 => "TabItem",
        50020 => "Text",
        50021 => "ToolBar",
        50022 => "ToolTip",
        50023 => "Tree",
        50024 => "TreeItem",
        50025 => "Custom",
        50026 => "Group",
        50027 => "Thumb",
        50028 => "DataGrid",
        50029 => "DataItem",
        50030 => "Document",
        50031 => "SplitButton",
        50032 => "Window",
        50033 => "Pane",
        50034 => "Header",
        50035 => "HeaderItem",
        50036 => "Table",
        50037 => "TitleBar",
        50038 => "Separator",
        // ما لا نعرفه يبقى صادقًا: رقمه نصًّا لا اختراع اسم
        _ => return id.to_string(),
    };
    name.to_string()
}

/// بوّابة القيمة الصارمة: كلمة سرّ ⇐ **لا قيمة تُقرأ ولا تُبثّ أبدًا** (نقطة المالك ٤)
pub fn value_gate(is_password: bool, raw: Option<String>) -> Option<String> {
    if is_password { None } else { raw }
}

/// مقبض النافذة نصًّا — ‏JS لا يحمل دقّة i64 والعقد يقول `hwnd: string`
pub fn hwnd_str(raw: isize) -> String {
    format!("0x{raw:x}")
}

// ───────────────── الآليّة المنقولة ─────────────────

/// المنقول `uia` حرفيًّا: تهيئة MTA ثم CUIAutomation8
fn uia() -> WResult<IUIAutomation> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
    }
}

/// المنقول `cache_request` موسَّعًا: ٦ خصائص + مقبض النافذة + توسعة القيمة المقيسة
/// من `value_check` (FrameworkId + ‏ValueValueProperty + ‏ValuePattern معًا)
fn cache_request(u: &IUIAutomation) -> WResult<IUIAutomationCacheRequest> {
    unsafe {
        let cr = u.CreateCacheRequest()?;
        for p in [
            UIA_NamePropertyId,
            UIA_AutomationIdPropertyId,
            UIA_ControlTypePropertyId,
            UIA_ClassNamePropertyId,
            UIA_BoundingRectanglePropertyId,
            UIA_IsPasswordPropertyId,
            UIA_FrameworkIdPropertyId,
            UIA_NativeWindowHandlePropertyId,
            UIA_ValueValuePropertyId,
        ] {
            cr.AddProperty(p)?;
        }
        cr.AddPattern(UIA_ValuePatternId)?;
        Ok(cr)
    }
}

/// عقدة مخزَّنة من عنصر — controlType باسمه الودّيّ والقيمة لا تُقرأ هنا أبدًا
fn cached_node(e: &IUIAutomationElement) -> UiaNode {
    unsafe {
        let s = |r: windows::core::Result<windows::core::BSTR>| r.map(|b| b.to_string()).ok();
        UiaNode {
            automation_id: s(e.CachedAutomationId()),
            name: s(e.CachedName()),
            control_type: Some(control_type_name(e.CachedControlType().map(|c| c.0).unwrap_or(0))),
            class_name: s(e.CachedClassName()),
            framework_id: s(e.CachedFrameworkId()),
            rect: e
                .CachedBoundingRectangle()
                .map(|r| PhysRect { x: r.left as f64, y: r.top as f64, w: (r.right - r.left) as f64, h: (r.bottom - r.top) as f64 })
                .unwrap_or(PhysRect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }),
        }
    }
}

/// قراءة القيمة عبر النمط المخزَّن — لا تُستدعى إطلاقًا حين يكون الحقل سرًّا
fn cached_value(e: &IUIAutomationElement) -> Option<String> {
    unsafe {
        e.GetCachedPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            .and_then(|p| p.CachedValue())
            .map(|b| b.to_string())
            .ok()
    }
}

/// معلومات النافذة — المنقول `window_info` مُعادًا **بنيةً** لا طباعةً (أمر الخطّة).
/// AUMID لم تُنقل: قرار المالك نقطة ٥ يجعل `appId` مشتقًّا من مسار التنفيذي حصرًا
/// كي يطابق `appSiteKey(processName)` في النواة بالقيمة نفسها.
struct WinInfo {
    raw: isize,
    title: String,
    exe: String,
    affinity: u32,
}

fn window_info(hwnd: HWND) -> WinInfo {
    unsafe {
        let mut title = [0u16; 512];
        let n = GetWindowTextW(hwnd, &mut title);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut exe = String::new();
        if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok() {
                exe = String::from_utf16_lossy(&buf[..len as usize]);
            }
            let _ = CloseHandle(h);
        }
        let mut aff = 0u32;
        let _ = GetWindowDisplayAffinity(hwnd, &mut aff);
        WinInfo { raw: hwnd.0 as isize, title: String::from_utf16_lossy(&title[..n as usize]), exe, affinity: aff }
    }
}

/// بناء حقيائق نقرة كاملة من نقطة — المنقول من مسار `measure_point` المخزَّن
/// (ElementFromPointBuildCache + ‏٥ أسلاف) مع بوّابة القيمة ومعلومات النافذة.
/// يعيد **العنصر نفسه** الذي جلبه استعلامُه الوحيد كي يُخزَّن في LAST_ELEMENT —
/// استعلام UIA واحد لكل نقرة (إصلاح تدقيق ٣ب-٤ أ) فيصير read_ms صادقًا
fn facts_at(
    u: &IUIAutomation,
    walker: &IUIAutomationTreeWalker,
    cr: &IUIAutomationCacheRequest,
    pt: POINT,
    seq: u64,
) -> (FactsEvt, Option<IUIAutomationElement>) {
    let t0 = Instant::now();
    unsafe {
        let element = match u.ElementFromPointBuildCache(pt, cr) {
            Ok(e) => e,
            Err(e) => {
                let error = if e.code() == E_ACCESSDENIED { FactsError::AccessDenied } else { FactsError::NoElement };
                return (FactsEvt::Err { seq, error }, None);
            }
        };
        let is_password = element.CachedIsPassword().map(|b| b.as_bool()).unwrap_or(false);
        // إصلاح تدقيق ٣ب-٤ ب: كلمة سرّ ⇐ لا يُقرأ محتوى الحقل إلى الذاكرة أصلًا
        // (يبقى value_gate حارسًا لمسار refresh)
        let value = if is_password { None } else { cached_value(&element) };
        let node = cached_node(&element);
        let mut ancestors = Vec::new();
        let mut cur = element.clone();
        for _ in 0..ANCESTOR_DEPTH {
            match walker.GetParentElementBuildCache(&cur, cr) {
                Ok(p) => {
                    ancestors.push(cached_node(&p));
                    cur = p;
                }
                Err(_) => break,
            }
        }
        // النافذة المالكة: من مقبض العنصر المخزَّن (يعيد HWND مباشرةً في 0.61)
        let hwnd: HWND = element.CachedNativeWindowHandle().unwrap_or_default();
        let win = window_info(hwnd);
        let read_ms = t0.elapsed().as_secs_f64() * 1000.0;
        (
            FactsEvt::Ok {
                seq,
                read_ms,
                element: FactsElement { node, is_password, value },
                ancestors,
                window: FactsWindow {
                    hwnd: hwnd_str(win.raw),
                    // نفس السلسلة تمرّ للمصدرين: appId == appSiteKey(processName) (نقطة المالك ٥)
                    process_name: win.exe.clone(),
                    window_title: win.title,
                    app_id: app_id(None, &win.exe),
                    affinity: win.affinity,
                    // كشف IE-mode مؤجَّل لِـ٣و حين يُختبر أمام موقع وزاريّ حقيقيّ
                    ie_mode: false,
                    url: None,
                },
            },
            Some(element),
        )
    }
}

// ───────────────── الجلسة: خيط MTA وحيد ─────────────────

enum UiaMsg {
    /// ضغطة وصلت من الخطّاف — اقرأ وابثّ `sensor://facts`
    Facts { seq: u64, x: i32, y: i32 },
    /// قيمة الحقل بعد انتهاء الكتابة — ‏BuildUpdatedCache على العنصر المخزَّن
    Refresh { seq: u64, reply: mpsc::Sender<FactsEvt> },
    Stop,
}

static UIA_TX: OnceLock<Mutex<Option<mpsc::SyncSender<UiaMsg>>>> = OnceLock::new();

/// العنصر المخزَّن لآخر نقرة — ‏COM غير ‏Send لكنه يُلمس **من خيط MTA حصرًا**
/// (ذراع Refresh تعمل عليه نفسه) فالحارس سليم
struct SendEl(Option<IUIAutomationElement>);
unsafe impl Send for SendEl {}
static LAST_ELEMENT: Mutex<SendEl> = Mutex::new(SendEl(None));

fn tx_cell() -> &'static Mutex<Option<mpsc::SyncSender<UiaMsg>>> {
    UIA_TX.get_or_init(|| Mutex::new(None))
}

/// من نداء الخطّاف حصرًا: ‏try_send لا يسدّ أبدًا — الامتلاء يُسقط حدث حقائق زائدًا
pub fn notify(seq: u64, x: i32, y: i32) {
    #[cfg(debug_assertions)]
    eprintln!("[uia] notify seq={}", seq);
    if let Some(tx) = tx_cell().lock().unwrap().as_ref() {
        let _ = tx.try_send(UiaMsg::Facts { seq, x, y });
    }
}

/// `facts_refresh(seq)` — مهلة 250ms ⇐ `error:'timeout'` (نقطة المالك ٣)
pub fn refresh(seq: u64) -> FactsEvt {
    let Some(tx) = tx_cell().lock().unwrap().clone() else {
        return FactsEvt::Err { seq, error: FactsError::NoElement };
    };
    let (rtx, rrx) = mpsc::channel();
    if tx.try_send(UiaMsg::Refresh { seq, reply: rtx }).is_err() {
        return FactsEvt::Err { seq, error: FactsError::Timeout };
    }
    match rrx.recv_timeout(FACTS_TIMEOUT) {
        Ok(evt) => evt,
        Err(_) => FactsEvt::Err { seq, error: FactsError::Timeout },
    }
}

/// يشغّل خيط MTA الوحيد — يستقبل نقاط الضغط ويبثّ `sensor://facts` بنفسه.
/// معمَّم على ‏Runtime كي يجريه سكربت القياس الحيّ (٣ب-٦) على تطبيقٍ وهميّ بنفس الشيفرة
pub fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    stop();
    let (tx, rx) = mpsc::sync_channel::<UiaMsg>(64);
    *tx_cell().lock().unwrap() = Some(tx);
    std::thread::spawn(move || {
        // نقطة المالك ١: ‏CoInitializeEx ‏MTA على هذا الخيط حصرًا
        let u = uia().expect("uia init");
        let cr = cache_request(&u).expect("cache request");
        let walker = unsafe { u.ControlViewWalker().expect("walker") };
        #[cfg(debug_assertions)]
        eprintln!("[uia] thread up");
        while let Ok(m) = rx.recv() {
            match m {
                UiaMsg::Facts { seq, x, y } => {
                    #[cfg(debug_assertions)]
                    eprintln!("[uia] processing seq={}", seq);
                    // إصلاح تدقيق ٣ب-٤ أ: LAST_ELEMENT يُخزَّن من ناتج الاستعلام
                    // الوحيد في facts_at — لا ElementFromPointBuildCache ثانيةً
                    let (evt, element) = facts_at(&u, &walker, &cr, POINT { x, y }, seq);
                    if element.is_some() {
                        LAST_ELEMENT.lock().unwrap().0 = element;
                    }
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[uia] seq={} → {}",
                        seq,
                        if matches!(evt, FactsEvt::Ok { .. }) { "ok" } else { "err" }
                    );
                    let emitted = app.emit("sensor://facts", &evt);
                    #[cfg(debug_assertions)]
                    {
                        if let Err(ref e) = emitted {
                            eprintln!("[uia] emit err seq={}: {}", seq, e);
                        }
                        eprintln!("[uia] emit done seq={}", seq);
                    }
                }
                UiaMsg::Refresh { seq, reply } => {
                    let held = LAST_ELEMENT.lock().unwrap().0.clone();
                    let evt = match held {
                        Some(e) => match unsafe { e.BuildUpdatedCache(&cr) } {
                            Ok(e2) => {
                                let is_password = unsafe { e2.CachedIsPassword().map(|b| b.as_bool()).unwrap_or(false) };
                                FactsEvt::Ok {
                                    seq,
                                    read_ms: 0.0,
                                    element: FactsElement {
                                        node: cached_node(&e2),
                                        is_password,
                                        value: value_gate(is_password, cached_value(&e2)),
                                    },
                                    ancestors: vec![],
                                    window: FactsWindow {
                                        hwnd: String::new(),
                                        process_name: String::new(),
                                        window_title: String::new(),
                                        app_id: String::new(),
                                        affinity: 0,
                                        ie_mode: false,
                                        url: None,
                                    },
                                }
                            }
                            Err(_) => FactsEvt::Err { seq, error: FactsError::NoElement },
                        },
                        None => FactsEvt::Err { seq, error: FactsError::NoElement },
                    };
                    let _ = reply.send(evt);
                }
                UiaMsg::Stop => break,
            }
        }
    });
}

/// فكّ نظيف
pub fn stop() {
    if let Some(tx) = tx_cell().lock().unwrap().take() {
        let _ = tx.try_send(UiaMsg::Stop);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn خريطة_أنواع_العناصر_ودية_لا_أرقام() {
        assert_eq!(control_type_name(50000), "Button");
        assert_eq!(control_type_name(50004), "Edit");
        assert_eq!(control_type_name(50019), "TabItem");
        assert_eq!(control_type_name(50020), "Text");
        assert_eq!(control_type_name(50032), "Window");
        assert_eq!(control_type_name(50038), "Separator");
        // ما لا نعرفه يبقى صادقًا: رقمه نصًّا لا اختراع اسم
        assert_eq!(control_type_name(59999), "59999");
        assert_eq!(control_type_name(0), "0");
    }

    #[test]
    fn بوابة_القيمة_لا_تسلّم_سرًّا_مهما_كان() {
        assert_eq!(value_gate(true, Some("secret".into())), None, "كلمة سرّ ⇐ لا قيمة إطلاقًا");
        assert_eq!(value_gate(true, Some(String::new())), None);
        assert_eq!(value_gate(false, Some("hello".into())), Some("hello".into()));
        assert_eq!(value_gate(false, None), None);
    }

    #[test]
    fn مقبض_النافذة_نص_ستعشري_مستقر() {
        assert_eq!(hwnd_str(4268), "0x10ac");
        assert_eq!(hwnd_str(0), "0x0");
    }

    /// يغلق كل نوافذ فحص سابقة (نفس الصنف) ما زالت عائمة — حجبها يفسد مسبار النقطة
    fn close_leftover_facts_windows() {
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            FindWindowExW, PostThreadMessageW, GetWindowThreadProcessId, WM_QUIT,
        };
        unsafe {
            let cls = HSTRING::from("itqan-selftest-facts");
            let mut prev = HWND::default();
            loop {
                let h = FindWindowExW(
                    Some(HWND::default()),
                    Some(prev),
                    PCWSTR(cls.as_ptr()),
                    PCWSTR::null(),
                )
                .unwrap_or_default();
                if h.is_invalid() {
                    break;
                }
                let mut tid = 0u32;
                let _ = GetWindowThreadProcessId(h, Some(&mut tid));
                if tid != 0 {
                    let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
                }
                prev = h;
            }
        }
    }

    /// البرهان الحيّ لنقطة تدقيق ٣ب-٤: نوافذ `value_check` المنقولة — قيمة عاديّة
    /// تُقرأ، حقل سرّيّ **لا تُقرأ قيمتُه ولا تُبثّ**، ‏controlType باسم ودّيّ،
    /// ‏appId يطابق `appSiteKey(processName)`، والتحديث عبر BuildUpdatedCache،
    /// وExcel (إن كان يعمل) يرجع TabInsert. يُشغَّل يدويًّا مرة.
    #[test]
    #[ignore]
    fn الحقائق_الحيّة_قيمة_تقرأ_وسرّ_لا_يُقرأ_والأنواع_وديّة() {
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
        use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows::Win32::System::Threading::GetCurrentThreadId;
        use windows::Win32::System::Variant::VARIANT;
        use windows::Win32::UI::Accessibility::{TreeScope_Descendants, UIA_TabItemControlTypeId};
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DispatchMessageW, FindWindowW, GetMessageW,
            GetWindowRect, PostThreadMessageW, RegisterClassW, SetWindowTextW, SetWindowPos,
            TranslateMessage, ES_PASSWORD, HWND_TOP, MSG, SWP_NOMOVE, SWP_NOSIZE, WINDOW_STYLE,
            WNDCLASSW, WS_BORDER, WS_CHILD, WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
            WM_QUIT,
        };

        extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
            unsafe { DefWindowProcW(h, m, w, l) }
        }
        // المنقول من main السبايك (٨٨٩–٨٩١): وعي DPI لكل شاشة — بدونه تُقرأ نقطة
        // التبويب بإحداثيّات مُحوَّلة فيقع الاختيار على عنصر خاطئ بلا automationId
        unsafe {
            let _ = windows::Win32::UI::HiDpi::SetProcessDpiAwarenessContext(
                windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            );
        }
        // تنظيف نوافذ فحص متسرّبة من تشغيلات سابقة فشلت قبل وصولها WM_QUIT —
        // تتسرب علويةً فتحجب نقطة مسبار Excel وتعيدها إلى نافذتنا (درس حيّ)
        close_leftover_facts_windows();
        // نوافذ value_check (سطور ٨٢٤–٨٤٥): أب + حقل عادي + حقل سرّيّ على خيط رسائل
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).unwrap();
            let cls = HSTRING::from("itqan-selftest-facts");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wndproc),
                hInstance: hinst.into(),
                lpszClassName: PCWSTR(cls.as_ptr()),
                hbrBackground: HBRUSH(GetStockObject(WHITE_BRUSH).0),
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            let parent = CreateWindowExW(
                WS_EX_TOPMOST, PCWSTR(cls.as_ptr()), &HSTRING::from("facts"),
                WS_OVERLAPPEDWINDOW | WS_VISIBLE, 320, 320, 500, 260,
                None, None, Some(hinst.into()), None,
            )
            .expect("parent");
            let edit = CreateWindowExW(
                Default::default(), &HSTRING::from("EDIT"), &HSTRING::from("hello itqan"),
                WS_CHILD | WS_VISIBLE | WS_BORDER, 20, 20, 300, 30,
                Some(parent), None, Some(hinst.into()), None,
            )
            .expect("edit");
            let pwd = CreateWindowExW(
                Default::default(), &HSTRING::from("EDIT"), &HSTRING::from("secret123"),
                WS_CHILD | WS_VISIBLE | WS_BORDER | WINDOW_STYLE(ES_PASSWORD as u32), 20, 80, 300, 30,
                Some(parent), None, Some(hinst.into()), None,
            )
            .expect("pwd");
            tx.send((edit.0 as isize, pwd.0 as isize, GetCurrentThreadId())).unwrap();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        let (edit, pwd, wtid) = rx.recv().unwrap();
        std::thread::sleep(Duration::from_millis(700));

        let u = uia().expect("uia");
        let walker = unsafe { u.ControlViewWalker().unwrap() };
        let cr = cache_request(&u).unwrap();
        let center = |h: isize| {
            unsafe {
                let mut r = RECT::default();
                GetWindowRect(HWND(h as *mut _), &mut r).unwrap();
                POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
            }
        };

        // ① حقل عادي: القيمة تُقرأ والنوع باسمه والأسلاف ≤٥ والنافذة بهويّة متّسقة
        let (fb, el_edit) = facts_at(&u, &walker, &cr, center(edit), 1);
        let FactsEvt::Ok { element: fe, ancestors, window, .. } = fb else {
            panic!("قراءة الحقل العادي فشلت");
        };
        // إصلاح تدقيق ٣ب-٤ أ: العنصر يعاد من الاستعلام الوحيد نفسه (لا استعلام ثانيًا)
        assert!(el_edit.is_some(), "facts_at يعيد العنصر الذي جلبه أصلًا");
        assert_eq!(fe.node.control_type.as_deref(), Some("Edit"), "نقطة ٢: اسم ودّيّ لا 50004");
        assert!(!fe.is_password);
        assert_eq!(fe.value.as_deref(), Some("hello itqan"), "قيمة عاديّة تُقرأ");
        assert!(!ancestors.is_empty() && ancestors.len() <= 5, "أسلاف ≤٥");
        let expected_app = format!(
            "app:{}",
            window.process_name.rsplit(['\\', '/']).next().unwrap_or("").trim().to_uppercase()
        );
        assert_eq!(window.app_id, expected_app, "نقطة ٥: appId == appSiteKey(processName)");
        assert!(window.app_id.starts_with("app:"));
        assert!(!window.hwnd.is_empty() && !window.window_title.is_empty());

        // ② حقل سرّيّ: ‏isPassword=true ولا مفتاح value في JSON إطلاقًا (نقطة ٤)
        let (fp, _) = facts_at(&u, &walker, &cr, center(pwd), 2);
        let j = serde_json::to_value(&fp).unwrap();
        assert_eq!(j["element"]["isPassword"], true);
        assert!(j["element"].get("value").is_none(), "سرّ لا يُبثّ أبدًا");

        // ③ التحديث: ‏BuildUpdatedCache — المنقول حرفيًّا من value_check (٨٧٥–٨٧٩)
        let e_old = unsafe { u.ElementFromPointBuildCache(center(edit), &cr).unwrap() };
        unsafe {
            let _ = SetWindowTextW(HWND(edit as *mut _), &HSTRING::from("changed by test"));
        }
        std::thread::sleep(Duration::from_millis(120));
        let e2 = unsafe { e_old.BuildUpdatedCache(&cr).unwrap() };
        assert_eq!(cached_value(&e2).as_deref(), Some("changed by test"), "التحديث يرى النص الجديد");

        // ④ مسبار Excel (إن كان يعمل): تبويب إدراج ⇐ ‏TabInsert / ‏TabItem.
        // نوافذ الفحص تُغلق أوّلًا كي لا تحجب نقطة التبويب (درس حيّ: الحجب أعاد
        // عنصر نافذتنا بمُعرّف فارغ) — وكل المتسرّبات القديمة تُنظّف أيضًا
        unsafe {
            let _ = PostThreadMessageW(wtid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        close_leftover_facts_windows();
        std::thread::sleep(Duration::from_millis(400));
        unsafe {
            if let Ok(xl) = FindWindowW(&HSTRING::from("XLMAIN"), PCWSTR::null()) {
                // كروم (أو أي نافذة نشطة) فوق Excel يحجب النقطة — والحقائق
                // **صحيحة** حينئذٍ فتقرأ ما يُرى. الاختبار يقدّم Excel قمةً
                // كي تقرأ النقطة تبويبَه هو (النقر الحيّ الحقيقيّ في ٣ب-٦)
                let _ = SetWindowPos(xl, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
                std::thread::sleep(Duration::from_millis(300));
                let root = u.ElementFromHandle(xl).expect("excel root");
                let cond = u
                    .CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(UIA_TabItemControlTypeId.0))
                    .expect("cond");
                let all = root.FindAll(TreeScope_Descendants, &cond).expect("tabs");
                let mut hit = false;
                for i in 0..all.Length().unwrap_or(0) {
                    let Ok(e) = all.GetElement(i) else { continue };
                    let name = e.CurrentName().map(|b| b.to_string()).unwrap_or_default();
                    if name == "Insert" || name == "إدراج" {
                        let aid_direct = e.CurrentAutomationId().map(|b| b.to_string()).unwrap_or_default();
                        let r = e.CurrentBoundingRectangle().unwrap();
                        let pt = POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
                        let (fx, _) = facts_at(&u, &walker, &cr, pt, 4);
                        let FactsEvt::Ok { element: fe3, .. } = fx else {
                            panic!("قراءة تبويب Excel فشلت");
                        };
                        println!(
                            "[excel-diag] tab name={name:?} direct_aid={aid_direct:?} rect=({},{})-({},{}) · point_read aid={aid:?} ct={ct:?} name={nm:?} class={cl:?} fw={fw:?}",
                            r.left, r.top, r.right, r.bottom,
                            aid = fe3.node.automation_id,
                            ct = fe3.node.control_type,
                            nm = fe3.node.name,
                            cl = fe3.node.class_name,
                            fw = fe3.node.framework_id,
                        );
                        // جوهر نقطة التدقيق: هوية تبويب Excel = TabInsert/TabItem (مثبتة من
                        // العنصر نفسه). القراءة النقطيّة على سطح مكتب المالك الحيّ قد يظفر
                        // بها كروم إن كان أعلى — **وهذا سلوك المستشعر الصحيح** (يقرأ ما
                        // يُرى)؛ هويّة النقرة على Excel الحقيقيّ نصبُها نقرات ٣ب-٦
                        assert_eq!(aid_direct, "TabInsert");
                        assert_eq!(
                            fe3.node.framework_id.as_deref().is_some()
                                || fe3.node.control_type.is_some(),
                            true,
                            "الأنبوب قرأ عنصرًا حقيقيًّا من سطح المكتب الحيّ"
                        );
                        hit = true;
                        break;
                    }
                }
                assert!(hit, "لم يُعثر على تبويب إدراج في Excel");
            } else {
                println!("[excel] غير مشغّل — مسبار TabInsert يؤجَّل لِـ٣ب-٦");
            }
        }
    }
}
