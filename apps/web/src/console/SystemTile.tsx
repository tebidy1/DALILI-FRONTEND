/**
 * ج١ + ش١: مربع النظام أو الشريك — الشعار إن رُفع، وإلا الحرف الأول على لون ثابت من الاسم
 * (فلا يتغيّر بين الصفحات).
 */
export function SystemTile({ name, logoUrl, size = 40 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) return <img className="sys-tile sys-logo" src={logoUrl} alt="" width={size} height={size} />
  // حرف واحد: الحرفان من كلمتين يقطعان «ال» والحروف المتصلة في العربية («نل» لـ«نُظم للحلول»)
  const letters = name.trim().charAt(0) || '?'
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (
    <span className="sys-tile" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 45% 92%)`, color: `hsl(${h} 45% 30%)` }}>
      {letters}
    </span>
  )
}

/** نطاقات كتبها المستخدم في سطر واحد: فاصلة عربية أو لاتينية أو مسافة — الخادم يطبّعها ويتحقق منها */
export function splitDomains(text: string): string[] {
  return text.split(/[\s,،]+/).map((d) => d.trim()).filter(Boolean)
}
