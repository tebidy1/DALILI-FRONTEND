import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

/** رمز QR محلي التوليد عبر Canvas — لا خدمة خارجية (VIEW-05) */
export function Qr({ text, size = 148, ariaLabel }: { text: string; size?: number; ariaLabel: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!ref.current || !text) return
    // فشل التوليد لا يُسقط الصفحة — يبقى الكانفس فارغًا والرابط النصي موجودًا بجانبه
    void QRCode.toCanvas(ref.current, text, { width: size, margin: 2 }).catch(() => {})
  }, [text, size])
  return <canvas ref={ref} className="qr-canvas" role="img" aria-label={ariaLabel} />
}
