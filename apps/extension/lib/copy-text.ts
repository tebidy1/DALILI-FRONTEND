/** PNL-01: نسخ نصّ للحافظة — clipboard API أولًا، ثم execCommand بديلًا (لوحة بلا تركيز). الفشل يُرمى للرسالة الصادقة */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // نسقط إلى البديل
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('copy-failed')
}
