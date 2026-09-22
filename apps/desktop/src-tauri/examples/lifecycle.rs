//! تشخيص ٣ب-٥: دورة حياة المنتج الحقيقيّة خارج عدّاء الاختبار —
//! نوافذ رسائل (إحداها محميّة WDA) + تسجيل → إيقاف → تسجيل → إيقاف في عملية
//! واحدة. إن انهارت هنا فالعلّة في تفكيك جلسة WGC؛ وإن سلمت فالمشتبه عدّاء
//! cargo-test وحده.

use std::sync::mpsc;
use std::time::Duration;

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostThreadMessageW,
    RegisterClassW, SetWindowDisplayAffinity, TranslateMessage, MSG, WDA_EXCLUDEFROMCAPTURE,
    WNDCLASSW, WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE, WM_QUIT,
};

extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    unsafe { DefWindowProcW(h, m, w, l) }
}

fn spawn_test_window(title: &'static str, protect: bool, x: i32) -> u32 {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || unsafe {
        let hinst = GetModuleHandleW(None).unwrap();
        let cls = HSTRING::from(format!("itqan-lifecycle-{title}"));
        let wc = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: hinst.into(),
            lpszClassName: PCWSTR(cls.as_ptr()),
            hbrBackground: HBRUSH(GetStockObject(WHITE_BRUSH).0),
            ..Default::default()
        };
        let _ = RegisterClassW(&wc);
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST, PCWSTR(cls.as_ptr()), &HSTRING::from(title),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE, x, 200, 320, 200,
            None, None, Some(hinst.into()), None,
        )
        .expect("نافذة");
        if protect {
            SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE).expect("حماية");
        }
        tx.send(GetCurrentThreadId()).unwrap();
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
    rx.recv().unwrap()
}

fn main() {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let t1 = spawn_test_window("ctl", false, 60);
    let t2 = spawn_test_window("prot", true, 430);
    std::thread::sleep(Duration::from_millis(700));
    for i in 1..=2 {
        app_lib::sensors::capture::start();
        std::thread::sleep(Duration::from_millis(1200));
        app_lib::sensors::capture::stop();
        println!("جلسة {i}: بدأت وفُكّت بنجاح (نوافذ حيّة، إحداها محميّة)");
    }
    unsafe {
        let _ = PostThreadMessageW(t1, WM_QUIT, WPARAM(0), LPARAM(0));
        let _ = PostThreadMessageW(t2, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    std::thread::sleep(Duration::from_millis(300));
    println!("lifecycle: سليم — دورتا تسجيل كاملتان مع نوافذ محميّة بلا انهيار");
}

