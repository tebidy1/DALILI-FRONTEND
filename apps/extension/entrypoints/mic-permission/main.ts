/**
 * VOX-06: صفحة إذن الميكروفون — الإذن يُطلب من صفحة امتداد ظاهرة، لا من
 * content script أبدًا. النتيجة (منحًا أو رفضًا) تُسلَّم للخلفية التي تبدأ
 * الالتقاط في الحالتين: الرفض = «لا صوت — الالتقاط مستمر» (صدق).
 * VOX-09: مسار flow=memo — الإذن لأجل تعليق خطوة جارية (ميك الخطوة).
 */

const state = document.getElementById('state')!

async function main() {
  const flow = new URLSearchParams(location.search).get('flow') === 'memo' ? 'memo' : undefined
  let granted = false
  try {
    // فتح قناة فعلية يعرض موجه المتصفح ثم تُغلق فورًا — التسجيل يتم في offscreen
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })
    stream.getTracks().forEach((t) => t.stop())
    granted = true
  } catch {
    granted = false
  }
  if (granted) {
    state.textContent = flow === 'memo' ? 'تم فتح الميكروفون — عد لصفحتك وتكلم ثم أوقف التسجيل' : 'تم فتح الميكروفون — يعود التركيز لصفحتك ويبدأ الالتقاط الآن'
    state.className = 'state ok'
  } else {
    state.textContent = 'لا صوت — الالتقاط مستمر بلا تعليق. تفعّله لاحقًا بأذن من إعدادات الموقع'
    state.className = 'state no'
  }
  await chrome.runtime.sendMessage({ t: 'mic-result', granted, flow }).catch(() => {})
  // الخلفية تغلق هذا التبويب وتعيد التركيز للتبويب الأصلي بعد لحظة تكفي لقراءة الحالة
}

void main()
