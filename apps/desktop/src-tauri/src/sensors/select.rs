//! اختيار الإطار من حلقة الـGPU الثمانيّة — منطق نقيّ بلا OS (٣ب-١)، تستعمله حلقة ٣ب-٣.
//! القياس المؤسِّس: الحلقة تحفظ ٨ خامات مختومة QPC (~٥٠٠ms)، والقراءة للمختار وحده (~34ms).

/// سعة الحلقة — ٨ خامات كما قيس في البوّابة ٢
pub const RING_CAP: usize = 8;

/// اتّجاه الاختيار — قبل النقرة أو بعدها
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Which {
    Before,
    After,
}

/// يختار خانة الإطار من أختام الحلقة.
/// `before`: أحدث ختم ≤ t_down (اللقطة قبل الضغط مباشرة).
/// `after`: أوّل ختم > t_down بالترتيب الزمنيّ (اللقطة بعد الأثر مباشرة).
/// يعيد None إن لم يوجد إطار مطابق (حالة لا-إطار ⇐ missing:'no_frame').
/// التعادل في الختم يرجّح الخانة الأدنى ترتيبًا (حتميّ).
pub fn pick_frame(stamps: &[i64], t_down: i64, which: Which) -> Option<usize> {
    // الحكم بالقيمة الزمنيّة لا موضع الخانة — الحلقة تلف فالترتيب الزمنيّ غير الخانويّ
    let mut best: Option<usize> = None;
    for (i, &t) in stamps.iter().enumerate() {
        let fits = match which {
            Which::Before => t <= t_down && best.is_none_or(|b| t > stamps[b]),
            Which::After => t > t_down && best.is_none_or(|b| t < stamps[b]),
        };
        if fits {
            best = Some(i);
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn قبل_الضغط_يختار_أحدث_ختم_لا_يتجاوزه() {
        let stamps = [10, 20, 30];
        assert_eq!(pick_frame(&stamps, 25, Which::Before), Some(1)); // 20
        assert_eq!(pick_frame(&stamps, 30, Which::Before), Some(2)); // الحدّ شامل
    }

    #[test]
    fn بعد_الضغط_يختار_أول_ختم_يتجاوزه_زمنيا() {
        let stamps = [10, 20, 30];
        assert_eq!(pick_frame(&stamps, 25, Which::After), Some(2)); // 30
        assert_eq!(pick_frame(&stamps, 20, Which::After), Some(2)); // حصريّ — 20 نفسها لا تجوز
    }

    #[test]
    fn لا_إطار_مطابق_يعيد_none() {
        let stamps = [10, 20, 30];
        assert_eq!(pick_frame(&stamps, 5, Which::Before), None, "كل الأختام بعد الضغط");
        assert_eq!(pick_frame(&stamps, 30, Which::After), None, "لا إطار تالٍ");
        assert_eq!(pick_frame(&[], 10, Which::Before), None, "حلقة فارغة");
    }

    #[test]
    fn الترتيب_الزمني_لا_ترتيب_الخانات_هو_الحكم() {
        // حلقة ملتفّة: الخانات ليست بترتيب زمنيّ
        let stamps = [30, 10, 20];
        assert_eq!(pick_frame(&stamps, 25, Which::Before), Some(2)); // أحدث ≤25 هي 20
        assert_eq!(pick_frame(&stamps, 15, Which::After), Some(2)); // أوّل >15 زمنيًّا هي 20
    }

    #[test]
    fn حلقة_كاملة_بثمانية_أختام() {
        let stamps: [i64; 8] = [100, 166, 232, 298, 364, 430, 496, 562];
        assert_eq!(pick_frame(&stamps, 300, Which::Before), Some(3)); // 298
        assert_eq!(pick_frame(&stamps, 300, Which::After), Some(4)); // 364
    }
}
