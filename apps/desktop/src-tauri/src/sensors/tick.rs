//! مضخّة النبض (بند تدقيق ٣ج-٢ المتابَع): `sensor://tick` كل ~50مث بين
//! `recording_start` و`recording_stop` حصرًا. ساعة جلسة الـWebView كلّها
//! (إغلاق الإيماءة + مهلة انتظار الحقائق) من هذه النبضات — بلا نبض لا تتقدّم
//! الساعة ولا يُنتج المسجّل الحيّ شيئًا (الاختبارات بجسر محقون لا تكشف هذا).
//! الختم من QPC حصرًا (ساعة العقد الواحدة §٣.٢)، والانضباط نمط ٣ب: خيط واحد
//! + قناة إيقاف تكسر الانتظار خلال دورة + انضمام نظيف.

use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::Duration;

use tauri::Emitter;

use crate::sensors::clock::{qpc, qpc_ms};
use crate::sensors::events::TickEvt;

/// دورة النبض — العقد §٣.٢ («كل 50ms أثناء التسجيل»)
pub const TICK_PERIOD: Duration = Duration::from_millis(50);

enum TickMsg {
    Stop,
}

static TICK_TX: OnceLock<Mutex<Option<mpsc::Sender<TickMsg>>>> = OnceLock::new();
static TICK_JOIN: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

fn tx_cell() -> &'static Mutex<Option<mpsc::Sender<TickMsg>>> {
    TICK_TX.get_or_init(|| Mutex::new(None))
}

/// حائط البثّ المحقون — الإنتاج يبثّ للـWebView والاختبار يجمع الطوابع
trait TickSink {
    fn emit_tick(&self, t: f64);
}

struct AppSink<R: tauri::Runtime>(tauri::AppHandle<R>);

impl<R: tauri::Runtime> TickSink for AppSink<R> {
    fn emit_tick(&self, t: f64) {
        let _ = self.0.emit("sensor://tick", &TickEvt { qpc_ms: t });
    }
}

/// حلقة النبض النقيّة: كل دورة تنتظر أمر الإيقاف (يكسر الانتظار فورًا لا بعد
/// نوم كامل) وإلّا تبثّ ختم QPC. الجدران محقونة (مُبثِّع + دورة + ساعة) كي
/// يُختبَر التوقيت والإيقاف بلا Tauri.
fn pump_loop<S: TickSink>(
    sink: &S,
    rx: &mpsc::Receiver<TickMsg>,
    period: Duration,
    now: impl Fn() -> f64,
) {
    loop {
        match rx.recv_timeout(period) {
            Ok(TickMsg::Stop) | Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => sink.emit_tick(now()),
        }
    }
}

/// يشغّل الخيط — جلسة قائمة ⇐ تُفكّ أوّلًا (نمط ٣ب). معمَّم على Runtime كي
/// يجريه سكربت القياس الحيّ (٣ب-٦) على تطبيقٍ وهميّ بنفس الشيفرة
pub fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    stop();
    let (tx, rx) = mpsc::channel::<TickMsg>();
    *tx_cell().lock().unwrap() = Some(tx);
    let sink = AppSink(app);
    *TICK_JOIN.lock().unwrap() = Some(std::thread::spawn(move || {
        pump_loop(&sink, &rx, TICK_PERIOD, || qpc_ms(qpc()));
    }));
}

/// فكّ نظيف: أمر الإيقاف ثم انضمام — بعده لا نبضة تُبثّ إطلاقًا
pub fn stop() {
    if let Some(tx) = tx_cell().lock().unwrap().take() {
        let _ = tx.send(TickMsg::Stop);
    }
    if let Some(h) = TICK_JOIN.lock().unwrap().take() {
        let _ = h.join();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    struct CollectSink(Arc<Mutex<Vec<f64>>>);
    impl TickSink for CollectSink {
        fn emit_tick(&self, t: f64) {
            self.0.lock().unwrap().push(t);
        }
    }

    /// دخان المضخّة: النبض يتقدّم بالدورة (بحدود جدولة ويندوز ~15مث) والطوابع
    /// رتيبة من QPC، وبعد الإيقاف والانضمام لا نبضة واحدة تُبثّ
    #[test]
    fn النبض_يتقدم_بالدورة_ويتوقف_نظيفًا() {
        let stamps = Arc::new(Mutex::new(Vec::new()));
        let sink = CollectSink(stamps.clone());
        let (tx, rx) = mpsc::channel::<TickMsg>();
        let handle = std::thread::spawn(move || {
            pump_loop(&sink, &rx, Duration::from_millis(10), || qpc_ms(qpc()));
        });
        std::thread::sleep(Duration::from_millis(180));
        let _ = tx.send(TickMsg::Stop);
        let _ = handle.join();
        let after_stop = stamps.lock().unwrap().len();
        assert!(after_stop >= 5, "١٨٠مث بدورة ١٠مث ⇐ نبض متعدّد، وصل {after_stop}");
        {
            let s = stamps.lock().unwrap();
            for w in s.windows(2) {
                assert!(w[1] > w[0], "طوابع QPC رتيبة لا ترجع للخلف");
                assert!(
                    w[1] - w[0] < 60.0,
                    "فجوة النبض بحدود الدورة والجدولة: {}",
                    w[1] - w[0]
                );
            }
        }
        // الانضمام تمّ — نصمد ٦ دورات كاملة ونتحقّق أن العدّ جمِد
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(
            stamps.lock().unwrap().len(),
            after_stop,
            "لا نبضة بعد الإيقاف النظيف"
        );
    }
}
