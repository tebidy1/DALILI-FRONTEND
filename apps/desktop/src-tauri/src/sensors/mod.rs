//! المستشعرات — الطرف الذي *يرى ويشعر ويقرأ* (٣ب).
//!
//! القاعدة الذهبيّة: ما يلي الحقائق الخام فقط — نقرة مختومة، حقائق UIA، إطار مختار.
//! بناء الخطوة/المرساة/الدليل في TypeScript حصرًا (يحرسه اختبار ٣أ الأخضر).
//!
//! الوحدات النقيّة (`clock`/`select`/`keyclass`/`appid`) تحت `cargo test`؛
//! الآليّات (الخطّاف/الالتقاط/UIA) تأتي في ٣ب-٢…٣ب-٥ منقولةً من السبايك المقيس.

pub mod appid;
pub mod burn;
pub mod capture;
pub mod clock;
pub mod events;
pub mod hook;
pub mod keyclass;
pub mod measure;
pub mod select;
pub mod tick;
pub mod uia;
