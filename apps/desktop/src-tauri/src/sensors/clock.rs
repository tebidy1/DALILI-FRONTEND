//! ساعة QPC الواحدة — منقولة حرفيًّا من السبايك المقيس
//! (`%TEMP%\itqan-spikes\itqan-gates235\src\main.rs` سطور ٦٠–٧٦).
//! كل الأزمنة في العقد `qpcMs` من هذه الساعة وحدها — لا مزج مع ساعات أخرى.

use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

pub fn qpc() -> i64 {
    let mut v = 0i64;
    unsafe { QueryPerformanceCounter(&mut v).unwrap() };
    v
}
pub fn qpc_freq() -> i64 {
    let mut v = 0i64;
    unsafe { QueryPerformanceFrequency(&mut v).unwrap() };
    v
}
/// ختم QPC → وحدات 100ns (وحدة SystemRelativeTime في WGC)
pub fn qpc_to_hns(t: i64) -> i64 {
    ((t as i128) * 10_000_000 / qpc_freq() as i128) as i64
}
pub fn hns_ms(d: i64) -> f64 {
    d as f64 / 10_000.0
}
/// ختم QPC خام → ميلي ثانية مطلقة (`qpcMs` في العقد §٣.٢ — إضافة تكييف، مصدرها الدالّان أعلاه)
pub fn qpc_ms(t: i64) -> f64 {
    t as f64 / qpc_freq() as f64 * 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// حارس النقل: سلوك دوالّ السبايك المنقولة لم يتغيّر
    #[test]
    fn ساعة_السبايك_تتصرف_كما_قيس() {
        let f = qpc_freq();
        // تردّد QPC على ويندوز الحديث 10MHz (مقيس في السبايك)، وأكبر من صفر دائمًا
        assert!(f > 0);
        let a = qpc();
        let b = qpc();
        assert!(b >= a, "QPC رتيب لا يرجع للخلف");
        // 10 آلاف تكة 100ns = 1ms بالضبط
        assert_eq!(hns_ms(10_000), 1.0);
        // hns(qpc) يكبر خطّيًّا مع الخام: qpc_to_hns(f) = 10_000_000 (ثانية كاملة)
        assert_eq!(qpc_to_hns(f), 10_000_000);
        // qpc_ms(ثانية كاملة) = 1000ms
        assert!((qpc_ms(f) - 1000.0).abs() < 0.001);
    }
}
