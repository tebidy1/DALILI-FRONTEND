//! اشتقاق هوية التطبيق `appId` — يطابق `appSiteKey` في `@dalili/core` حرفيًّا:
//! «اسم الملفّ التنفيذي بأحرف كبيرة: app:EXCEL.EXE»، و`primarySourceOf` يبني مفتاح الموقع
//! من `processName` — فلا بدّ أن ينتج Rust الشيء نفسه وإلا اختلفت فلترة الويب.
//! القياس المؤسِّس (البوّابة ٥): AUMID لـExcel فارغ ⇐ appId من مسار التنفيذي.

/// AUMID فارغ/غائب ⇐ اشتقاق من مسار التنفيذي؛ AUMID موجب ⇐ هوية UWP كما هي.
/// يقبل المسارَ بمائلَي الشرطة ويطبّع الاسم كما تفعل النواة (split + trim + toUpperCase).
pub fn app_id(aumid: Option<&str>, exe_path: &str) -> String {
    let uwp = aumid.map(str::trim).filter(|s| !s.is_empty());
    match uwp {
        Some(id) => format!("app:{}", id),
        None => {
            // مطابق لـappSiteKey في core: آخر مقطع بعد أيّ مائل، مقصوصًا بأحرف كبيرة
            let base = exe_path.rsplit(['\\', '/']).next().unwrap_or(exe_path).trim();
            format!("app:{}", base.to_uppercase())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn مسار_التنفيذي_يعطي_اسم_الملف_بأحرف_كبيرة() {
        assert_eq!(app_id(None, r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"), "app:EXCEL.EXE");
        assert_eq!(app_id(Some(""), "C:\\Windows\\System32\\notepad.exe"), "app:NOTEPAD.EXE");
        assert_eq!(app_id(Some("   "), "C:/tools/firefox.exe"), "app:FIREFOX.EXE", "المائل الأماميّ يُعامَل كالفاصل");
    }

    #[test]
    fn aumid_الموجب_هو_الهوية_كما_هي() {
        assert_eq!(
            app_id(Some("Microsoft.Excel_8wekyb3d8bbwe!App"), "whatever.exe"),
            "app:Microsoft.Excel_8wekyb3d8bbwe!App"
        );
    }

    #[test]
    fn يطابق_صيغة_النواة_التي_يبني_بها_مفتاح_الموقع() {
        // النواة: processName.split(/[\\/]/).pop().trim().toUpperCase() مع السابقة app:
        let proc = r"D:\Apps\LibreOffice\program\soffice.bin";
        let expected = format!("app:{}", proc.rsplit(['\\', '/']).next().unwrap().trim().to_uppercase());
        assert_eq!(app_id(None, proc), expected);
        assert_eq!(app_id(None, proc), "app:SOFFICE.BIN");
    }
}
