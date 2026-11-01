/**
 * SRCH-04 تطوّر: مُجزّئ الرابط الموحّد — مصدر الحقيقة الواحد للمطابقة بين
 * فهرس الخادم والامتداد. اختلاف التجزئة بين الطرفين = مطابقة كاذبة، فهي هنا وحدها.
 */

/** يقسّم نصًا إلى رموز على غير الأبجدي-الرقمي (عربي/إنجليزي) */
function splitTokens(s: string): string[] {
  return s.split(/[^A-Za-z0-9؀-ۿ]+/).filter(Boolean)
}

/** رمز متغيّر لا يُطابَق: رقم صرف، أو hex طويل (توكن/هاش)، أو رمز طويل جدًا */
function isVolatile(tok: string): boolean {
  const t = tok.toLowerCase()
  if (/^\d+$/.test(t)) return true
  if (/^[0-9a-f]{12,}$/.test(t)) return true
  if (t.length > 24) return true
  return false
}

export interface UrlTokens {
  /** المضيف بنقاط → مسافات — إشارة الموقع (متوافق مع siteNeedle) */
  host: string
  /** رموز المسار + الاستعلام + الـhash، بلا الأجزاء المتغيّرة */
  screen: string[]
}

/** يجزّئ رابطًا إلى مضيف ورموز شاشة موحّدة. غير http(s) → مضيف فارغ. */
export function urlTokens(url: string): UrlTokens {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || !u.hostname) {
      return { host: '', screen: splitTokens(url).filter((t) => !isVolatile(t)) }
    }
    const host = u.hostname.replace(/\./g, ' ')
    // المسار + الاستعلام + الـhash معًا — هوية شاشة أودو تعيش في الـhash
    const screen = splitTokens(`${u.pathname} ${u.search} ${u.hash}`).filter((t) => !isVolatile(t))
    return { host, screen }
  } catch {
    return { host: '', screen: splitTokens(url).filter((t) => !isVolatile(t)) }
  }
}

/**
 * هـ ج١ (HLP): مفتاح الشاشة — رموز **المسار والـhash فقط** (بلا الاستعلام ولا المضيف)،
 * صغيرة، بلا مكرر ولا رموز متغيّرة (أرقام السجلات)، مرتّبة ومضمومة بمسافة.
 * الخصوصية: لا يتسرّب للخادم رقم سجل ولا قيمة بحث؛ والفاتورة تُميَّز عن أمر الشراء.
 */
export function screenKey(url: string): string {
  const u = parseUrl(url)
  if (!u || !/^https?:$/.test(u.protocol) || !u.hostname) return ''
  const toks = splitTokens(`${u.pathname} ${u.hash}`)
    .map((t) => t.toLowerCase())
    .filter((t) => !isVolatile(t))
  return [...new Set(toks)].sort().join(' ')
}

export interface DiscoverRef {
  id: string
  title: string
  updatedAt: string
  views: number
}

export interface DiscoverCandidate extends DiscoverRef {
  /** نص فهرس روابط الدليل المجمّع (host + رموز الشاشة كما خزّنها urlTokens) */
  urlText: string
}

export interface DiscoverGroups {
  onScreen: DiscoverRef[]
  onSite: DiscoverRef[]
}

/**
 * يقسّم مرشّحي المضيف لمجموعتين ويرتّب كلًّا بالمشاهدات (الأكثر أولًا) ثم الأحدث.
 * العضوية في «الشاشة» = تطابق رمز شاشة واحد (غير المضيف) على الأقل.
 */
export function rankDiscover(
  cands: DiscoverCandidate[],
  screenTokens: string[],
  hostTokens: string[],
  limit = 5,
): DiscoverGroups {
  const screenSet = new Set(screenTokens.map((t) => t.toLowerCase()).filter(Boolean))
  const hostSet = new Set(hostTokens.map((t) => t.toLowerCase()).filter(Boolean))

  const onScreen: DiscoverRef[] = []
  const onSite: DiscoverRef[] = []
  for (const c of cands) {
    const ref: DiscoverRef = { id: c.id, title: c.title, updatedAt: c.updatedAt, views: c.views }
    // رموز شاشة الدليل = رموز رابطه ناقص رموز المضيف (وإلا كل الموقع يطابق)
    const guideScreen = new Set(splitTokens(c.urlText).map((t) => t.toLowerCase()).filter((t) => !hostSet.has(t)))
    let overlap = 0
    for (const t of screenSet) if (guideScreen.has(t)) overlap++
    if (screenSet.size > 0 && overlap >= 1) onScreen.push(ref)
    else onSite.push(ref)
  }

  const byPopularity = (a: DiscoverRef, b: DiscoverRef) =>
    b.views - a.views || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)
  onScreen.sort(byPopularity)
  onSite.sort(byPopularity)
  return { onScreen: onScreen.slice(0, limit), onSite: onSite.slice(0, limit) }
}

/** رابط مفسَّر أو null — بديل URL.canParse (Chrome 120+ / Safari 17+ فقط: يُسقط محرر الشريك في متصفح أقدم) */
export function parseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * ث٣ (§٥.٧): هل يبدأ الرابط من سجل محدد (فاتورة رقم ٣) لا من قائمة أو «جديد»؟ السجل قد لا يوجد عند العميل.
 * آخر جزء من المسار (أو من مسار الـhash) رقم، أو id=<رقم> في الاستعلام أو الـhash (أودو القديم #id=12).
 */
export function startsAtRecord(url: string): boolean {
  const u = parseUrl(url)
  if (!u) return false
  const lastNumeric = (path: string) => /^\d+$/.test(path.split('/').filter(Boolean).pop() ?? '')
  const hash = u.hash.replace(/^#!?/, '')
  const [hashPath = '', hashQuery = ''] = hash.includes('=') && !hash.startsWith('/') ? ['', hash] : hash.split('?')
  const idParam = (q: string) => /^\d+$/.test(new URLSearchParams(q).get('id') ?? '')
  return lastNumeric(u.pathname) || lastNumeric(hashPath) || idParam(u.search) || idParam(hashQuery)
}
