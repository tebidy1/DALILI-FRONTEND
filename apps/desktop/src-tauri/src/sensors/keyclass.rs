//! تصنيف مفتاح لوحة المفاتيح — **لا حرف يُخزَّن أو يُبثّ أبدًا** (قيود ٣ب §٣.٥).
//! داخل نداء الخطّاف (٣ب-٢) يُستدعى هذا بدل `ToUnicode` — فلا يمكن أن تتسرّب نصوص الكتابة.
//! الجدول كامل على ٠–٢٥٥؛ ما لم يُصنَّف صراحةً يقع في `Other`.

/// صنف المفتاح — قيمة العقد `keyClass` في `InputEvt` (§٣.٢)
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyClass {
    /// مفتاح يُنتج حرفًا/رقمًا/علامة — يُبثّ الصنف وحده لا الحرف
    Char,
    Enter,
    Tab,
    Escape,
    /// تنقّل: أسهم/Home/End/PgUp/PgDn/Insert/Delete/Backspace
    Nav,
    /// Shift/Ctrl/Alt/Win/CapsLock/NumLock
    Modifier,
    /// F-keys، PrintScreen، مفاتيح المتصفّح/الوسائط، وكل ما عدا ذلك
    Other,
}

pub fn key_class(vk: u32) -> KeyClass {
    match vk {
        // الفئات الثلاث المسمّاة
        0x0D => KeyClass::Enter,
        0x09 => KeyClass::Tab,
        0x1B => KeyClass::Escape,
        // المعدّلات: Shift/Ctrl/Alt يسارًا ويمينًا + Win + CapsLock + NumLock
        0x10 | 0x11 | 0x12 | 0x14 | 0x5B | 0x5C | 0x90 | 0xA0..=0xA5 => KeyClass::Modifier,
        // التنقّل: Backspace + PgUp/PgDn/End/Home + الأسهم + Insert/Delete
        0x08 | 0x21..=0x28 | 0x2D | 0x2E => KeyClass::Nav,
        // ما يُنتج حرفًا: مسافة، أرقام، حروف (VK لا يميّز حالة)، لوحة الأرقام كاملة، علامات OEM
        0x20 | 0x30..=0x39 | 0x41..=0x5A | 0x60..=0x6F | 0xBA..=0xC0 | 0xDB..=0xDE => KeyClass::Char,
        // F-keys، PrintScreen، Pause/ScrollLock، وسائط/متصفّح، وكل ما لم يُصنَّف
        _ => KeyClass::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// الحارس الأهمّ: لا مدخل واحد على ٠–٢٥٥ يُنتج شيئًا يوصف حرفًا —
    /// الدالّة تعيد صنفًا بلا حمولة، وال sweep يثبت عدم الذعر على أيّ vk
    #[test]
    fn لا_حرف_على_كامل_المدى_ولا_ذعر_على_أي_مفتاح() {
        for vk in 0u32..=255 {
            let _ = key_class(vk); // يعود بقيمة صالحة حتميًّا — لا panic ولا حرف
        }
    }

    #[test]
    fn الأحرف_والأرقام_والمسافة_ولوحة_الأرقام_فئة_char() {
        for vk in [0x20, 0x30, 0x35, 0x39, 0x41, 0x5A, 0x61 - 26, 0x65, 0x6E, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xC0, 0xDB, 0xDC, 0xDD, 0xDE] {
            assert_eq!(key_class(vk), KeyClass::Char, "vk=0x{vk:02X}");
        }
        for vk in 0x30..=0x39 {
            assert_eq!(key_class(vk), KeyClass::Char, "أرقام vk=0x{vk:02X}");
        }
        for vk in 0x41..=0x5A {
            assert_eq!(key_class(vk), KeyClass::Char, "حروف vk=0x{vk:02X}");
        }
        for vk in 0x60..=0x69 {
            assert_eq!(key_class(vk), KeyClass::Char, "أرقام لوحة الأرقام vk=0x{vk:02X}");
        }
    }

    #[test]
    fn الدخول_والتبويب_والإفلات_فئاتها_الخاصة() {
        assert_eq!(key_class(0x0D), KeyClass::Enter); // Enter + Enter لوحة الأرقام
        assert_eq!(key_class(0x09), KeyClass::Tab);
        assert_eq!(key_class(0x1B), KeyClass::Escape);
    }

    #[test]
    fn التنقل_فئة_واحدة_متكاملة() {
        for vk in [0x08, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E] {
            assert_eq!(key_class(vk), KeyClass::Nav, "vk=0x{vk:02X}");
        }
    }

    #[test]
    fn المعدّلات_فئة_واحدة_بأزواجها_اليسرى_اليمنى() {
        for vk in [0x10, 0xA0, 0xA1, 0x11, 0xA2, 0xA3, 0x12, 0xA4, 0xA5, 0x14, 0x90, 0x5B, 0x5C] {
            assert_eq!(key_class(vk), KeyClass::Modifier, "vk=0x{vk:02X}");
        }
    }

    #[test]
    fn ما_عدى_ذلك_فئة_other_لا_شيء_يتسلل_إلى_char() {
        for vk in [0x00, 0x13, 0x2C, 0x5D, 0x70, 0x74, 0x87, 0x91, 0xA6, 0xB7, 0xE2, 0xFF] {
            assert_eq!(key_class(vk), KeyClass::Other, "vk=0x{vk:02X}");
        }
        // خط الدفاع: أي مفتاح غير مصنَّف حرفيًّا أعلاه في ٠x70–0x87 (F-keys) ليس Char
        for vk in 0x70..=0x87 {
            assert_ne!(key_class(vk), KeyClass::Char);
        }
    }
}
