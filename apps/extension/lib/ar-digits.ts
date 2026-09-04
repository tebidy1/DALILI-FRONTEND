/** الأرقام الهندية الشرقية — نسخة واحدة لكل واجهات الامتداد (المكتشف/الأحدث/بطاقة التدريب) */
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

export function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!)
}
