/**
 * علامة «إتقان» داخل الامتداد — نفس مسارات الشعار الأصلية حرفًا بحرف
 * (المصدر الفني: `apps/site/assets/brand/itqan-mark.svg`، والإطار مضبوط على
 * حبر الحروف: viewBox="176 48 421 204" بهامش ١٤ وحدة متساوٍ).
 *
 * الحبر يرث `currentColor` فيتبع ثيمي الامتداد، والألف وحدها ملوّنة عبر
 * `--itqan-alif` (طينيّ في النهار، وأفتح في الليل — معرَّف في sidepanel.css).
 *
 * `stroke`: عرض القلم بوحدات viewBox. الافتراضي ٦ كما في الشعار؛ ارفعه في
 * المقاسات الصغيرة وإلا صار الخط أرقّ من بكسل ونصف فبدا رماديًّا باهتًا.
 */
export function ItqanMark({ width = 120, stroke = 6, className }: { width?: number; stroke?: number; className?: string }) {
  const k = stroke / 6 // كل الأعراض الأخرى تتبع نفس النسبة
  return (
    <svg
      className={className}
      width={width}
      height={(width * 204) / 421}
      viewBox="176 48 421 204"
      role="img"
      aria-label="إتقان"
      style={{ overflow: 'visible' }}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={stroke}>
        <path d="M 574 66 C 570 102, 575 144, 572 185" />
        <path strokeWidth={5 * k} d="M 579 207 C 567 199, 558 208, 565 216 L 578 216 L 560 226" />
        <path d="M 540 148 C 546 169, 531 185, 508 185 L 449 185" />
        <path strokeWidth={8 * k} d="M 519 124 L 518 126" />
        <path strokeWidth={8 * k} d="M 502 124 L 501 126" />
        <path d="M 449 185 C 466 175, 466 145, 449 143 C 430 140, 428 168, 445 174 C 449 176, 453 177, 457 176" />
        <path strokeWidth={8 * k} d="M 452 116 L 451 118" />
        <path strokeWidth={8 * k} d="M 435 116 L 434 118" />
        <path d="M 312 148 C 319 175, 317 205, 295 220 C 270 239, 222 239, 203 215 C 191 200, 192 183, 198 168" />
        <path strokeWidth={8 * k} d="M 257 151 L 256 153" />
        <path d="M 449 185 C 428 186, 400 186, 376 184" />
      </g>
      {/* الألف التي لا تقابلها كلمة — اللون الوحيد في العلامة */}
      <path
        fill="none"
        stroke="var(--itqan-alif)"
        strokeWidth={7 * k}
        strokeLinecap="round"
        d="M 373 66 C 371 103, 374 142, 376 184"
      />
    </svg>
  )
}

/**
 * القفل الكامل: الشعار، وتحته `ACTIVE. SOP` بتراك واحد بين خطّين رفيعين
 * يجعلان مجموع العرض = عرض الشعار بالضبط. النِّسب مشتقّة كلها من `width`
 * فتبقى العلاقة ثابتة عند أي مقاس — وهي عين النِّسب المستعملة في الموقع.
 */
export function ItqanLockup({ width = 168, stroke = 8 }: { width?: number; stroke?: number }) {
  return (
    <div className="itqan-lockup" style={{ width, ['--lk-w' as string]: `${width}px` }}>
      <ItqanMark width={width} stroke={stroke} />
      <div className="itqan-lk-row">
        <span className="itqan-lk-rule" aria-hidden />
        <span className="itqan-lk-line" aria-label="ACTIVE SOP">
          <b aria-hidden>ACTIVE.</b>
          <i aria-hidden>SOP</i>
        </span>
        <span className="itqan-lk-rule" aria-hidden />
      </div>
    </div>
  )
}
