//! ش١ (الخطة §٢٦، المهمة ٥٧): مبدّل الحساب في الديسكتوب. الخادم يحفظ الحساب المختار
//! لرمز هذا الجهاز وحده (device_tokens.active_workspace_id)، فالالتقاط التالي يهبط فيه.
//! الحارس: لا تبديل أثناء التسجيل، ولا والطابور فيه ما لم يُرفع بعد — وإلا هبطت لقطاتُ
//! الحساب القديم في الجديد لأن الرفع يقرأ اختيار الجهاز لحظة الرفع.

use serde::{Deserialize, Serialize};

use crate::transport::{guide_queue, pair, queue, vault};

/// حسابٌ كما يعيده ‏/api/me/workspaces — بلا أيّ سرّ
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub role: String,
    pub status: String,
    pub active: bool,
}

pub fn parse_accounts(text: &str) -> Result<Vec<Account>, String> {
    serde_json::from_str(text).map_err(|_| "ردّ الحسابات غير مفهوم".to_string())
}

pub fn switch_body(id: &str) -> serde_json::Value {
    serde_json::json!({ "workspaceId": id })
}

/// سبب منع التبديل بالعربية، أو None — نقيّ ومُختبَر
pub fn switch_blocked(recording: bool, unsent: usize) -> Option<&'static str> {
    if recording {
        return Some("أنهِ التسجيل أولاً، ثم بدّل الحساب");
    }
    if unsent > 0 {
        return Some("انتظر حتى تُرفع الأدلة الملتقطة إلى حسابها، ثم بدّل");
    }
    None
}

/// ما لم يُرفع بعد في الطابورين (المعلّق والفاشل معًا: إعادة المحاولة ترفعه لاحقًا)
pub fn unsent_count() -> usize {
    let files = queue::queue_files_dir().map(|d| queue::list_pending(&d).len() + queue::list_failed(&d).len()).unwrap_or(0);
    let guides = guide_queue::guides_dir().map(|d| guide_queue::list_pending(&d).len() + guide_queue::list_failed(&d).len()).unwrap_or(0);
    files + guides
}

fn bearer(origin: &str) -> Result<String, String> {
    vault::read_token(origin).map(|t| format!("Bearer {t}")).ok_or_else(|| "الجهاز غير مربوط بحساب".to_string())
}

pub fn list(origin: &str) -> Result<Vec<Account>, String> {
    let url = pair::http_url(origin, "/api/me/workspaces")?;
    let resp = pair::client()?
        .get(&url)
        .header(reqwest::header::AUTHORIZATION, bearer(origin)?)
        .send()
        .map_err(|_| "تعذّر الاتصال بالخادم".to_string())?;
    if !resp.status().is_success() {
        return Err(format!("تعذّر جلب الحسابات ({})", resp.status().as_u16()));
    }
    parse_accounts(&resp.text().map_err(|_| "ردّ الحسابات غير مفهوم".to_string())?)
}

pub fn switch(origin: &str, id: &str) -> Result<(), String> {
    let url = pair::http_url(origin, "/api/me/workspace")?;
    let resp = pair::client()?
        .put(&url)
        .header(reqwest::header::AUTHORIZATION, bearer(origin)?)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(switch_body(id).to_string())
        .send()
        .map_err(|_| "تعذّر الاتصال بالخادم".to_string())?;
    if !resp.status().is_success() {
        return Err(format!("تعذّر تبديل الحساب ({})", resp.status().as_u16()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_accounts_list() {
        let text = r#"[{"id":"w1","name":"شركة الأفق","kind":"company","role":"creator","status":"active","active":true},
                       {"id":"p1","name":"نُظم للحلول","kind":"partner","role":"creator","status":"active","active":false}]"#;
        let list = parse_accounts(text).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[1].kind, "partner");
        assert!(list[0].active && !list[1].active);
        assert!(parse_accounts("<html>").is_err());
    }

    #[test]
    fn switch_body_carries_workspace_id() {
        assert_eq!(switch_body("p1").to_string(), r#"{"workspaceId":"p1"}"#);
    }

    #[test]
    fn switch_blocked_while_recording_or_unsent() {
        assert!(switch_blocked(true, 0).unwrap().contains("التسجيل"));
        assert!(switch_blocked(false, 2).unwrap().contains("تُرفع"));
        assert_eq!(switch_blocked(false, 0), None);
    }
}
