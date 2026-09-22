//! أحداث وأوامر الحواسّ — **الختم الحرفيّ للعقد** (الخطّة الرئيسيّة §٣.٢/§٣.٣).
//! أسماء الحقول هنا هي ما يقرؤه TypeScript — أيّ تغيير يكسر ٣ج. لا بنى دليل هنا أبدًا.

use serde::Serialize;

/// `sensor://input` — من خيط الخطّاف: ختم وإرسال فقط (٣ب-٢)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputEvt {
    /// عدّاد رتيب لكل ضغطة/مفتاح — مفتاح الربط بين الأحداث الثلاثة
    pub seq: u64,
    /// ميلي ثانية من QPC — الساعة الواحدة
    pub qpc_ms: f64,
    pub kind: InputKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button: Option<MouseButton>,
    /// بكسل فيزيائي — التحويل المنطقي في TS وحده
    pub x: f64,
    pub y: f64,
    /// لا حروف أبدًا — تصنيف المفتاح وحده (خصوصيّة + بصمة keylogger)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_class: Option<crate::sensors::keyclass::KeyClass>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InputKind {
    Down,
    Up,
    Key,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

/// عقدة UIA مخزَّنة — حقائق خام لا تفسير
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiaNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub automation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// اسم ودّيّ ('Button' لا 50000) — التسمية تُبنى من الرقم في ٣ب-٤
    #[serde(skip_serializing_if = "Option::is_none")]
    pub control_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework_id: Option<String>,
    /// بكسل فيزيائي
    pub rect: PhysRect,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PhysRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// العنصر نفسه + هوية كلمة السرّ/القيمة (القيمة غائبة دائمًا إن isPassword)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FactsElement {
    #[serde(flatten)]
    pub node: UiaNode,
    pub is_password: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

/// نافذة المالك للنقرة — hwnd نصًّا لأن JS لا يحمل دقّة i64
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FactsWindow {
    pub hwnd: String,
    pub process_name: String,
    pub window_title: String,
    pub app_id: String,
    /// GetWindowDisplayAffinity — ≠0 ⇐ محميّة (٣ب-٥)
    pub affinity: u32,
    pub ie_mode: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// `sensor://facts` — من خيط UIA على MTA بعد down (٣ب-٤)
/// تنبيه: `rename_all` على الاتّحاد لا يصل حقول متغيّراته — تُكرَّر على كل فرع
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum FactsEvt {
    #[serde(rename_all = "camelCase")]
    Ok {
        seq: u64,
        /// زمن القراءة كاملًا — ميزانيّة p95 ‏<50ms خارج خيط الخطّاف (قرار ق١)
        read_ms: f64,
        element: FactsElement,
        /// ≤ ٥، الأقرب أوّلًا
        ancestors: Vec<UiaNode>,
        window: FactsWindow,
    },
    #[serde(rename_all = "camelCase")]
    Err {
        seq: u64,
        error: FactsError,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FactsError {
    Timeout,
    NoElement,
    /// نافذة مرفوعة الصلاحيّة UIPI
    AccessDenied,
}

/// `sensor://tick` — كل 50ms أثناء التسجيل: ساعة المِضخّة الخارجيّة (لا setTimeout)
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickEvt {
    pub qpc_ms: f64,
}

// ───────────── أوامر §٣.٣ — أنواع الردود (التنفيذ الآليّ في ٣ب-٣/٣ب-٤) ─────────────

/// شاشة الالتقاط لحظة الإطار — بكسل فيزيائي + dpi لحظتها
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMonitor {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub dpi: f64,
}

/// ردّ `frame_pick(seq, which)` الناجح
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FramePicked {
    pub local_id: String,
    pub path: String,
    pub qpc_ms: f64,
    /// فرق ختم الإطار عن ختم النقرة (سالب = قبل)
    pub delta_ms: f64,
    pub monitor: FrameMonitor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MissingReason {
    /// نافذة محميّة (DisplayAffinity ≠ 0) — لا فحص بكسل (٣ب-٥)
    Protected,
    NoFrame,
    /// غير مُنتَج من الالتقاط حتى الفحص، لكن عقد TS (session.ts) يعدّده صريحًا — لا يُحذف إلا بتعديل الطرفين معًا.
    Elevated,
}

/// ردّ `frame_pick` — اتّحاد غير موسوم: إمّا إطار أو سبب غياب
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum FramePickResult {
    Picked(FramePicked),
    Missing {
        missing: MissingReason,
    },
}
// وسيط `which` ('before' | 'after') معرَّف في select.rs بجانب اختيار الإطار وحده — لا تكرار.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sensors::select::Which;

    /// حارس العقد: حقول serde الخارجة تطابق §٣.٢/§٣.٣ حرفيًّا (camelCase، والغياب skip)
    #[test]
    fn أسماء_حقول_العقد_حرفية() {
        let input = InputEvt {
            seq: 7,
            qpc_ms: 12.5,
            kind: InputKind::Down,
            button: Some(MouseButton::Left),
            x: 1920.0,
            y: 1080.0,
            key_class: None,
        };
        let json = serde_json::to_value(&input).unwrap();
        assert_eq!(json["seq"], 7);
        assert_eq!(json["qpcMs"], 12.5);
        assert_eq!(json["kind"], "down");
        assert_eq!(json["button"], "left");
        assert_eq!(json["x"], 1920.0);
        assert!(json.get("keyClass").is_none(), "الغياب skip — لا حقول فارغة");

        let tick = serde_json::to_value(TickEvt { qpc_ms: 1.0 }).unwrap();
        assert_eq!(tick["qpcMs"], 1.0);

        let missing = serde_json::to_value(FramePickResult::Missing { missing: MissingReason::NoFrame })
            .unwrap();
        assert_eq!(missing["missing"], "no_frame");
        let protected = serde_json::to_value(FramePickResult::Missing { missing: MissingReason::Protected })
            .unwrap();
        assert_eq!(protected["missing"], "protected", "٣ب-٥: النافذة المحميّة تبثّ protected حرفيًّا");
        let elevated = serde_json::to_value(FactsError::AccessDenied).unwrap();
        assert_eq!(elevated, "access_denied");

        let which: Which = serde_json::from_value(serde_json::json!("before")).unwrap();
        assert_eq!(which, Which::Before);

        // facts بالخطأ: {seq, error:'no_element'}
        let err = serde_json::to_value(FactsEvt::Err { seq: 3, error: FactsError::NoElement }).unwrap();
        assert_eq!(err["seq"], 3);
        assert_eq!(err["error"], "no_element");
    }

    /// حارس العقد: facts بالنّجاح — element مدموج بالفلتن مع isPassword، والقيمة تُسكَت إن سرّيّة
    #[test]
    fn حقائق_النجاح_تدمج_العنصر_وتصكت_قيمة_السر() {
        let evt = FactsEvt::Ok {
            seq: 9,
            read_ms: 21.5,
            element: FactsElement {
                node: UiaNode {
                    automation_id: Some("TabInsert".into()),
                    name: Some("إدراج".into()),
                    control_type: None,
                    class_name: None,
                    framework_id: None,
                    rect: PhysRect { x: 100.0, y: 60.0, w: 80.0, h: 30.0 },
                },
                is_password: true,
                value: None,
            },
            ancestors: vec![],
            window: FactsWindow {
                hwnd: "0x10a2c".into(),
                process_name: "EXCEL.EXE".into(),
                window_title: "Workbook1 - Excel".into(),
                app_id: "app:EXCEL.EXE".into(),
                affinity: 0,
                ie_mode: false,
                url: None,
            },
        };
        let json = serde_json::to_value(&evt).unwrap();
        assert_eq!(json["readMs"], 21.5);
        assert_eq!(json["element"]["automationId"], "TabInsert");
        assert_eq!(json["element"]["isPassword"], true);
        assert!(json["element"].get("value").is_none(), "قيمة الحقل السرّيّ لا تُبثّ أبدًا");
        assert_eq!(json["window"]["processName"], "EXCEL.EXE");
        assert_eq!(json["window"]["appId"], "app:EXCEL.EXE");
        assert!(json["window"].get("url").is_none());
    }
}
