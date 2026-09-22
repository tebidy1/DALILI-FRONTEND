/** تطمس الصور في service worker عبر OffscreenCanvas — والأجزاء النقية قابلة للاختبار */

export function scaleRect(
  rect: { x: number; y: number; w: number; h: number },
  scale: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    w: Math.round(rect.w * scale),
    h: Math.round(rect.h * scale),
  }
}

const PIXEL_FACTOR = 14

/** يطمس المستطيلات (بإحداثيات بكسل الصورة) في dataURL ويعيد dataURL جديدًا */
export async function blurRegions(
  dataUrl: string,
  rects: Array<{ x: number; y: number; w: number; h: number }>,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const c = canvas.getContext('2d')!
  c.drawImage(bitmap, 0, 0)
  for (const r of rects) {
    const tw = Math.max(1, Math.round(r.w / PIXEL_FACTOR))
    const th = Math.max(1, Math.round(r.h / PIXEL_FACTOR))
    const tmp = new OffscreenCanvas(tw, th)
    const tc = tmp.getContext('2d')!
    tc.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, tw, th)
    c.imageSmoothingEnabled = false
    c.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.w, r.h)
    c.imageSmoothingEnabled = true
  }
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('blur encode failed'))
    fr.readAsDataURL(out)
  })
}
