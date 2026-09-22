/** كاشف العناصر التفاعلية الموحّد — علة: الحلقة وإسناد النقرة كانا محصورين في
 *  منتقى ضيق (button/a/…) فبقي أغلب أزرار الويب الحديث (div/span بcursor:pointer
 *  أو أدوار ARIA) بلا تأشير ولا إطار على اللقطة. دالة واحدة تحكم الاثنين معًا:
 *  ما يُؤشَّر بالمرور هو ما يُعلَّم بالنقر — لا تجربتان مختلفتان. */

/** أدوار ARIA تفاعلية بطبيعتها — عنصر يحملها هدف تأشير شرعي */
const INTERACTIVE_ROLES = [
  'button',
  'link',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'switch',
  'checkbox',
  'radio',
  'treeitem',
  'combobox',
  'textbox',
  'searchbox',
  'slider',
  'spinbutton',
]

/** المنتقى القوي: عناصر تفاعلية بالوسم أو الصفة — مسار closest السريع */
export const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
  '[aria-haspopup]',
  '[draggable="true"]',
  ...INTERACTIVE_ROLES.map((r) => `[role="${r}"]`),
].join(',')

/** سقف صعود السلف بحثًا عن المؤشر — الأعماق الأبعد ليست زرًا يخص المستخدم */
const MAX_CURSOR_HOPS = 14

const SKIP_TAGS = new Set(['HTML', 'BODY', 'DALILI-OVERLAY', 'DALILI-CONTROLLER'])

/** هل العنصر داخل طبقة دليلي نفسها (شريط/ستار)؟ — لا تُؤشَّر عناصرنا أبدًا */
function insideOurLayer(el: Element): boolean {
  let cur: Element | null = el
  while (cur) {
    if (cur.tagName?.toUpperCase().startsWith('DALILI-')) return true
    cur = cur.parentElement
  }
  return false
}

function defaultCursor(el: Element): string {
  return window.getComputedStyle(el).cursor
}

/**
 * هدف التأشير لعنصر تحت المؤشر/النقر: أقرب سلف يطابق المنتقى القوي، وإلا أقرب
 * سلف مؤشره pointer (زر مخصص). null = عنصر عادي لا يستحق حلقة.
 * computedCursor قابل للحقن للاختبار؛ الافتراضي getComputedStyle للصفحة.
 */
export function pickInteractive(
  el: Element,
  computedCursor: (el: Element) => string = defaultCursor,
): Element | null {
  if (insideOurLayer(el)) return null
  const strong = el.closest(INTERACTIVE_SELECTOR)
  if (strong && !insideOurLayer(strong)) return strong
  let cur: Element | null = el
  for (let hops = 0; cur && hops < MAX_CURSOR_HOPS; hops++, cur = cur.parentElement) {
    const tag = cur.tagName?.toUpperCase()
    if (!tag || SKIP_TAGS.has(tag) || tag.startsWith('DALILI-')) continue
    if (computedCursor(cur) === 'pointer') return cur
  }
  return null
}
