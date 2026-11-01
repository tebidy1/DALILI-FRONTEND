import { hostOf } from './discover'

/** هـ ج١ (HLP): مضيف التبويب النشط — الموقع الذي تُجلب له شروح «ما هذا؟».
 *  مساعد مستقل كي تبقى نداءات التبويب في مكان واحد. */

export async function activeTabHost(): Promise<string> {
  try {
    const openTabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = openTabs[0]?.url ?? ''
    return url ? (hostOf(url) ?? '') : ''
  } catch {
    return ''
  }
}
