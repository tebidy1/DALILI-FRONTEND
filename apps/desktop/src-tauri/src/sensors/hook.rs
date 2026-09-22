//! خيط الخطّاف — ‏`WH_MOUSE_LL` + `WH_KEYBOARD_LL` على خيط مخصّص بحلقة رسائل خاصّة (٣ب-٢).
//!
//! **الأساس المنقول:** `spawn_hook`/`mouse_proc` من السبايك المقيس
//! (`itqan-gates235/src/main.rs` سطور ٥٢٩–٥٥٨) — نفس نمط `static` + نداء
//! `extern "system"` بلا إغلاقات، وخيط يُفكّ عبر `WM_QUIT`.
//! **التوسعات بأمر الخطّة:** خطّاف لوحة مفاتيح (تصنيف `key_class` — لا `ToUnicode`
//! إطلاقًا)، قناة **محدودة** بـ`try_send` (الخطّاف لا يسدّ أبدًا)، عدّاد `seq`،
//! مراقب يعيد تركيب الخيط إن مات صامتًا، ومِضخّة تفرّغ القناة وتبثّ `sensor://input`
//! — **لا عمل داخل النداء** (ختم وإرسال فقط، حدّ `LowLevelHooksTimeout`)،
//! والاستثناء الوحيد المُقاس: رفض نقرات نوافذ عمليتنا في المصدر (٢٠٢٦-٠٩-٢٠).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tauri::Emitter;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, MSG, MSLLHOOKSTRUCT, KBDLLHOOKSTRUCT,
    LLKHF_INJECTED, PostThreadMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
    LLMHF_INJECTED, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN,
};
use windows::Win32::Foundation::{HWND, POINT}; // اكتمال توقيع GetMessageW/PostThreadMessageW

use crate::sensors::clock::{qpc, qpc_ms};
use crate::sensors::events::{InputEvt, InputKind, MouseButton};
use crate::sensors::keyclass::key_class;

/// سعة القناة المحدودة — آلاف الأحداث هامشٌ كريم، و`try_send` يمسحها لا يسدّها
const CHANNEL_CAP: usize = 4096;
/// عدّاد الأحداث المسقطة اكتمالًا — يقيسه القياس الحيّ في ٣ب-٦ (الهدف ≈0)
pub static DROPPED: AtomicU64 = AtomicU64::new(0);
/// زمن آخر نداء ضغط كاملًا بالنانو ثانية — من دخول النداء إلى بعد `offer`
/// شاملًا `note_click` (بند تدقيق ٣ب-٦: القفلان في النداء، الميزانيّة <1ms).
/// كتابتَه حمولة ذرّيّة وحيدة لا تُذكر في الميزانيّة
static DOWN_CB_NANOS: AtomicU64 = AtomicU64::new(0);
/// عدّاد رتيب عابرًا للجلسات — مفتاح الربط بين الأحداث الثلاثة (§٣.٢)
static SEQ: AtomicU64 = AtomicU64::new(0);

/// التسلسل الرتيب التالي — استدعاء واحد لكل حدث داخل النداء
pub fn next_seq() -> u64 {
    SEQ.fetch_add(1, Ordering::SeqCst)
}

/// خريطة رسالة ماوس → حدث عقد؛ الرسائل غير الضاغطة (حركة/عجلة) تعيد None
pub fn mouse_evt(seq: u64, qpc_ms: f64, msg: u32, x: i32, y: i32) -> Option<InputEvt> {
    let (kind, button) = match msg {
        WM_LBUTTONDOWN => (InputKind::Down, MouseButton::Left),
        WM_LBUTTONUP => (InputKind::Up, MouseButton::Left),
        WM_RBUTTONDOWN => (InputKind::Down, MouseButton::Right),
        WM_RBUTTONUP => (InputKind::Up, MouseButton::Right),
        WM_MBUTTONDOWN => (InputKind::Down, MouseButton::Middle),
        WM_MBUTTONUP => (InputKind::Up, MouseButton::Middle),
        _ => return None,
    };
    // x/y بكسل فيزيائي كما يمنحه MSLLHOOKSTRUCT — التحويل المنطقي في TS وحده
    Some(InputEvt { seq, qpc_ms, kind, button: Some(button), x: x as f64, y: y as f64, key_class: None })
}

/// حدث لوحة مفاتيح — `kind:'key'` مع الصنف وحده؛ بلا إحداثيّات ولا حرف إطلاقًا
pub fn key_evt(seq: u64, qpc_ms: f64, vk: u32) -> InputEvt {
    InputEvt {
        seq,
        qpc_ms,
        kind: InputKind::Key,
        button: None,
        x: 0.0,
        y: 0.0,
        key_class: Some(key_class(vk)),
    }
}

// ───────────────── الحالة المشتركة مع نداءَي الخطّاف (لا إغلاقات في HOOKPROC) ─────────────────

/// هل النقطة فوق نافذة جذريّة من عمليتنا؟ — قاعدة المصدر (2026-09-20):
/// نقرات المستخدم داخل الودجة (الحصاة/المنبثقة/البطاقات) تشغيلٌ للأداة
/// لا خطوةُ تعلّم — تُرفض قبل أن تولد حدثًا ولا التقاطًا ولا بحثَ حقائق.
pub fn point_in_our_process(pt: POINT) -> bool {
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::WindowsAndMessaging::{
        GA_ROOT, GetAncestor, GetWindowThreadProcessId, WindowFromPoint,
    };
    unsafe {
        let hwnd = WindowFromPoint(pt);
        if hwnd.0.is_null() {
            return false;
        }
        let root = GetAncestor(hwnd, GA_ROOT);
        let mut pid = 0u32;
        GetWindowThreadProcessId(root, Some(&mut pid));
        pid != 0 && pid == GetCurrentProcessId()
    }
}

/// مُرسِل القناة الحيّة — None ⇒ التسجيل متوقف فلا يُرسل النداء شيئًا
static EVENT_TX: Mutex<Option<mpsc::SyncSender<InputEvt>>> = Mutex::new(None);

/// داخل النداء حصرًا: ختم المراقب ثم `try_send` — الامتلاء يُعدّ إسقاطًا مقيسًا لا انسدادًا
fn offer(evt: InputEvt) {
    if let Some(tx) = EVENT_TX.lock().unwrap().as_ref() {
        if tx.try_send(evt).is_err() {
            DROPPED.fetch_add(1, Ordering::SeqCst);
        }
    }
}

// ───────────────── نداءا الخطّاف — المنقول من السبايك موسَّعًا (ختم وإرسال فقط) ─────────────────

unsafe extern "system" fn mouse_proc(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
    let cb_t0 = std::time::Instant::now();
    if code >= 0 {
        // ختم فوري ثم عودة — لا عمل داخل الخطّاف. المحقون يمرّ كحقائق — لا تصفّية هنا
        let info = &*(l.0 as *const MSLLHOOKSTRUCT);
        let _ = info.flags & LLMHF_INJECTED; // المحقون يمرّ كحقائق — قرار موثَّق
        let raw = qpc();
        if let Some(evt) = mouse_evt(next_seq(), qpc_ms(raw), w.0 as u32, info.pt.x, info.pt.y) {
            let is_down = evt.kind == InputKind::Down;
            if is_down && point_in_our_process(info.pt) {
                // نقرات نوافذ عمليتنا تُرفض في المصدر: لا حدث ولا التقاط ولا بحث
                // حقائق (علّة 2026-09-20: كانت تتسرّب خطوات navigate فارغة
                // وتُثقل المختار فيتأخر الالتقاط الحقيقي). الفحص استدعاءان
                // رقيقان لا يكسران ميزانيّة النداء.
                return CallNextHookEx(None, code, w, l);
            }
            if is_down {
                // ختم النقرة ونقطتُها يُحفظان للمختار: ‏frame_pick(seq) يبني عليه
                // قبل/بعد ويفحص المحميّ قبل قراءة بكسل (٣ب-٥)
                crate::sensors::capture::note_click(evt.seq, raw, info.pt.x, info.pt.y);
                // الحقائق على خيط MTA — إبلاغٌ بـtry_send لا يسدّ النداء أبدًا (نقطة المالك ١)
                crate::sensors::uia::notify(evt.seq, info.pt.x, info.pt.y);
            }
            offer(evt);
            // بند تدقيق ٣ب-٦: زمن نداء الضغط كاملًا (دخول ⇒ بعد offer شاملًا القفلين)
            if is_down {
                DOWN_CB_NANOS.store(cb_t0.elapsed().as_nanos() as u64, Ordering::SeqCst);
            }
        }
    }
    CallNextHookEx(None, code, w, l)
}

unsafe extern "system" fn key_proc(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
    // الضغط وحده يكفي مِضخّة الإيماءة — الإفلات ضجيج لا قيمة له في ٣ج (قرار موثَّق)
    if code >= 0 && (w.0 as u32 == WM_KEYDOWN || w.0 as u32 == WM_SYSKEYDOWN) {
        let info = &*(l.0 as *const KBDLLHOOKSTRUCT);
        let _ = info.flags & LLKHF_INJECTED; // المفتاح المحقون يمرّ كحقائق — لا تصفّية هنا
        offer(key_evt(next_seq(), qpc_ms(qpc()), info.vkCode));
    }
    CallNextHookEx(None, code, w, l)
}

// ───────────────── الجلسة: تركيب/فكّ نظيف + المراقب + المِضخّة ─────────────────

struct HookThread {
    handle: Option<JoinHandle<()>>,
    tid: u32,
}

struct Session {
    quit: Arc<std::sync::atomic::AtomicBool>,
    hook: Arc<Mutex<HookThread>>,
    watch: JoinHandle<()>,
    pump: JoinHandle<()>,
}

static ACTIVE: Mutex<Option<Session>> = Mutex::new(None);

/// يولّد خيط الخطّاف — المنقول من `spawn_hook` موسَّعًا بلوحة المفاتيح على الخيط نفسه
fn spawn_hook_thread() -> (JoinHandle<()>, u32) {
    let (ttx, trx) = mpsc::channel();
    let handle = thread::spawn(move || unsafe {
        let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0).unwrap();
        let key = SetWindowsHookExW(WH_KEYBOARD_LL, Some(key_proc), None, 0).unwrap();
        ttx.send(GetCurrentThreadId()).unwrap();
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, Some(HWND::default()), 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = UnhookWindowsHookEx(mouse);
        let _ = UnhookWindowsHookEx(key);
    });
    (handle, trx.recv().unwrap())
}

/// يبدأ التسجيل: قناة محدودة + خيط الخطّاف + المراقب + مِضخّة البثّ. جلسة قائمة ⇐ تُفكّ أوّلًا.
/// معمَّم على ‏Runtime كي يجريه سكربت القياس الحيّ (٣ب-٦) على تطبيقٍ وهميّ بنفس الشيفرة
pub fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> String {
    stop();
    let (tx, rx) = mpsc::sync_channel::<InputEvt>(CHANNEL_CAP);
    *EVENT_TX.lock().unwrap() = Some(tx);
    let quit = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let (handle, tid) = spawn_hook_thread();
    let hook = Arc::new(Mutex::new(HookThread { handle: Some(handle), tid }));
    // المِضخّة: تفرّغ القناة وتبثّ للواجهة — emit لا يجوز أن يلمس نداء الخطّاف
    let pump = thread::spawn(move || {
        for evt in rx {
            let _ = app.emit("sensor://input", &evt);
        }
    });
    // المراقب: كل ثانية — إن مات خيط الخطّاف صامتًا أثناء تسجيل نشِط يعيد تركيبه
    let watch = {
        let quit = quit.clone();
        let hook = hook.clone();
        thread::spawn(move || {
            while !quit.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_secs(1));
                if quit.load(Ordering::SeqCst) {
                    break;
                }
                let mut g = hook.lock().unwrap();
                if g.handle.as_ref().is_some_and(JoinHandle::is_finished) {
                    log::warn!("خيط الخطّاف مات صامتًا — إعادة تركيب (المراقب)");
                    let (fresh, tid) = spawn_hook_thread();
                    *g = HookThread { handle: Some(fresh), tid };
                }
            }
        })
    };
    let session_id = format!("s-{:x}", qpc());
    *ACTIVE.lock().unwrap() = Some(Session { quit, hook, watch, pump });
    session_id
}

/// يفكّ كلّ شيء نظيفًا: ‏WM_QUIT للخيط ⇒ Unhook داخل الخيط ⇒ تصفية القناة ⇒ انضمام الجميع
pub fn stop() {
    let Some(session) = ACTIVE.lock().unwrap().take() else { return };
    session.quit.store(true, Ordering::SeqCst);
    let tid = session.hook.lock().unwrap().tid;
    unsafe {
        let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    // لا مُرسلين بعد الآن: الخيط سيموت والقناة تُصفّى — فيموت المِضخّة بعد تصريف المتبقّي
    if let Some(h) = session.hook.lock().unwrap().handle.take() {
        let _ = h.join();
    }
    *EVENT_TX.lock().unwrap() = None;
    let _ = session.watch.join();
    let _ = session.pump.join();
}

/// زمن آخر نداء ضغط بالنانو ثانية — بند تدقيق ٣ب-٦ (الميزانيّة <1ms)
pub fn down_cb_nanos() -> u64 {
    DOWN_CB_NANOS.load(Ordering::SeqCst)
}

/// عدّاد إسقاط القناة — بند تدقيق ٣ب-٦ (الهدف ≈0)
pub fn dropped() -> u64 {
    DROPPED.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sensors::keyclass::KeyClass;

    #[test]
    fn التسلسل_الرتيب_يزيد_واحدا_لكل_نداء() {
        let a = next_seq();
        let b = next_seq();
        assert_eq!(b, a + 1);
    }

    #[test]
    fn رسائل_الماوس_الست_تُخريط_للعقد_وغيرها_تُرفض() {
        let down = mouse_evt(1, 5.0, WM_LBUTTONDOWN, 100, 200).unwrap();
        assert_eq!(down.kind, InputKind::Down);
        assert_eq!(down.button, Some(MouseButton::Left));
        assert_eq!(down.x, 100.0);
        assert_eq!(down.y, 200.0);
        assert_eq!(down.key_class, None);

        let up = mouse_evt(2, 6.0, WM_RBUTTONUP, 0, 0).unwrap();
        assert_eq!(up.kind, InputKind::Up);
        assert_eq!(up.button, Some(MouseButton::Right));

        assert_eq!(mouse_evt(3, 7.0, WM_MBUTTONDOWN, 1, 1).unwrap().button, Some(MouseButton::Middle));
        assert_eq!(mouse_evt(4, 8.0, WM_MBUTTONUP, 1, 1).unwrap().kind, InputKind::Up);
        assert_eq!(mouse_evt(5, 9.0, WM_LBUTTONUP, 3, 4).unwrap().kind, InputKind::Up);
        assert_eq!(mouse_evt(6, 9.0, WM_RBUTTONDOWN, 3, 4).unwrap().kind, InputKind::Down);

        // حركة/عجلة/رسائل غريبة: لا حدث — المِضخّة تريد الضغطات فقط
        assert!(mouse_evt(7, 1.0, 0x200, 1, 1).is_none(), "WM_MOUSEMOVE");
        assert!(mouse_evt(8, 1.0, 0x20A, 1, 1).is_none(), "WM_MOUSEWHEEL");
        assert!(mouse_evt(9, 1.0, 0x0FF, 1, 1).is_none());
    }

    #[test]
    fn مفتاح_لوحة_المفاتيح_صنف_بلا_حرف_وبلا_إحداثيات() {
        let k = key_evt(10, 2.0, 0x41); // 'A' — يُبثّ صنفه لا حرفه
        assert_eq!(k.kind, InputKind::Key);
        assert_eq!(k.key_class, Some(KeyClass::Char));
        assert_eq!(k.x, 0.0);
        assert_eq!(k.y, 0.0);
        assert_eq!(k.button, None);
        assert_eq!(key_evt(11, 2.0, 0x0D).key_class, Some(KeyClass::Enter));
        assert_eq!(key_evt(12, 2.0, 0xFF).key_class, Some(KeyClass::Other));
    }
}

/// حياة الخطّاف: تركيب ثم WM_QUIT فكٌّ نظيف بلا تعليق ولا تسريب.
/// يتطلّب سطح مكتب تفاعليًّا (خطّافات LL عالميّة) — يُشغَّل يدويًّا مرة هنا، والبرهان
/// الكامل على جهاز المالك في ٣ب-٦.
#[test]
#[ignore]
fn الخطاف_يتركب_ويفك_نظيفا() {
    let (handle, tid) = spawn_hook_thread();
    unsafe {
        let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    handle.join().expect("خيط الخطّاف يخرج نظيفًا"); // UnhookWindowsHookEx استُدعيت في الخروج
}
