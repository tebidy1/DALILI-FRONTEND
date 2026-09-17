fn main() {
  // ٣د-٤: ثنائيات الاختبار (‏MockRuntime) تحتاج بيان ‏comctl32 v6 وإلا
  // انهارت عند الإقلاع بـ0xc0000139 (فخّ موثَّق من سبايك ٣ب). موجَّه
  // للاختبارات حصرًا كي لا يمسّ بناء التطبيق (تاوري يدير بيانَه بنفسه)
  println!(
    "cargo:rustc-link-arg-tests=/MANIFEST:EMBED"
  );
  println!(
    "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("tests")
      .join("comctl.manifest")
      .display()
  );
  tauri_build::build()
}
