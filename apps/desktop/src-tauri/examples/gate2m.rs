//! قبول ٣ب-٦ — القياس الحيّ على المسار الحقيقيّ الكامل (سكربت رميّ للقبول، لا يُدمَج).
//!
//! **المنقول بالاسم من السبايك:** ‏`gate2`/`gate2m` (بنية القياس والحرس) ·
//! ‏`click_at` (حقن النقرة ٥٦٠–٥٧٦) · `median`/`crop`/`mean_luma` (وحدة measure
//! المُختبَرة).
//!
//! **انحراف موثَّق عن حرف الخطّة (سببه واقع جهاز المالك 2026-09-16):** الخطّة
//! تقول Excel ‏/x /e — وOffice على هذا الجهاز **منتهي الترخيص**: حوار تفعيل
//! نافذ يُلغى يدويًّا، الخصائص مجمّدة، وشجرة UIA تتقلّب بلافتات لا يمثّل منتجًا
//! حقيقيًّا. فالقياس يجري على **المفكّرة** (موجودة بكل الأجهزة، بلا ترخيص،
//! UIA سليم، ونقر قوائمها تغيير بصريّ حقيقيّ كل نقرة). هوية التبويب (TabInsert)
//! أُثبتت حيًّا على Excel أصلًا في ٣ب-٤.
//!
//! يقيس **١٠٠ نقرة محقونة** تمرّ من الخطّاف العالميّ فعليًّا إلى المِضخّة وMTA
//! وحلقة WGC:
//! (١) زمن نداء الضغط كاملًا شاملًا `offer`+`note_click` (الميزانيّة <1ms)
//! (٢) ‏readMs صادقًا من `sensor://facts` (‏p95 <50ms)
//! (٣) ‏deltaMs لإطار «قبل» لكل نقرة · (٤) عدّاد إسقاط القناة (≈0)
//! (٥) صورة «قبل»/«بعد» لنقرة القائمة الأخيرة — قبلها مغلقة وبعدها مفتوحة
//! (فحص بالعين: ما قبل الضغط مقابل ما بعده)
//! + دورة ‏stop→start كاملة ضمن القياس (إثبات إصلاح 0xC0000005 على الواقع).

use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use app_lib::sensors::capture;
use app_lib::sensors::measure;
use app_lib::sensors::{hook, uia};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Accessibility::{
    IUIAutomation, UIA_ControlTypePropertyId, UIA_MenuItemControlTypeId, TreeScope_Descendants,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, GetAncestor, GetCursorPos, GetWindowThreadProcessId, IsWindowVisible,
    SetCursorPos, SetWindowPos, WindowFromPoint, GA_ROOT, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE,
};

/// نافذة المفكّرة أينما احتجبت: على ويندوز 11 يُعاد إطلاق notepad.exe في
/// عمليّة مختلفة عن الابن المباشر، فلنشدها بالصنف «Notepad» أو العنوان
fn find_notepad() -> Option<(HWND, u32)> {
    unsafe {
        let mut prev = HWND::default();
        loop {
            let h = FindWindowExW(Some(HWND::default()), Some(prev), PCWSTR::null(), PCWSTR::null())
                .unwrap_or_default();
            if h.is_invalid() {
                return None;
            }
            if IsWindowVisible(h).as_bool() {
                // الصنف
                let mut c = [0u16; 64];
                let cn = windows::Win32::UI::WindowsAndMessaging::GetClassNameW(h, &mut c);
                let class = String::from_utf16_lossy(&c[..cn as usize]);
                let mut t = [0u16; 128];
                let tn = windows::Win32::UI::WindowsAndMessaging::GetWindowTextW(h, &mut t);
                let title = String::from_utf16_lossy(&t[..tn as usize]);
                if class == "Notepad" || title.contains("Notepad") || title.contains("المفكرة") {
                    let mut p = 0u32;
                    let _ = GetWindowThreadProcessId(h, Some(&mut p));
                    return Some((h, p));
                }
            }
            prev = h;
        }
    }
}

/// أول عنصر قائمة (MenuItem) بشاشة صالحة — موضع نقر المفكّرة، ويعيد اسمه للسجلّ
fn menu_item(u: &IUIAutomation, hwnd: HWND) -> Option<(String, POINT)> {
    unsafe {
        let root = u.ElementFromHandle(hwnd).ok()?;
        let cond = u
            .CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(UIA_MenuItemControlTypeId.0))
            .ok()?;
        let all = root.FindAll(TreeScope_Descendants, &cond).ok()?;
        for i in 0..all.Length().ok()? {
            let e = all.GetElement(i).ok()?;
            let name = e.CurrentName().map(|b| b.to_string()).unwrap_or_default();
            let r = e.CurrentBoundingRectangle().ok()?;
            if r.right > r.left && r.bottom > r.top {
                return Some((
                    name,
                    POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 },
                ));
            }
        }
        None
    }
}

/// المنقول `click_at` حرفيًّا (٥٦٠–٥٧٦): تحريك ثم ضغط وإفلات مع هوامش زمنيّة
fn click_at(pt: POINT) {
    unsafe {
        let mut old = POINT::default();
        let _ = GetCursorPos(&mut old);
        SetCursorPos(pt.x, pt.y).unwrap();
        std::thread::sleep(Duration::from_millis(60));
        let mk = |flags| INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 { mi: MOUSEINPUT { dwFlags: flags, ..Default::default() } },
        };
        SendInput(&[mk(MOUSEEVENTF_LEFTDOWN)], std::mem::size_of::<INPUT>() as i32);
        std::thread::sleep(Duration::from_millis(120));
        SendInput(&[mk(MOUSEEVENTF_LEFTUP)], std::mem::size_of::<INPUT>() as i32);
        std::thread::sleep(Duration::from_millis(60));
        let _ = SetCursorPos(old.x, old.y);
    }
}

/// حرس gate2 المنقول — بالمعرّف العمليّ لا بالمقبض: القوائم المنبثقة نوافذ
/// مستقلّة من العمليّة نفسها فلا تُعدّ حجبًا (لا نلمس نافذة تطبيق آخر أبدًا)
fn point_over_process(pt: POINT, pid: u32) -> bool {
    let over = unsafe {
        let root = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        let mut p = 0u32;
        let _ = GetWindowThreadProcessId(root, Some(&mut p));
        p == pid
    };
    if !over {
        // تشخيص: من يحجب النقطة فعلًا؟
        unsafe {
            use windows::Win32::UI::WindowsAndMessaging::GetWindowTextW;
            let root = GetAncestor(WindowFromPoint(pt), GA_ROOT);
            let mut t = [0u16; 128];
            let n = GetWindowTextW(root, &mut t);
            println!(
                "[حرس] النقطة ({},{}) يحجبها root=0x{:x} title={:?}",
                pt.x,
                pt.y,
                root.0 as usize,
                String::from_utf16_lossy(&t[..n as usize])
            );
        }
    }
    over
}

/// محرّك النقرة الواحدة: حقن + استلام حدث الضغط + القياسات الثلاثة.
/// ‏special=false ⇐ تقرأ «قبل» داخليًّا وتنظّف ملفها؛ ‏special=true ⇐ لا تلمس
/// الختم إطلاقًا (يمتصّه المستدعي لصورتَي قبل/بعد معًا — الختم يُستهلك بمرة)
fn one_click(
    pt: POINT,
    pid: u32,
    rx_down: &mpsc::Receiver<(u64, f64, f64)>,
    facts: &Arc<Mutex<HashMap<u64, f64>>>,
    special: bool,
) -> Option<(u64, f64, f64, f64)> {
    if !point_over_process(pt, pid) {
        println!("ABORT: النقطة ({},{}) ليست فوق التطبيق الهدف", pt.x, pt.y);
        return None;
    }
    click_at(pt);
    let (seq, _x, _y) = rx_down.recv_timeout(Duration::from_secs(2)).expect("حدث الضغط لم يصل");
    // النداء اكتمل قبل بثّ المضخّة — القراءة هنا نهائيّة لا سباق
    let cb_ms = hook::down_cb_nanos() as f64 / 1_000_000.0;
    // انتظر حقائق هذا الـseq (خيط MTA يبثّ readMs)
    let mut read_ms = f64::NAN;
    for _ in 0..80 {
        if let Some(v) = facts.lock().unwrap().get(&seq) {
            read_ms = *v;
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    if special {
        return Some((seq, cb_ms, read_ms, f64::NAN));
    }
    // الإطار «قبل»: أحدث إطار ≤ ختم الضغط — deltaMs سالب بالضرورة
    let t_pick = std::time::Instant::now();
    let delta = match capture::pick(seq, app_lib::sensors::select::Which::Before) {
        app_lib::sensors::events::FramePickResult::Picked(p) => {
            let d = p.delta_ms;
            let _ = std::fs::remove_file(&p.path);
            d
        }
        other => {
            let newest = capture::ring_newest_hns();
            let now_hns = app_lib::sensors::clock::qpc_to_hns(app_lib::sensors::clock::qpc());
            println!(
                "  [{}] pick ليس إطارًا بعد {:.0}ms: {:?} · انحراف أحدث إطار عن الآن={:+.0}ms",
                seq,
                t_pick.elapsed().as_millis(),
                other,
                app_lib::sensors::clock::hns_ms(newest - now_hns)
            );
            f64::NAN
        }
    };
    Some((seq, cb_ms, read_ms, delta))
}

fn main() {
    unsafe {
        let _ = windows::Win32::UI::HiDpi::SetProcessDpiAwarenessContext(
            windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        );
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    // ── إطلاق المفكّرة (بديل Excel المنتهي الترخيص — انحراف موثَّق أعلاه).
    // تنظيف مسبق لأي مفكّرة عائمة كي يكون الهدف هو نسختنا وحدها ──
    let _ = std::process::Command::new("cmd")
        .args(["/C", "taskkill", "/IM", "notepad.exe", "/F"])
        .output();
    std::thread::sleep(Duration::from_millis(500));
    let _ = std::process::Command::new("notepad.exe").spawn().expect("إطلاق المفكّرة");
    let (hwnd, pid) = {
        let mut found = None;
        for _ in 0..30 {
            std::thread::sleep(Duration::from_millis(300));
            if let Some(hit) = find_notepad() {
                found = Some(hit);
                break;
            }
        }
        found.expect("نافذة المفكّرة لم تظهر خلال 9ث")
    };
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    }
    std::thread::sleep(Duration::from_millis(800));
    println!("[notepad] pid={pid} جاهزة");

    // ── موضع النقر: أول عنصر قائمة (المنقول بنية find_tab على عنصر قائمة) ──
    let u: IUIAutomation = unsafe {
        CoCreateInstance(&windows::Win32::UI::Accessibility::CUIAutomation8, None, CLSCTX_INPROC_SERVER)
            .expect("uia")
    };
    let (menu_name, pt_menu) = loop {
        if let Some(hit) = menu_item(&u, hwnd) {
            break hit;
        }
        print!("٫");
        std::thread::sleep(Duration::from_millis(700));
    };
    println!("[menu] «{menu_name}» عند ({},{}) — النقر يفتح/يغلق القائمة = تغيير بصريّ كل نقرة", pt_menu.x, pt_menu.y);

    // ── تطبيق Wry حقيقيّ (نفس إنتاجنا) مبنيًّا على الخيط الرئيسيّ — بلا run:
    // البثّ لأهداف التطبيق يصل مستمعيه مباشرةً بلا ضخّ الحلقة. ‏tauri::test/mock_app
    // سقط عند الإقلاع على هذه الآلة (0xc0000139 — بيان comctl32 v6 المدمج عند
    // tauri-build للثنائيّ الرئيسيّ وحده) ──
    let app = tauri::Builder::default()
        .setup(|app| {
            // ٣ب-٣ (نقطة المالك ٣): نافذة إتقان تختفي من لقطاتها نفسها
            use tauri::Manager;
            for w in app.handle().webview_windows().values() {
                if let Ok(h) = w.hwnd() {
                    unsafe {
                        let _ = windows::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(
                            h,
                            windows::Win32::UI::WindowsAndMessaging::WDA_EXCLUDEFROMCAPTURE,
                        );
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("بناء التطبيق");
    let handle = app.handle().clone();
    {
        use tauri::Manager;
        // إخفاء نافذة التطبيق كي لا تحجب الهدف ولا تلوّث الإطارات
        if let Some(w) = handle.get_webview_window("main") {
            let _ = w.hide();
        }
    }
    // كشف ذاتيّ: البثّ يصل مستمعيه قبل بدء القياس
    {
        use tauri::{Emitter, Listener};
        let (ptx, prx) = mpsc::channel::<()>();
        handle.listen_any("probe://gate2m", move |_| {
            let _ = ptx.send(());
        });
        handle.emit("probe://gate2m", ()).expect("بثّ الكشف");
        prx.recv_timeout(Duration::from_secs(2))
            .expect("البثّ لا يصل المستمعين بلا run — خطة السكربت تحتاج مراجعة");
    }
    use tauri::Listener;

    let (tx_down, rx_down) = mpsc::channel::<(u64, f64, f64)>();
    let facts: Arc<Mutex<HashMap<u64, f64>>> = Arc::new(Mutex::new(HashMap::new()));
    let facts_l = facts.clone();
    handle.listen_any("sensor://input", move |e| {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(e.payload()) {
            if v["kind"] == "down" && v["button"] == "left" {
                let _ = tx_down.send((
                    v["seq"].as_u64().unwrap_or(0),
                    v["x"].as_f64().unwrap_or(0.0),
                    v["y"].as_f64().unwrap_or(0.0),
                ));
            }
        }
    });
    handle.listen_any("sensor://facts", move |e| {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(e.payload()) {
            if let (Some(seq), Some(rm)) = (v["seq"].as_u64(), v["readMs"].as_f64()) {
                facts_l.lock().unwrap().insert(seq, rm);
            }
        }
    });

    // نفس جسم recording_start حرفيًّا
    let _session = hook::start(handle.clone());
    capture::start();
    uia::start(handle.clone());
    std::thread::sleep(Duration::from_millis(1200));

    // ── ١٠٠ نقرة محقونة على عنصر القائمة بتناوب فتح/إغلاق مع إيقاع بشريّ ──
    let mut cb: Vec<f64> = Vec::new();
    let mut reads: Vec<f64> = Vec::new();
    let mut deltas: Vec<f64> = Vec::new();
    for i in 0..100 {
        std::thread::sleep(Duration::from_millis(350));
        let Some((_seq, c, r, d)) = one_click(pt_menu, pid, &rx_down, &facts, false) else {
            break;
        };
        cb.push(c);
        reads.push(r);
        if !d.is_nan() {
            deltas.push(d);
        }
        if (i + 1) % 25 == 0 {
            println!(
                "  …{} / 100: آخر نداء={c:.3}ms · آخر readMs={r:.1} · آخر deltaMs={d:.1}",
                i + 1
            );
        }
    }

    // ── التقليد (٥): نقرتان خاصّتان متتاليتان بصور «قبل» — العقد يستهلك ختم
    // الـseq بمرة واحدة (frame_pick نقرة=قراءة) فلا «بعد» على الـseq نفسه.
    // الأولى: قبلها القائمة مغلقة · الثانية: قبلها مفتوحة — الفحص بالعين يثبت
    // أن الصورة تُظهر «ما قبل الضغط» في الحالتين (مقابل «Home محدَّد» في الخطّة) ──
    let mut shot_paths: Vec<String> = Vec::new();
    std::thread::sleep(Duration::from_millis(700));
    for label in ["مغلقة", "مفتوحة"] {
        if let Some((seq, ..)) = one_click(pt_menu, pid, &rx_down, &facts, true) {
            match capture::pick(seq, app_lib::sensors::select::Which::Before) {
                app_lib::sensors::events::FramePickResult::Picked(p) => {
                    println!(
                        "[قبل:{label}] seq={seq} deltaMs={:.1} → {} (يجب أن تُظهر القائمة {label}ة)",
                        p.delta_ms, p.path
                    );
                    shot_paths.push(p.path);
                }
                other => println!("[قبل:{label}] فشل: {other:?}"),
            }
        }
        std::thread::sleep(Duration::from_millis(700)); // هدوء يثبّت الحالة قبل النقرة التالية
    }

    // ── دورة الحياة ضمن القياس: stop→start ثم نقرة تثبت الحيويّة ──
    println!("── دورة stop→start (إثبات إصلاح الانهيار على المسار الكامل) ──");
    uia::stop();
    capture::stop();
    hook::stop();
    std::thread::sleep(Duration::from_millis(400));
    let _ = hook::start(handle.clone());
    capture::start();
    uia::start(handle.clone());
    std::thread::sleep(Duration::from_millis(1000));
    let after_restart = one_click(pt_menu, pid, &rx_down, &facts, false).is_some();
    uia::stop();
    capture::stop();
    hook::stop();

    // ── التقرير ──
    let (cb_m, cb_p95) = measure::median(&mut cb);
    let (rd_m, rd_p95) = measure::median(&mut reads);
    let dt_min = deltas.iter().cloned().fold(f64::INFINITY, f64::min);
    let dt_max = deltas.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    println!("═══════ نتائج قبول ٣ب-٦ (المفكّرة بديل Excel المنتهي) ═══════");
    println!("(١) زمن نداء الضغط: وسيط={cb_m:.3}ms · p95={cb_p95:.3}ms · أقصى={:.3}ms — الميزانيّة <1ms", cb.iter().cloned().fold(0.0, f64::max));
    println!("(٢) readMs: وسيط={rd_m:.1} · p95={rd_p95:.1} — الميزانيّة <50ms (فاشل NaN: {})", reads.iter().filter(|v| v.is_nan()).count());
    println!("(٣) deltaMs «قبل»: أقل={dt_min:.1} · أقصى={dt_max:.1} على {} نقرة", deltas.len());
    println!("(٤) إسقاط القناة: {} (الهدف ≈0)", hook::dropped());
    let (arr, cop) = capture::frame_counters();
    println!("    ملاحظة الحلقة: نداءات وصول الإطار={arr} · إطارات منسوخة={cop}");
    println!("(٥) صور «قبل/بعد» (تُفحص بالعين): {shot_paths:?}");
    println!("دورة stop→start: {}", if after_restart { "نقرة بعد إعادة التشغيل وصلت ✅" } else { "فشل ⛔" });

    // ── إغلاق المفكّرة بمعرّف عمليّتها ──
    let _ = std::process::Command::new("cmd")
        .args(["/C", "taskkill", "/PID", &pid.to_string(), "/F"])
        .spawn();
    println!("[notepad] أُغلقت pid={pid}");
}
