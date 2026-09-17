//! التقاط WGC لـ**الشاشة كاملة** + حلقة GPU ثمانيّة + `frame_pick` (٣ب-٣).
//!
//! **الأساس المنقول:** ‏`d3d`/`readback` (تقنيّة الخامة الـstaging) من سطور ٨٠–١٤٧،
//! وحلقة GPU من مسار `gate2m` سطور ٧٠٥–٧٩٠، و`save_jpeg` سطر ٢٣٦، و`item_for`
//! استُبدل بـ**CreateForMonitor** كما أمرت الخطّة (لا التقاط نافذة).
//! القياس المؤسِّس: نسخ GPU ‏0.17ms + قراءة المختار وحده ‏~34ms + ‏MinUpdateInterval ‏66ms.
//!
//! **قرار موثَّق:** الهدف هو الشاشة الأساسيّة وحدها في ٣ب-٣؛ تعدّد الشاشات يُحسَم في
//! ٣ج/٣و حين يُعرف موضع النقرة النهائي.

use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use windows::core::{factory, Interface, IInspectable, Result as WResult};
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Graphics::Capture::{Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, POINT};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING, D3D11CreateDevice,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_R16G16B16A16_FLOAT;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, HMONITOR, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

use crate::sensors::clock::{hns_ms, qpc_to_hns};
use crate::sensors::events::FrameMonitor;
use crate::sensors::select::{pick_frame, RING_CAP, Which};

/// عمق الحلقة — ٨ خامات (~٥٠٠ms من الزمن) كما قيس في البوّابة ٢م
const RING_DEPTH: usize = RING_CAP;
/// مهلة انتظار ردّ الحلقة على الالتقاط — بعدها «لا-إطار» بصدق
const PICK_TIMEOUT: Duration = Duration::from_secs(2);
/// انتظار «بعد» قبل السقوط لآخر «قبل» — ‏WGC لا يوصل إطارًا ما لم تتغيّر
/// الشاشة، والمؤشّر مستثنى من الالتقاط، فنقرة الحقل الصامتة قد لا تولّد
/// إطارًا بعدها أبدًا؛ الانتظارُ الكامل كان يردّ «no_frame» كاذبًا بعد
/// ثانيتين ويوقف سلسلة البناء كلّ مرّة (بلاغ المالك ٣و: «تعذّر الالتقاط»
/// المتكرّر). ‏350ms تكفي أيّ تغيّر حقيقيّ (خمس فواصل وصولٍ عند 66ms)،
/// وبعدها «بعد» الساكن = آخر إطار قبلها بصريًّا حرفيًّا.
const AFTER_FALLBACK_WAIT: Duration = Duration::from_millis(350);

// ───────────────── وحدات نقيّة — ألوان HDR ومسار الملفّ (TDD) ─────────────────

/// فكّ نصف دقّة IEEE 754 ‏(FP16) — الأزمنة الرماديّة لا تكفي هنا، هذا رياضيات بكسل مدقَّقة
fn f16_bits_to_f32(h: u16) -> f32 {
    let sign = if h & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exp = ((h >> 10) & 0x1F) as i32;
    let man = (h & 0x03FF) as u32;
    match exp {
        0 => {
            if man == 0 {
                0.0 * sign
            } else {
                // دنيا غير مطبَّعة: ‏man/1024 × 2^-14
                sign * man as f32 * f32::powi(2.0, -24)
            }
        }
        0x1F => {
            if man == 0 {
                f32::INFINITY * sign
            } else {
                f32::NAN
            }
        }
        // مطبَّعة: ‏(1 + man/1024) × 2^(exp-15) = (man+1024) × 2^(exp-25)
        e => sign * (man as f32 + 1024.0) * f32::powi(2.0, e - 25),
    }
}

/// خطّيّ → ‏sRGB ‏8bit — كتابة القيم الخطيّة مباشرةً هي سبب «الألوان الباهتة» في HDR
fn linear_to_srgb8(x: f32) -> u8 {
    let x = x.clamp(0.0, 1.0);
    let s = if x <= 0.003_130_8 { x * 12.92 } else { 1.055 * f32::powf(x, 1.0 / 2.4) - 0.055 };
    (s * 255.0 + 0.5) as u8
}

/// صف WGC بصيغة ‏FP16 ‏(R16G16B16A16Float) → ‏BGRA8 بترميز sRGB (الألفا تُستوفى)
fn fp16_row_to_bgra8(row: &[u8], out: &mut [u8], w: usize) {
    for i in 0..w {
        let o = i * 8;
        let r = f16_bits_to_f32(u16::from_le_bytes([row[o], row[o + 1]]));
        let g = f16_bits_to_f32(u16::from_le_bytes([row[o + 2], row[o + 3]]));
        let b = f16_bits_to_f32(u16::from_le_bytes([row[o + 4], row[o + 5]]));
        out[i * 4] = linear_to_srgb8(b);
        out[i * 4 + 1] = linear_to_srgb8(g);
        out[i * 4 + 2] = linear_to_srgb8(r);
        out[i * 4 + 3] = 255;
    }
}

/// مسار JPEG المؤقّت لإطار تسلسل معيّن — ‎%TEMP%\itqan-frames\f-{seq}.jpg
fn frame_path(seq: u64) -> String {
    std::env::temp_dir()
        .join("itqan-frames")
        .join(format!("f-{seq}.jpg"))
        .display()
        .to_string()
}

/// بوّابة المحميّ — نقل حكم gate5 (سطور ٣٦٥–٣٧٨): ‏affinity ≠ 0 ⇐ محميّة.
/// لا فحص بكسل بعدها إطلاقًا — لا لقطة سوداء تُولَد أصلًا (٣ب-٥)
fn affinity_protected(aff: u32) -> bool {
    aff != 0
}

/// النافذة تحت النقطة محميّة؟ — المنقول بالاسم: ‏WindowFromPoint+GA_ROOT
/// (سطر ٤٣٧ من measure_point) ثم ‏GetWindowDisplayAffinity (سطر ٢٩٢ من window_info).
/// الجذر لأن الحماية تُضبط على النافذة العليا لا الأبناء
fn point_protected(pt: POINT) -> bool {
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{GA_ROOT, GetAncestor, GetWindowDisplayAffinity, WindowFromPoint};
        let root = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        let mut aff = 0u32;
        let _ = GetWindowDisplayAffinity(root, &mut aff);
        affinity_protected(aff)
    }
}

// ───────────────── الأنواع المشتركة ─────────────────

/// لقطة على المعالج — المنقول `CpuFrame` مع هوية الشاشة لحظتها
pub struct CpuShot {
    /// ختم WGC بوحدات 100ns منذ الإقلاع — نفس مرجع QPC بعد التحويل
    pub hns: i64,
    pub w: u32,
    pub h: u32,
    /// ‏BGRA مضغوط بلا حشو صفوف (أو ناتج تحويل FP16)
    pub bgra: Vec<u8>,
    pub monitor: MonitorInfo,
}

#[derive(Clone, Copy)]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub dpi: u32,
}

/// رسائل خيط الحلقة — شكل `RingMsg` المنقول، والقراءة للمختار وحده
enum CaptureMsg {
    Frame(Direct3D11CaptureFrame),
    Pick { t_hns: i64, which: Which, reply: mpsc::Sender<Option<CpuShot>> },
    Stop,
}

// ───────────────── الآليّة — المنقول من السبايك موسَّعًا ─────────────────

fn d3d() -> WResult<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice)> {
    let mut dev: Option<ID3D11Device> = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut dev),
            None,
            None,
        )?;
    }
    let dev = dev.unwrap();
    let ctx = unsafe { dev.GetImmediateContext()? };
    let dxgi: IDXGIDevice = dev.cast()?;
    let insp = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? };
    Ok((dev, ctx, insp.cast()?))
}

/// هوية الشاشة: مستطيل فيزيائي + dpi فعليّ — تلازم كل خامة في الحلقة
fn monitor_info(hmon: HMONITOR) -> MonitorInfo {
    let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    unsafe {
        let _ = GetMonitorInfoW(hmon, &mut mi);
    }
    let (mut dx, mut dy) = (0u32, 0u32);
    unsafe {
        let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
    }
    MonitorInfo {
        x: mi.rcMonitor.left,
        y: mi.rcMonitor.top,
        w: mi.rcMonitor.right - mi.rcMonitor.left,
        h: mi.rcMonitor.bottom - mi.rcMonitor.top,
        dpi: dx.max(dy).max(96),
    }
}

/// المنقول `save_jpeg` حرفيًّا (جودة 85، ‏BGRA)
fn save_jpeg(path: &str, s: &CpuShot) {
    let enc = jpeg_encoder::Encoder::new_file(path, 85).expect("jpeg file");
    enc.encode(&s.bgra, s.w as u16, s.h as u16, jpeg_encoder::ColorType::Bgra).expect("jpeg enc");
}

/// قراءة خانة واحدة إلى المعالج — «الإطار المختار وحده» (~34ms مقيس)؛ ‏FP16 ⇐ تحويل SDR
fn read_slot(
    dev: &ID3D11Device,
    ctx: &ID3D11DeviceContext,
    desc: &D3D11_TEXTURE2D_DESC,
    slot: &ID3D11Texture2D,
) -> (u32, u32, Vec<u8>) {
    let mut sd = *desc;
    sd.BindFlags = 0;
    sd.MiscFlags = 0;
    sd.Usage = D3D11_USAGE_STAGING;
    sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    let mut stg: Option<ID3D11Texture2D> = None;
    unsafe { dev.CreateTexture2D(&sd, None, Some(&mut stg)).expect("staging") };
    let stg = stg.unwrap();
    let (w, h) = (desc.Width, desc.Height);
    let fp16 = desc.Format == DXGI_FORMAT_R16G16B16A16_FLOAT;
    let row_bytes = if fp16 { (w * 8) as usize } else { (w * 4) as usize };
    let mut bgra = vec![0u8; (w * h * 4) as usize];
    unsafe {
        let src: ID3D11Resource = slot.cast().unwrap();
        let dst: ID3D11Resource = stg.cast().unwrap();
        ctx.CopyResource(&dst, &src);
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        ctx.Map(&dst, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).expect("map");
        let pitch = mapped.RowPitch as usize;
        let base = mapped.pData as *const u8;
        for y in 0..h as usize {
            let row = std::slice::from_raw_parts(base.add(y * pitch), row_bytes);
            let dst_row = &mut bgra[y * w as usize * 4..(y + 1) * w as usize * 4];
            if fp16 {
                fp16_row_to_bgra8(row, dst_row, w as usize);
            } else {
                dst_row.copy_from_slice(row);
            }
        }
        ctx.Unmap(&dst, 0);
    }
    (w, h, bgra)
}

/// خيط الحلقة — يملك كل كائنات D3D (لا عبور شقق): شكل `spawn_ring` بجسم `gate2m`؛
/// يعيد المقبض كي ينتظره `stop` قبل أيّ جلسة تالية.
/// **تهيئة COM صريحة متوازنة** (درس 0xc0000005 الموثَّق ٣ب-٥): نداءات WinRT بلا
/// CoInitializeEx تُنشئ شقّة ضمنيّة يفكّها مُدمِّر TLS عند موت الخيط **بعد** سقوط
/// المراجع — والإصلاح: شقّة MTA معلنة تُفكّ يدويًّا آخر الخيط بعد موت كل الكائنات
fn spawn_ring_thread(rx: mpsc::Receiver<CaptureMsg>, tx: mpsc::Sender<CaptureMsg>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
        }
        {
            ring_body(rx, tx);
            // كل كائنات الجلسة (pool/session/item/slots/dev/ctx) ماتت فوق بخروج الكتلة
        }
        unsafe {
            windows::Win32::System::Com::CoUninitialize();
        }
    })
}

fn ring_body(rx: mpsc::Receiver<CaptureMsg>, tx: mpsc::Sender<CaptureMsg>) {
    let (dev, ctx, wrt) = d3d().expect("d3d");
        let interop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().expect("interop");
        let mon = unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) };
        let mon_info = monitor_info(mon);
        let item: GraphicsCaptureItem =
            unsafe { interop.CreateForMonitor(mon) }.expect("monitor item");
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &wrt,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            item.Size().unwrap(),
        )
        .expect("pool");
        let session = pool.CreateCaptureSession(&item).expect("session");
        let _ = session.SetIsBorderRequired(false);
        let _ = session.SetIsCursorCaptureEnabled(false);
        // ‏66ms كما قيس — هذا إيقاع وصول الإطارات نفسه لا أمر جماليّ
        let _ = session.SetMinUpdateInterval(TimeSpan { Duration: 666_666 });
        let tx_handler = tx.clone();
        // المقبض يُحتفظ به محليًّا — إلغاء تسجيله قبل إغلاق المسبت (تشخيص 0xc0000005)
        let frame_handler = TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(
            move |p, _| {
                // حارس التفكيك: أثناء الإيقاف لا يُلمس المسبت إطلاقًا من النداء
                if RING_STOPPING.load(std::sync::atomic::Ordering::SeqCst) {
                    return Ok(());
                }
                if let Some(p) = p.as_ref() {
                    if let Ok(f) = p.TryGetNextFrame() {
                        let _ = tx_handler.send(CaptureMsg::Frame(f));
                    }
                }
                Ok(())
            },
        );
        let frame_token = pool.FrameArrived(&frame_handler).expect("handler");
        session.StartCapture().expect("start");
        // حلقة GPU: ٨ خامات ثابتة، النسخ داخل الذاكرة الرسوميّة فقط (0.17ms مقيس)
        let mut slots: Vec<ID3D11Texture2D> = Vec::new();
        let mut stamps: Vec<i64> = Vec::new();
        let mut head = 0usize;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        // انتظار «بعد» السبايك: طلب إطار لم يصل بعد ⇒ يُجاب بإطار الواصل التالي (نمط waiting_after)
        let mut waiting: Option<(mpsc::Sender<Option<CpuShot>>, i64)> = None;
        while let Ok(m) = rx.recv() {
            match m {
                CaptureMsg::Frame(f) => {
                    FRAME_ARRIVALS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let access: IDirect3DDxgiInterfaceAccess = f.Surface().unwrap().cast().unwrap();
                    let tex: ID3D11Texture2D = unsafe { access.GetInterface().unwrap() };
                    if slots.is_empty() {
                        unsafe { tex.GetDesc(&mut desc) };
                        let mut d = desc;
                        d.BindFlags = 0;
                        d.MiscFlags = 0;
                        d.CPUAccessFlags = 0;
                        for _ in 0..RING_DEPTH {
                            let mut t: Option<ID3D11Texture2D> = None;
                            unsafe { dev.CreateTexture2D(&d, None, Some(&mut t)).expect("ring tex") };
                            slots.push(t.unwrap());
                            stamps.push(i64::MIN);
                        }
                    }
                    unsafe {
                        let src: ID3D11Resource = tex.cast().unwrap();
                        let dst: ID3D11Resource = slots[head].cast().unwrap();
                        ctx.CopyResource(&dst, &src);
                    }
                    stamps[head] = f.SystemRelativeTime().unwrap().Duration;
                    head = (head + 1) % RING_DEPTH;
                    FRAMES_COPIED.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    NEWEST_STAMP.store(stamps[(head + RING_DEPTH - 1) % RING_DEPTH], std::sync::atomic::Ordering::Relaxed);
                    // وصل الإطار الذي ينتظره طلب «بعد» معلّق ⇐ اقرأه فورًا وأجب
                    if let Some((reply, t)) = waiting.take() {
                        let newest = (head + RING_DEPTH - 1) % RING_DEPTH;
                        if stamps[newest] != i64::MIN && stamps[newest] > t {
                            let (w, h, bgra) = read_slot(&dev, &ctx, &desc, &slots[newest]);
                            let _ = reply.send(Some(CpuShot { hns: stamps[newest], w, h, bgra, monitor: mon_info }));
                        }
                        // إن كان أقدم (لا يحدث — الأختام رتيبة) فالطلب سقط بلا ردّ كحارس زمن في pick
                    }
                }
                CaptureMsg::Pick { t_hns, which, reply } => {
                    // **الحلقة قبل التمهيد** (بلاغ المالك 2026-09-17): مصفوفتا الحلقة
                    // لا تُمهَّدان إلا في معالج Frame الأول، وأي Pick قبل ذلك كان يفهرس
                    // stamps[i] على شريحة طولها صفر فيهلِك خيط الالتقاط كله بموته
                    // («index out of bounds: len is 0») فلا لقطة ما بعدها أبدًا.
                    // العقد نفسه دون تهيئة: before ⇐ None (no_frame صادق)، وafter ⇐
                    // ينتظر الواصل الأول (نمط waiting_after العاديّ).
                    if stamps.is_empty() {
                        if which == Which::After {
                            waiting = Some((reply, t_hns));
                        } else {
                            let _ = reply.send(None);
                        }
                        continue;
                    }
                    // الخانات الصالحة فقط — فراغ الحلقة (MIN) لا يجوز أن يُختار
                    let valid: Vec<usize> = (0..RING_DEPTH).filter(|&i| stamps[i] != i64::MIN).collect();
                    let view: Vec<i64> = valid.iter().map(|&i| stamps[i]).collect();
                    let Some(slot) = pick_frame(&view, t_hns, which).map(|k| valid[k]) else {
                        if which == Which::After {
                            // لا إطار بعد النقرة بعد (ضغط حديث أو سطح ساكن) ⇐ انتظر الواصل التالي
                            waiting = Some((reply, t_hns));
                        } else {
                            let _ = reply.send(None);
                        }
                        continue;
                    };
                    let (w, h, bgra) = read_slot(&dev, &ctx, &desc, &slots[slot]);
                    let _ = reply.send(Some(CpuShot { hns: stamps[slot], w, h, bgra, monitor: mon_info }));
                }
                CaptureMsg::Stop => break,
            }
        }
        // ─── التفكيك الآمن (درس 0xc0000005 الموثَّق): الحارس ثم الإغلاق ثم تصريف
        // النداء القائم في الطيران قبل إسقاط المسبت وجلسته ───
        RING_STOPPING.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = session.Close();
        let _ = pool.RemoveFrameArrived(frame_token);
        std::thread::sleep(Duration::from_millis(150));
        let _ = pool.Close();
        // **حفظ المرجع** (شهادة وفاة WER 2026-09-17: ‏GraphicsCapture.dll_unloaded
        // ⇐ ‏c0000005): إفلات آخر مرجعٍ لعنصر الالتقاط هنا يُحمِّل ‏DLL الالتقاط من
        // الذاكرة بينما مفكّاته المتأخّرة (نداءات threadpool/إفلاتات ‏COM متأخرة)
        // قد تستدعيه بعد موته فينهار التطبيق كله. إبقاء مرجع العنصر حيًّا (تسريب
        // صغير مقصود بمقدار الجلسة، يُحرَّر بنهاية العملية) يُبقي المكتبة محمَّلة
        // فتستحيل نافذة الموت هذه
        std::mem::forget(item);
}

// ───────────────── الجلسة العامة ─────────────────

static CAPTURE_TX: Mutex<Option<mpsc::Sender<CaptureMsg>>> = Mutex::new(None);
/// مقبض خيط الحلقة — ‏stop ينتظره كي لا تتسابق عملية إغلاق الجلسة مع الجلسة التالية
static CAPTURE_JOIN: Mutex<Option<std::thread::JoinHandle<()>>> = Mutex::new(None);
/// حارس التفكيك: ‏true ⇐ نداء ‏FrameArrived يبتعد فورًا بلا ‏TryGetNextFrame —
/// نداء قائم في الطيران أثناء إغلاق المسبت هو سباق الانهيار ‏0xc0000005 (٣ب-٥)
static RING_STOPPING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// ملاحظة حيّة: كم مرة اشتعل نداء وصول الإطار، وكم إطارًا نسخت فعلًا إلى الحلقة.
/// الفرق بينهما = إطارات رفضها ‏TryGetNextFrame (تشخيص جفاف الحلقة في ٣ب-٦)
pub static FRAME_ARRIVALS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub static FRAMES_COPIED: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// ختم أحدث إطار في الحلقة (وحدات 100ns) — لتشخيص جفاف/انحراف الاختيار حيًّا
static NEWEST_STAMP: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

/// عدّادات الملاحظة الحيّة — (الواردات، المنسوخة)
pub fn frame_counters() -> (u64, u64) {
    use std::sync::atomic::Ordering::Relaxed;
    (FRAME_ARRIVALS.load(Relaxed), FRAMES_COPIED.load(Relaxed))
}

/// ختم أحدث إطار منسوخ (100ns منذ الإقلاع) — 0 ⇒ لا إطارات بعد
pub fn ring_newest_hns() -> i64 {
    NEWEST_STAMP.load(std::sync::atomic::Ordering::Relaxed)
}
/// ختم QPC الخام ونقطة كل نقرة — مفتاح `frame_pick(seq, …)` (§٣.٣ لا يمرّر ختمًا).
/// النقطة (بكسل فيزيائي من الخطّاف) لازمة لفحص المحميّ قبل أيّ قراءة بكسل (٣ب-٥)
static CLICK_STAMPS: LazyLock<Mutex<HashMap<u64, (i64, i32, i32)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// يسجّل ختم النقرة ونقطتَها — يستدعيه الخطّاف عند كل ضغط ماوس (٣ب-٢)
pub fn note_click(seq: u64, qpc_raw: i64, x: i32, y: i32) {
    CLICK_STAMPS.lock().unwrap().insert(seq, (qpc_raw, x, y));
}

/// يبدأ حلقة الالتقاط (جلسة قائمة ⇐ تُفكّ أوّلًا)
pub fn start() {
    stop();
    RING_STOPPING.store(false, std::sync::atomic::Ordering::SeqCst);
    let (tx, rx) = mpsc::channel::<CaptureMsg>();
    let handle = spawn_ring_thread(rx, tx.clone());
    *CAPTURE_TX.lock().unwrap() = Some(tx);
    *CAPTURE_JOIN.lock().unwrap() = Some(handle);
}

/// يفكّ الحلقة نظيفًا: الحارس يُسكت النداء ثم ‏Stop ⇒ إغلاق داخل الخيط وتصريف
/// النداء القائم، **وينتظر انتهاءه** — سباق تدمير جلسة ‏WinRT مع ولادة جلسة
/// تالية (تسجيل → إيقاف → تسجيل) هو انهيار ‏0xc0000005 مُثبت حيًّا (٣ب-٥)
pub fn stop() {
    let handle = {
        let mut tx_slot = CAPTURE_TX.lock().unwrap();
        if tx_slot.is_none() {
            return;
        }
        RING_STOPPING.store(true, std::sync::atomic::Ordering::SeqCst);
        if let Some(tx) = tx_slot.take() {
            let _ = tx.send(CaptureMsg::Stop);
        }
        CAPTURE_JOIN.lock().unwrap().take()
    };
    if let Some(h) = handle {
        let _ = h.join();
    }
}

/// `frame_pick(seq, which)` — يقرأ **الإطار المختار وحده** ويحفظه JPEG مؤقّتًا
pub fn pick(seq: u64, which: Which) -> crate::sensors::events::FramePickResult {
    use crate::sensors::events::{FramePickResult, FramePicked, MissingReason};
    let Some(tx) = CAPTURE_TX.lock().unwrap().clone() else {
        return FramePickResult::Missing { missing: MissingReason::NoFrame };
    };
    let Some((raw, x, y)) = CLICK_STAMPS.lock().unwrap().remove(&seq) else {
        return FramePickResult::Missing { missing: MissingReason::NoFrame };
    };
    let t_hns = qpc_to_hns(raw);
    // ‏٣ب-٥: النافذة تحت النقرة محميّة ⇐ missing:'protected' — الفحص **قبل** أيّ
    // طلب قراءة بكسل فلا تُولَد لقطة سوداء ولا ملف أصلًا
    if point_protected(POINT { x, y }) {
        return FramePickResult::Missing { missing: MissingReason::Protected };
    }
    let (rtx, rrx) = mpsc::channel();
    if tx.send(CaptureMsg::Pick { t_hns, which, reply: rtx }).is_err() {
        return FramePickResult::Missing { missing: MissingReason::NoFrame };
    }
    // «بعد» بانتظار أقصر ثم سقوطٌ لآخر «قبل» — فقدٌ زائف على سطحٍ ساكن أشدّ
    // إفسادًا من لقطةٍ أقدم قليلًا تطابقها بصريًّا، ودلتا السالبة تُصرّح به.
    // «قبل» كما هو: يجيب فورًا من الحلقة والقيمة الصادقة الوحيدة بعدها الفراغ
    let mut answered = rrx
        .recv_timeout(if which == Which::After { AFTER_FALLBACK_WAIT } else { PICK_TIMEOUT });
    if answered.is_err() && which == Which::After {
        let (btx, brx) = mpsc::channel();
        if tx.send(CaptureMsg::Pick { t_hns, which: Which::Before, reply: btx }).is_ok() {
            answered = brx.recv_timeout(PICK_TIMEOUT);
        }
    }
    match answered {
        Ok(Some(shot)) => {
            let path = frame_path(seq);
            let _ = std::fs::create_dir_all(std::path::Path::new(&path).parent().unwrap());
            save_jpeg(&path, &shot);
            FramePickResult::Picked(FramePicked {
                local_id: format!("f-{seq}"),
                path,
                qpc_ms: hns_ms(shot.hns),
                // «قبل» ⇐ سالب بالضرورة: ختم الإطار أقدم من ختم النقرة
                delta_ms: hns_ms(shot.hns - t_hns),
                monitor: FrameMonitor {
                    x: shot.monitor.x as f64,
                    y: shot.monitor.y as f64,
                    w: shot.monitor.w as f64,
                    h: shot.monitor.h as f64,
                    dpi: shot.monitor.dpi as f64,
                },
            })
        }
        // مهلة أو رفض الحلقة ⇐ لا-إطار — الحالّة الصادقة المتبقّيّة الوحيدة:
        // حلقة فارغة كلها (بداية تسجيل على سطحٍ ساكن حرفيًّا)
        _ => FramePickResult::Missing { missing: MissingReason::NoFrame },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn فك_النصف_دقة_قيم_معلومة() {
        assert_eq!(f16_bits_to_f32(0x0000), 0.0);
        assert_eq!(f16_bits_to_f32(0x3C00), 1.0);
        assert_eq!(f16_bits_to_f32(0xBC00), -1.0);
        assert_eq!(f16_bits_to_f32(0x4000), 2.0);
        assert_eq!(f16_bits_to_f32(0x3800), 0.5);
        assert_eq!(f16_bits_to_f32(0x7BFF), 65504.0, "أقصى FP16");
        assert!(f16_bits_to_f32(0x7C00).is_infinite());
    }

    #[test]
    fn الترميز_الخطي_إلى_srgb_يقف_على_الطرفين_والمنتصف() {
        assert_eq!(linear_to_srgb8(0.0), 0);
        assert_eq!(linear_to_srgb8(1.0), 255);
        assert_eq!(linear_to_srgb8(0.5), 188, "نصف خطيّ = 188 بترميز sRGB لا 128 — هذا علاج الباهت");
        assert_eq!(linear_to_srgb8(2.0), 255, "قيم HDR الأعلى تُثبَّت");
        assert_eq!(linear_to_srgb8(-0.5), 0);
    }

    #[test]
    fn صف_الالتقاط_الف173_يُقلب_إلى_bgra8_بترتيب_صحيح() {
        // بكسل واحد FP16: ‏R=1.0 ‏G=0.5 ‏B=0.0 ‏A=0x3C00 (تُستوفى)
        let row: [u8; 8] = [
            0x00, 0x3C, // R=1.0
            0x00, 0x38, // G=0.5
            0x00, 0x00, // B=0.0
            0x00, 0x3C, // A (لا يُنقل — تُستوفى 255)
        ];
        let mut out = [0u8; 4];
        fp16_row_to_bgra8(&row, &mut out, 1);
        assert_eq!(out, [0, 188, 255, 255], "BGRA: ‏B=0 ‏G=188 ‏R=255 ‏A=255");
    }

    #[test]
    fn مسار_الإطار_في_مجلد_مؤقت_لاحقته_jpg() {
        let p = frame_path(42);
        assert!(p.ends_with("f-42.jpg"), "{p}");
        assert!(p.contains("itqan-frames"), "{p}");
    }

    /// بوّابة المحميّ — نقل حكم gate5: ‏affinity ≠ 0 ⇐ محميّة (٣ب-٥)
    #[test]
    fn بوابة_العرض_المحمي_أي_قيمة_غير_صفريّة_محميّة() {
        use windows::Win32::UI::WindowsAndMessaging::WDA_EXCLUDEFROMCAPTURE;
        assert!(!affinity_protected(0), "WDA_NONE ⇐ ليست محميّة");
        assert!(affinity_protected(WDA_EXCLUDEFROMCAPTURE.0), "نافذة الاختفاء من الالتقاط ⇐ محميّة");
        assert!(affinity_protected(0x1), "WDA_MONITOR ⇐ محميّة");
        assert!(affinity_protected(0x1234), "أي قيمة مستقبليّة غير صفريّة محميّة");
    }
}

/// برهان ٣ب-٣ الحيّ: حلقة + `frame_pick` يخرج JPEG سليمًا لسطح المكتب الحقيقيّ يُفحَص
/// بالعين. مصدر التغيير **مضمون بالبنية**: نافذة فحص منقولة بالاسم من السبايك
/// (`spawn_test_window` سطور ٣١٤–٣٥٣) تُنشأ قبل «قبل» وتُغلق قبل «بعد» — فلا رهان
/// على نشاط سطح المكتب (WGC مدفوع بالتغييرات لا بإيقاع ثابت).
#[test]
#[ignore]
fn الالتقاط_الحي_يخرج_جبج_سليما() {
    use crate::sensors::clock::{qpc, qpc_freq};
    use crate::sensors::events::FramePickResult;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostThreadMessageW,
        RegisterClassW, TranslateMessage, MSG, WNDCLASSW, WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW,
        WS_VISIBLE, WM_QUIT,
    };

    extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(h, m, w, l) }
    }
    // نافذة الفحص — المنقول من spawn_test_window (سطور ٣١٤–٣٥٣) بلا حماية:
    // تعيد (المقبض، الخيط) كما في السبايك كي تُحسب نقطة النقر عليها
    fn spawn_test_window(title: &'static str, x: i32) -> (isize, u32) {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).unwrap();
            let cls = HSTRING::from(format!("itqan-selftest-{title}"));
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wndproc),
                hInstance: hinst.into(),
                lpszClassName: PCWSTR(cls.as_ptr()),
                hbrBackground: HBRUSH(GetStockObject(WHITE_BRUSH).0),
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            let hwnd = CreateWindowExW(
                WS_EX_TOPMOST,
                PCWSTR(cls.as_ptr()),
                &HSTRING::from(title),
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                x,
                200,
                320,
                200,
                None,
                None,
                Some(hinst.into()),
                None,
            )
            .expect("نافذة الفحص");
            tx.send((hwnd.0 as isize, GetCurrentThreadId())).unwrap();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        rx.recv().unwrap()
    }

    start();
    let (wh, wtid) = spawn_test_window("dirt", 60); // إنشاؤها = تغيير مضمون ⇒ إطارات
    let dirt_center = unsafe {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
        let mut r = RECT::default();
        GetWindowRect(HWND(wh as *mut _), &mut r).unwrap();
        POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
    };
    std::thread::sleep(Duration::from_millis(700));

    let seq_b = 998;
    note_click(seq_b, qpc(), dirt_center.x, dirt_center.y);
    let rb = pick(seq_b, Which::Before);

    // إغلاق نافذة الفحص = تغيير مضمون ثانٍ ⇒ إطار «بعد» لختم عمره ثانية
    let seq_a = 999;
    note_click(seq_a, qpc() - qpc_freq(), dirt_center.x, dirt_center.y);
    unsafe {
        let _ = PostThreadMessageW(wtid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    std::thread::sleep(Duration::from_millis(500));
    let ra = pick(seq_a, Which::After);
    stop();

    let FramePickResult::Picked(pb) = rb else {
        panic!("«قبل» لم يُلتقط — الحلقة لم تعمل");
    };
    assert!(pb.delta_ms <= 0.0, "«قبل» يجب أن يكون سالبًا: {}", pb.delta_ms);
    let meta = std::fs::metadata(&pb.path).expect("ملف JPEG موجود");
    assert!(meta.len() > 10_000, "JPEG أكبر من ١٠KB — ليست صورة فارغة");
    let FramePickResult::Picked(pa) = ra else {
        panic!("«بعد» لم يُلتقط — الحلقة لم تعمل");
    };
    assert!(pa.delta_ms > 0.0 && pa.delta_ms <= 1000.0, "«بعد» موجب داخل الثانية: {}", pa.delta_ms);
    println!(
        "selftest: before={:.1}ms ({}KB) · after={:+.1}ms — راجع %TEMP%/itqan-frames/f-998.jpg بالعين",
        pb.delta_ms,
        meta.len() / 1024,
        pa.delta_ms
    );
}

/// إصلاح برهان المالك (٣و — «تعذّر الالتقاط» المتكرّر): ‏WGC لا يوصل إطارًا ما
/// لم تتغيّر الشاشة، والمؤشّر مستثنى من الالتقاط — فالنقر على حقلٍ (سياسة
/// «بعد») لا يغيّر شيئًا مرئيًّا يولّد **صفر إطارات بعد النقرة**، والانتظار
/// الكامل ردّ «no_frame» كاذب بعد ثانيتين يوقف سلسلة البناء كل مرة. الصواب:
/// على السطح الساكن «بعد» النقرة = آخر إطار قبلها بصريًّا حرفيًّا ⇐ سقوطٌ
/// لآخر «قبل» بدل فقدٍ زائف. حيّ: نافذة ساكنة، نقرة، «بعد» ⇐ ‏Picked سالب
/// الدلتا بسرعة لا بمهلة الثانيتين.
#[test]
#[ignore]
fn البعد_على_السطح_الساكن_يسقط_لآخر_إطار_قبل_النقرة() {
    use crate::sensors::clock::qpc;
    use crate::sensors::events::FramePickResult;
    use std::time::Instant;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowRect,
        PostThreadMessageW, RegisterClassW, TranslateMessage, MSG, WNDCLASSW,
        WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE, WM_QUIT,
    };

    extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(h, m, w, l) }
    }
    // نافذة ساكنة بلا حماية — إنشاؤها وحدها يغيّر الشاشة (إطارات تمهيد) ثم
    // لا حراك عليها إطلاقًا: هذا هو «حقل فارغ نُقر بلا كتابة» عند المالك
    fn spawn_static_window(title: &'static str, x: i32) -> (isize, u32) {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).unwrap();
            let cls = HSTRING::from(format!("itqan-selftest-{title}"));
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
            .expect("نافذة الفحص");
            tx.send((hwnd.0 as isize, GetCurrentThreadId())).unwrap();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        rx.recv().unwrap()
    }

    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let (wh, wtid) = spawn_static_window("static-after", 60);
    start();
    // سكون مُقاس لا مفترض: تهيئة أطول ثم انتظار حلقةٍ بلا إطار جديد ≥400ms —
    // بقايا أنيميشن الإنشاء (قيست +37.9ms بعد النقرة في جولة أحمر أوّلى)
    // تُفضى كي تكون الشاشة ساكنة تحقّقًا لحظة النقرة. بمهلةٍ قصوى كي لا
    // يعلق سطحُ مكتبٍ مزدحم بالحركة الخفيّة بوّاباتَ cargo (قِياس ٤٢٢ث بلا حدّ)
    std::thread::sleep(Duration::from_millis(1200));
    let settle = std::time::Instant::now();
    loop {
        let a = ring_newest_hns();
        std::thread::sleep(Duration::from_millis(400));
        if ring_newest_hns() == a || settle.elapsed() > Duration::from_secs(8) {
            break;
        }
    }
    let center = unsafe {
        let mut r = RECT::default();
        GetWindowRect(HWND(wh as *mut _), &mut r).unwrap();
        POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
    };

    let seq = 997;
    note_click(seq, qpc(), center.x, center.y);
    let t0 = Instant::now();
    let r = pick(seq, Which::After);
    let elapsed = t0.elapsed();

    unsafe {
        let _ = PostThreadMessageW(wtid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    stop();

    // الجوهر: ليست Missing — إمّا إطار «بعد» حقيقيّ وصل أثناء الانتظار القصير
    // أو سقوطٌ لآخر «قبل» (دلتا سالبة) — وكلاهما بلا مهلة الثانيتين القديمة
    let FramePickResult::Picked(p) = r else {
        panic!("السطح الساكن: «بعد» لم يقع في فقدٍ زائف لكان Picked لا {:?}", r);
    };
    assert!(
        elapsed < Duration::from_millis(1900),
        "السقوط أسرع من مهلة الثانيتين القديمة: {:?}",
        elapsed
    );
    let meta = std::fs::metadata(&p.path).expect("ملف JPEG موجود");
    assert!(meta.len() > 10_000, "JPEG حقيقي لا فارغ: {} بايت", meta.len());
    if p.delta_ms <= 0.0 {
        println!(
            "static-after: سقط لآخر إطار قبله دلتا={:+.1}ms خلال {:?} — إصلاح «تعذّر الالتقاط» مثبت",
            p.delta_ms, elapsed
        );
    } else {
        println!(
            "static-after: وصل إطار بعد حقيقيّ دلتا={:+.1}ms خلال {:?} — الشاشة لم تكن ساكنة تمامًا",
            p.delta_ms, elapsed
        );
    }
}

/// بلاغ المالك (2026-09-17): أوّل تسجيل على سطحٍ ساكن مات بموته — «Pick» قبل
/// وصول أوّل إطار كان يفهرس حلقةً غير مُمهَّدة (‏stamps طولها 0) فيهلِك خيط
/// الالتقاط بانهيار «index out of bounds» فلا لقطة ما بعده أبدًا («لا شيء
/// يتفاعل»). الرقعة: حارس فراغ الحلقة بعقد لا-إطار نفسه. حيّ: ابدأ ثم انقر
/// **فورًا بلا أيّ انتظار تهيئة** — على سطحٍ هادئ هذا يدخل نافذة الفراغ
/// تحديدًا — ثم بعد وصول الإطارات انقر ثانية: الثانية يجب أن تكون ‏Picked
/// (الخيط حيّ)؛ القديم كان يعيدها Missing بموت القناة.
#[test]
#[ignore]
fn الالتقاط_قبل_أول_إطار_لا_يسقط_خيط_الحلقة() {
    use crate::sensors::clock::qpc;
    use crate::sensors::events::FramePickResult;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowRect,
        PostThreadMessageW, RegisterClassW, TranslateMessage, MSG, WNDCLASSW,
        WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE, WM_QUIT,
    };

    extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(h, m, w, l) }
    }
    fn spawn_static_window(title: &'static str, x: i32) -> (isize, u32) {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).unwrap();
            let cls = HSTRING::from(format!("itqan-selftest-{title}"));
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
            .expect("نافذة الفحص");
            tx.send((hwnd.0 as isize, GetCurrentThreadId())).unwrap();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        rx.recv().unwrap()
    }

    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let (wh, wtid) = spawn_static_window("pre-frame-pick", 60);
    let center = unsafe {
        let mut r = RECT::default();
        GetWindowRect(HWND(wh as *mut _), &mut r).unwrap();
        POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
    };
    start();
    // **فورًا بلا أيّ انتظار تهيئة** — نافذة الفراغ قبل أول Frame هي ميدان البلاغ
    let seq0 = 991;
    note_click(seq0, qpc(), center.x, center.y);
    let r0 = pick(seq0, Which::Before);
    // ثم انتظار وصول إطارٍ فعلًا (أحدث ختم يتبدّل) بمهلة قصوى لسطحٍ مزدحم
    let t0 = std::time::Instant::now();
    loop {
        if ring_newest_hns() != 0 || t0.elapsed() > Duration::from_secs(8) {
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    let seq1 = 992;
    note_click(seq1, qpc(), center.x, center.y);
    let r1 = pick(seq1, Which::Before);

    unsafe {
        let _ = PostThreadMessageW(wtid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    stop();

    println!("pre-frame: النقرة قبل التهيئة أجابت {:?}", r0);
    // الجوهر: الخيط **حيّ** بعد نافذة الفراغ — الثانية تُلتقط لا تفقَد
    let FramePickResult::Picked(p1) = r1 else {
        panic!(
            "خيط الحلقة مات بانتظارنا: pick بعد وصول الإطارات أعاد {:?} — حارس فراغ الحلقة مكسور",
            r1
        );
    };
    assert!(p1.delta_ms <= 0.0, "«قبل» دلتاه سالبة: {:+.1}", p1.delta_ms);
    let meta = std::fs::metadata(&p1.path).expect("ملف JPEG موجود");
    assert!(meta.len() > 10_000, "JPEG حقيقي لا فارغ: {} بايت", meta.len());
    println!(
        "pre-frame: الخيط نجى من نافذة الفراغ — الثانية دلتا={:+.1}ms ({}KB)",
        p1.delta_ms,
        meta.len() / 1024
    );
}

/// شهادة وفاة WER (2026-09-17): تفكيك الحلقة كان يُحمِّل ‏GraphicsCapture.dll
/// من الذاكرة بينما مفكّاتها المتأخّرة تستدعيه بعد موته ⇐ ‏c0000005 يموت به
/// التطبيق كله (0xffffffff بسجلّ التشغيل عند المالك). الرقعة: حفظ مرجع العنصر
/// حيًّا كي لا تُحمَّل المكتبة أصلًا. حيّ: ‏٥ دورات بدء/إيقاف متتالية — كل
/// إيقافٍ كان يمر بنافذة الموت — ثم نقرة سادسة تُلتقط فعلًا؛ انهيار العملية
/// أثناء الدورات ⇐ موت الاختبار نفسه فيفشل
#[test]
#[ignore]
fn دورات_البدء_والايقاف_المتكررة_لا_تهوي_العملية() {
    use crate::sensors::clock::qpc;
    use crate::sensors::events::FramePickResult;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowRect,
        PostThreadMessageW, RegisterClassW, TranslateMessage, MSG, WNDCLASSW,
        WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE, WM_QUIT,
    };

    extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(h, m, w, l) }
    }
    fn spawn_static_window(title: &'static str, x: i32) -> (isize, u32) {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).unwrap();
            let cls = HSTRING::from(format!("itqan-selftest-{title}"));
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
            .expect("نافذة الفحص");
            tx.send((hwnd.0 as isize, GetCurrentThreadId())).unwrap();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        rx.recv().unwrap()
    }

    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let (wh, wtid) = spawn_static_window("teardown-cycles", 60);
    let center = unsafe {
        let mut r = RECT::default();
        GetWindowRect(HWND(wh as *mut _), &mut r).unwrap();
        POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
    };
    for cycle in 0..5 {
        start();
        // جلسة قصيرة حيّة (إطارات تجري) ثم إيقاف — مسار التفكيك ميدان الجرثومة
        std::thread::sleep(Duration::from_millis(900));
        stop();
        std::thread::sleep(Duration::from_millis(120));
        println!("teardown-cycles: الدورة {} نجت", cycle + 1);
    }
    // البرهان بعد الدورات: «بعد» لا يُفقد أبدًا إن كان الخيط حيًّا (إطار لاحق
    // حقيقيّ أو سقوطٌ لآخر قبل) — Missing ⇐ الخيط مات فالاختبار يكشفه
    start();
    std::thread::sleep(Duration::from_millis(700));
    let seq = 993;
    note_click(seq, qpc(), center.x, center.y);
    let r = pick(seq, Which::After);
    unsafe {
        let _ = PostThreadMessageW(wtid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    stop();
    let FramePickResult::Picked(p) = r else {
        panic!("الخيط مات بعد الدورات: pick أعاد {:?}", r);
    };
    println!(
        "teardown-cycles: ٥ دورات ثم نقرة سادسة دلتا={:+.1}ms — العملية حيّة والمكتبة محمَّلة",
        p.delta_ms
    );
}

/// برهان ٣ب-٥ الحيّ (نقطة التدقيق): نافذة بـWDA_EXCLUDEFROMCAPTURE تحت نقطة
/// النقرة ⇐ `missing:'protected'` **بلا أيّ قراءة بكسل** (لا ملف JPEG ولا لقطة
/// سوداء) — والنافذة الحرّة الملاصقة تُلتقط كالمعتاد. نقل gate5 ونافذته
/// المحميّة (spawn_test_window سطور ٣١٤–٣٥٣ بفرعها المحميّ). يُشغَّل يدويًّا مرة.
#[test]
#[ignore]
fn المحمية_بلا_لقطة_والحرّة_تُلتقط() {
    use crate::sensors::clock::qpc;
    use crate::sensors::events::FramePickResult;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetWindowDisplayAffinity,
        GetWindowRect, PostThreadMessageW, RegisterClassW, SetWindowDisplayAffinity,
        TranslateMessage, MSG, WDA_EXCLUDEFROMCAPTURE, WNDCLASSW, WS_EX_TOPMOST,
        WS_OVERLAPPEDWINDOW, WS_VISIBLE, WM_QUIT,
    };

    extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(h, m, w, l) }
    }
    // المنقول حرفيًّا من spawn_test_window (٣١٤–٣٥٣): ‏protect ⇐ WDA_EXCLUDEFROMCAPTURE
    fn spawn_test_window(title: &'static str, protect: bool, x: i32) -> (isize, u32) {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).unwrap();
            let cls = HSTRING::from(format!("itqan-selftest-{title}"));
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
            .expect("نافذة الفحص");
            if protect {
                SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE).expect("حماية");
            }
            tx.send((hwnd.0 as isize, GetCurrentThreadId())).unwrap();
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        rx.recv().unwrap()
    }

    // وعي DPI من main السبايك (٨٨٩–٨٩١) — كي تطابق نقطة النقر نافذةً حقيقيّة
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let (ph, ptid) = spawn_test_window("protected5", true, 60);
    let (ch, ctid) = spawn_test_window("control5", false, 430);
    std::thread::sleep(Duration::from_millis(600));

    // تنظيف مسبق لشهْدَي «لا-ملف»: قياس ٢٠٢٦-٠٩-١٧ — جولة متوازٍ خاطئة كتبت
    // f-996 قديمًا فتعثّر التأكيد على غيابه في تشغيلٍ لاحق نقيّ
    let _ = std::fs::remove_file(frame_path(996));
    let _ = std::fs::remove_file(frame_path(997));

    // قراءة gate5 المباشرة أولًا: المحميّة تحمل WDA_EXCLUDEFROMCAPTURE والحرّة صفر
    let aff_of = |h: isize| unsafe {
        let mut a = 0u32;
        let _ = GetWindowDisplayAffinity(HWND(h as *mut _), &mut a);
        a
    };
    assert_eq!(aff_of(ph), WDA_EXCLUDEFROMCAPTURE.0, "الحماية مضبوطة فعلًا");
    assert_eq!(aff_of(ch), 0, "الشاهدة حرّة");

    let center = |h: isize| unsafe {
        let mut r = RECT::default();
        GetWindowRect(HWND(h as *mut _), &mut r).unwrap();
        POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
    };

    start();
    std::thread::sleep(Duration::from_millis(500));

    // المحميّة: النقر على مركزها ⇐ missing:'protected' حرفيًّا وبلا ملف إطلاقًا
    let pc = center(ph);
    let seq_p = 996;
    note_click(seq_p, qpc(), pc.x, pc.y);
    let rp = pick(seq_p, Which::Before);
    let jp = serde_json::to_value(&rp).unwrap();
    assert_eq!(jp["missing"], "protected", "٣ب-٥: الردّ {:?}", rp);
    assert!(
        !std::path::Path::new(&frame_path(seq_p)).exists(),
        "لا لقطة سوداء: لا يُكتب ملف JPEG للنافذة المحميّة أصلًا"
    );

    // الشاهدة الحرّة على النقطة نفسها النمط: تُلتقط لا protected (إنشاؤها غيّر الشاشة ⇒ إطارات)
    let cc = center(ch);
    let seq_c = 997;
    note_click(seq_c, qpc(), cc.x, cc.y);
    let rc = pick(seq_c, Which::Before);
    assert!(
        matches!(rc, FramePickResult::Picked(_)),
        "الحرّة تُلتقط كالمعتاد لا protected: {:?}",
        rc
    );
    stop();

    unsafe {
        let _ = PostThreadMessageW(ptid, WM_QUIT, WPARAM(0), LPARAM(0));
        let _ = PostThreadMessageW(ctid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    println!("protected-selftest: محميّة ⇐ protected بلا ملف · حرّة ⇐ Picked — ٣ب-٥ مثبت");
}
