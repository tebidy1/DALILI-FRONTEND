/**
 * VOX-06: صفحة إذن الميكروفون — الإذن يُطلب من صفحة امتداد ظاهرة، لا من
 * content script أبدًا. النتيجة (منحًا أو رفضًا) تُسلَّم للخلفية التي تبدأ
 * الالتقاط في الحالتين: الرفض = «لا صوت — الالتقاط مستمر» (صدق).
 * المسار بلا flow: «ابدأ مع تعليق صوتي» — تعليق تلقائي مع كل بطاقة (VOX-AUTO).
 * VOX-09: مسار flow=memo — الإذن لأجل تعليق خطوة يدوي أثناء جلسة قائمة.
 */
import { t } from '@/lib/i18n'
import { initI18nLocale, applyDocLocale } from '@/lib/locale-choice'

const state = document.getElementById('state')!

async function main() {
  // I18N-01: لغة الصفحة من التخزين قبل عرض النتيجة
  applyDocLocale(await initI18nLocale(), t('ext.title'))
  const flow = new URLSearchParams(location.search).get('flow') === 'memo' ? 'memo' : undefined
  let granted = false
  try {
    // فتح قناة فعلية يعرض موجه المتصفح ثم تُغلق فورًا — التسجيل يتم في offscreen
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })
    stream.getTracks().forEach((x) => x.stop())
    granted = true
  } catch {
    granted = false
  }
  if (granted) {
    state.textContent = flow === 'memo' ? t('ext.noMicOpened') : t('ext.noMicOpenedAuto')
    state.className = 'state ok'
  } else {
    state.textContent = t('ext.noMicSettings')
    state.className = 'state no'
  }
  await chrome.runtime.sendMessage({ t: 'mic-result', granted, flow }).catch(() => {})
  // المرحلة ٤: زر إغلاق يدوي — إن لم يغلق التبويب تلقائيًا (فقدان التركيز مثلًا) لا يعلق المستخدم
  const closeBtn = document.getElementById('close')
  if (closeBtn) {
    closeBtn.hidden = false
    closeBtn.addEventListener('click', () => window.close())
  }
  // الخلفية تغلق هذا التبويب وتعيد التركيز للتبويب الأصلي بعد لحظة تكفي لقراءة الحالة
}

void main()
