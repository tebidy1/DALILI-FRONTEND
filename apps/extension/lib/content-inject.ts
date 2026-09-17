/** حقن سكربت المحتوى عند الطلب (2026-09-14): التبويبات المفتوحة قبل تحميل/تحديث
 * الامتداد لا يحملها سكربت معلن — بدل طلب F5 من المالك يُزرع الملف المبني نفسه
 * برمجيًا في التبويب فيبدأ الالتقاط فورًا (سلوك اسكرايب/تانجو).
 * التبعية قابلة للحقن كي يُختبر بلا متصفح. */

/** مسار الملف المبني في حزمة MV3 — نفس مدخل content_scripts في المانيفست */
export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js'

export interface ContentInjectDeps {
  executeScript: (details: { target: { tabId: number }; files: string[] }) => Promise<unknown>
}

export type ContentInjector = {
  /** ‏true أُدخل السكربت · false رفض كروم التحقين (متجر كروم/صفحاته المحمية) */
  inject(tabId: number): Promise<boolean>
}

export function makeContentInjector(deps: ContentInjectDeps): ContentInjector {
  return {
    async inject(tabId) {
      try {
        await deps.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] })
        return true
      } catch {
        return false
      }
    },
  }
}
