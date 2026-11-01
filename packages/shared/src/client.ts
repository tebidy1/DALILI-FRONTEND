import type {
  CommentResponseDto,
  CommentsResponseDto,
  CreateCommentDto,
  DiscoverResponseDto,
  FolderDto,
  GuideDetailsDto,
  GuideDto,
  GuideSummaryDto,
  ListGuidesDto,
  ListGuidesQuery,
  LibraryOverviewDto,
  MeDto,
  MineReportDto,
  PublicGuideDto,
  SearchResponseDto,
  ShareInfoDto,
  StepDto,
  TeamDto,
  TranscribeResultDto,
  TranscribeStepsResultDto,
  UpdateCommentDto,
  MemberDto,
  InviteMemberReq,
  UpdateMemberReq,
  InviteCreateReq,
  InviteDto,
  InviteInfoDto,
  AcceptInviteReq,
  AuditEntryDto,
  WorkspaceDto,
  AccountStatus,
  CompanyAccountDto,
  LibraryHealthDto,
  TrainRunBody,
  GuideHealthDto,
  PlatformAccountDetailDto,
  PlatformAccountDto,
  PlatformAuditDto,
  PlatformSystemDto,
  CompanySystemDto,
  PartnerProfileDto,
  PartnerConsoleDto,
  PartnerReportsDto,
  NotificationsDto,
  OfficialDto,
  NotesDto,
  NoteStepDto,
  MyNotesDto,
  NoteInput,
  AnchorCandidateDto,
  HelpRequestDto,
  PlatformMfaDto,
  PlatformSummaryDto,
  PlatformUserDto,
  ThemeChoiceDto,
  VersionSummaryDto,
  ListVersionsDto,
  GuideVersionDetailsDto,
  AssignedItemDto,
  AssignmentBoardDto,
  AssignTargetDto,
  CourseStateDto,
  LessonDto,
  DeviceDto,
  DevicePendingDto,
} from './contract'

export class DaliliApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** رمز الخطأ من الخادم (E-ORG-02، E-PUB-01…) حين يرسله */
    public code?: string,
  ) {
    super(message)
    this.name = 'DaliliApiError'
  }
}

interface ReqOpts {
  method?: string
  json?: unknown
  body?: BodyInit
  signal?: AbortSignal
}

/** عميل HTTP مطبوع — كل الفشل يُلقى برسالة عربية صادقة */
export class DaliliClient {
  constructor(private base = '') {}

  private async req<T>(path: string, opts: ReqOpts = {}): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.base + path, {
        method: opts.method ?? (opts.json !== undefined || opts.body !== undefined ? 'POST' : 'GET'),
        credentials: 'include',
        headers: opts.json !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
        signal: opts.signal,
      })
    } catch (err) {
      // الإلغاء قرار المتصل لا فشل شبكة — لا نكذب عليه برسالة اتصال
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      throw new DaliliApiError(0, 'تعذر الاتصال بالخادم — تأكد من تشغيله على المنفذ 8787')
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { errorAr?: string; code?: string } | null
      throw new DaliliApiError(res.status, body?.errorAr ?? `فشل الطلب (${res.status})`, body?.code)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  register(email: string, password: string) {
    return this.req<MeDto>('/api/auth/register', { json: { email, password } })
  }

  login(email: string, password: string) {
    return this.req<MeDto>('/api/auth/login', { json: { email, password } })
  }

  async logout() {
    await this.req<void>('/api/auth/logout', { method: 'POST' })
  }

  /** 401 → null (زائر)؛ فشل الشبكة يُلقى خطأً صادقًا */
  async me(): Promise<MeDto | null> {
    try {
      return await this.req<MeDto>('/api/auth/me')
    } catch (e) {
      if (e instanceof DaliliApiError && e.status === 401) return null
      throw e
    }
  }

  async uploadBlob(blob: Blob, filename = 'shot.jpg'): Promise<{ fileId: string; thumbFileId?: string; fileUrl: string; thumbUrl?: string }> {
    const fd = new FormData()
    fd.append('file', blob, filename)
    return this.req<{ fileId: string; thumbFileId?: string; fileUrl: string; thumbUrl?: string }>('/api/uploads', { body: fd })
  }

  listGuides(query: Partial<ListGuidesQuery> = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
    const suffix = qs.size > 0 ? `?${qs.toString()}` : ''
    return this.req<ListGuidesDto>(`/api/guides${suffix}`, { signal })
  }

  listFolders(signal?: AbortSignal) {
    return this.req<FolderDto[]>('/api/folders', { signal })
  }

  /** المرحلة ب (الهوم): اسم المساحة ودوري والعدادات وأعلى المواقع — نداء واحد للشريط والإحصاءات */
  libraryOverview(signal?: AbortSignal) {
    return this.req<LibraryOverviewDto>('/api/library/overview', { signal })
  }

  /** مزامنة الثيم: كتابة الاختيار على الخادم — الامتداد يقرؤه عند إقلاعه التالي */
  async setMyTheme(theme: ThemeChoiceDto) {
    return this.req<{ myTheme: ThemeChoiceDto }>('/api/me/theme', { method: 'PUT', json: { theme } })
  }

  /** مزامنة اللغة (I18N-01): مرآة setMyTheme — واجهة كل مستخدم تتبع حسابه */
  async setMyLocale(locale: 'ar' | 'en') {
    return this.req<{ myLocale: 'ar' | 'en' }>('/api/me/locale', { method: 'PUT', json: { locale } })
  }

  /** م١: «نسيت كلمة المرور» — الرد واحد لكل بريد */
  forgotPassword(email: string) {
    return this.req<{ ok: true }>('/api/auth/forgot', { method: 'POST', json: { email } })
  }

  /** م١: كلمة مرور جديدة برمز البريد — لمرة واحدة */
  resetPassword(token: string, password: string) {
    return this.req<{ ok: true }>('/api/auth/reset', { method: 'POST', json: { token, password } })
  }

  /** م١: الاسم الظاهر للزملاء */
  updateProfile(name: string) {
    return this.req<{ name: string }>('/api/me/profile', { method: 'PUT', json: { name } })
  }

  /** م١: يتطلب الحالية، ويُنهي الجلسات الأخرى */
  changePassword(current: string, next: string) {
    return this.req<{ ok: true }>('/api/me/password', { method: 'PUT', json: { current, next } })
  }

  /** TRNS-01: توليد/تجديد الترجمة الإنجليزية — الخادم يعيد الدليل محدثًا */
  translateGuide(id: string) {
    return this.req<{ guide: GuideDto }>(`/api/guides/${id}/translate`, { method: 'POST', json: { locale: 'en' } })
  }

  /** المرحلة ج (أنشئ بواسطي + التقارير): التقرير المجمّع لأدلتي — شريط أعلى الشاشة */
  myReport(signal?: AbortSignal) {
    return this.req<MineReportDto>('/api/reports/mine', { signal })
  }

  /** ASG: إسناد الدليل/الكرّاسة لأهداف متعددة بملاحظة اختيارية */
  assignGuide(id: string, targets: AssignTargetDto[], note?: string) {
    return this.req<{ created: number }>(`/api/guides/${id}/assign`, { json: { targets, note } })
  }

  deleteAssignment(assignmentId: string) {
    return this.req<void>(`/api/assignments/${assignmentId}`, { method: 'DELETE' })
  }

  /** ASG: «أُسند إليّ» — يحلّ (أنا/فريقي/المساحة) مع حالتي */
  listAssigned(signal?: AbortSignal) {
    return this.req<AssignedItemDto[]>('/api/assigned', { signal })
  }

  /** ASG: يضبط opened تلقائيًا؛ done=true/false يبدّل الإتمام */
  setAssignmentProgress(assignmentId: string, done?: boolean) {
    return this.req<{ openedAt: string; doneAt: string | null }>(`/api/assignments/${assignmentId}/progress`, {
      method: 'POST',
      json: done === undefined ? {} : { done },
    })
  }

  /** ASG: لوحة المُسنِد بالأسماء لدليل بعينه */
  guideAssignments(id: string, signal?: AbortSignal) {
    return this.req<AssignmentBoardDto>(`/api/guides/${id}/assignments`, { signal })
  }

  /** د١: حالة الدورة لي — 404 حين لا تكون مُسندة إليّ */
  courseState(guideId: string, signal?: AbortSignal) {
    return this.req<CourseStateDto>(`/api/courses/${guideId}`, { signal })
  }

  /** د١ب: الدرس الواحد جاهزاً للمشغّل */
  courseLesson(courseId: string, lessonId: string, signal?: AbortSignal) {
    return this.req<LessonDto>(`/api/courses/${courseId}/lessons/${lessonId}`, { signal })
  }

  /** د١: أنهيتُ عنصراً من الدورة (الدليل نفسه أو مضمّناً فيها) */
  markCourseItem(guideId: string, itemId: string) {
    return this.req<CourseStateDto>(`/api/courses/${guideId}/items`, { json: { itemId } })
  }

  async createFolder(name: string) {
    return this.req<FolderDto>('/api/folders', { json: { name } })
  }

  async renameFolder(id: string, name: string) {
    return this.req<FolderDto>(`/api/folders/${id}`, { method: 'PATCH', json: { name } })
  }

  async deleteFolder(id: string) {
    await this.req<void>(`/api/folders/${id}`, { method: 'DELETE' })
  }

  async updateGuideMeta(id: string, meta: { folderId?: string | null; starred?: boolean; tags?: string[]; visibility?: 'private' | 'workspace'; ownerTeamId?: string | null }) {
    return this.req<GuideSummaryDto>(`/api/guides/${id}/meta`, { method: 'PATCH', json: meta })
  }

  /** ت (§٥): «قرأت هذا الدليل» — من العارض وقارئ اللوحة فقط، فيُحسب في 👁 وتختفي «جديد» و«تحديث» */
  markGuideRead(id: string) {
    return this.req<void>(`/api/guides/${id}/read`, { method: 'POST' })
  }

  /** ث٢: نتائج تدريب منتهٍ — الموظف المسجّل عبر الدليل فتُعرف شركته، والضيف برمز المشاركة */
  sendTrainRun(guideId: string, body: TrainRunBody) {
    return this.req<void>(`/api/guides/${guideId}/train-runs`, { json: body })
  }

  sendSharedTrainRun(token: string, body: TrainRunBody) {
    return this.req<void>(`/api/share/${token}/train-runs`, { json: body })
  }

  /** ث٢: هل الدليل معطوب، وأي خطوة، ومنذ متى، وفي كم شركة — لمن يحرّره */
  guideHealth(id: string, signal?: AbortSignal) {
    return this.req<GuideHealthDto>(`/api/guides/${id}/health`, { signal })
  }

  // ——— ب: النشر والإيقاف والتوثيق والتثبيت ———

  /** النشر الأول و«انشر التحديث» معاً — يجمّد المسودة الحالية لتصير ما يراه القارئ */
  publishGuide(id: string) {
    return this.req<{ ok: true; publishedVersionId: string }>(`/api/guides/${id}/publish`, { method: 'POST' })
  }

  suspendGuide(id: string, reason: string) {
    return this.req<{ ok: true }>(`/api/guides/${id}/suspend`, { method: 'POST', json: { reason } })
  }

  // ——— هـ ج١: «ما هذا؟» — شروح الأزرار —

  /** شروح النظام كما تراها الشركة، وهل لها شريك يُسأل */
  notes(site: string, signal?: AbortSignal) {
    return this.req<NotesDto>(`/api/notes?site=${encodeURIComponent(site)}`, { signal })
  }

  /** مراسي خطوات الأدلة المنشورة المقروءة في هذا النظام */
  noteSteps(site: string, signal?: AbortSignal) {
    return this.req<NoteStepDto[]>(`/api/notes/steps?site=${encodeURIComponent(site)}`, { signal })
  }

  /** لوحة الشريك: شروحه وأدلته الرسمية وعملاؤه على هذا النظام */
  myNotes(site: string, signal?: AbortSignal) {
    return this.req<MyNotesDto>(`/api/notes/mine?site=${encodeURIComponent(site)}`, { signal })
  }

  createNote(input: NoteInput) {
    return this.req<{ id: string }>('/api/notes', { json: input })
  }

  updateNote(id: string, input: Omit<NoteInput, 'systemId' | 'anchor' | 'screenKey' | 'label'>) {
    return this.req<{ id: string }>(`/api/notes/${id}`, { method: 'PATCH', json: input })
  }

  /** طلب شرح زر لا شرح له — يصل الشريك باسم الشركة والعدد */
  requestHelp(input: { site: string; screenKey: string; anchor: AnchorCandidateDto[]; label: string }) {
    return this.req<{ ok: true }>('/api/help-requests', { json: input })
  }

  /** قائمة طلبات الشرح للشريك */
  helpRequests(signal?: AbortSignal) {
    return this.req<HelpRequestDto[]>('/api/help-requests', { signal })
  }

  resumeGuide(id: string) {
    return this.req<{ ok: true }>(`/api/guides/${id}/resume`, { method: 'POST' })
  }

  verifyGuide(id: string) {
    return this.req<{ ok: true }>(`/api/guides/${id}/verify`, { method: 'POST' })
  }

  unverifyGuide(id: string) {
    return this.req<{ ok: true }>(`/api/guides/${id}/verify`, { method: 'DELETE' })
  }

  pinGuide(id: string) {
    return this.req<{ ok: true }>(`/api/guides/${id}/pin`, { method: 'POST' })
  }

  unpinGuide(id: string) {
    return this.req<{ ok: true }>(`/api/guides/${id}/pin`, { method: 'DELETE' })
  }

  getLibraryHealth(signal?: AbortSignal) {
    return this.req<LibraryHealthDto>('/api/team/library-health', { signal })
  }

  duplicateGuide(id: string) {
    return this.req<{ id: string }>(`/api/guides/${id}/duplicate`, { method: 'POST' })
  }

  async restoreGuide(id: string) {
    return this.req<GuideSummaryDto>(`/api/guides/${id}/restore`, { method: 'POST' })
  }

  createGuide(guide: GuideDto) {
    return this.req<{ id: string }>('/api/guides', { json: { guide } })
  }

  /** CAP-17: إضافة خطوات ملتقطة لدليل قائم — بالإدراج في موضع محدد أو النهاية */
  appendSteps(id: string, steps: StepDto[], insertAt?: number) {
    return this.req<{ id: string; stepCount: number }>(`/api/guides/${id}/steps`, {
      json: { steps, insertAt },
    })
  }

  getGuide(id: string, signal?: AbortSignal) {
    return this.req<GuideDetailsDto>(`/api/guides/${id}`, { signal })
  }

  async updateGuide(id: string, guide: GuideDto) {
    await this.req<void>(`/api/guides/${id}`, { method: 'PATCH', json: { guide } })
  }

  async deleteGuide(id: string, opts: { permanent?: boolean } = {}) {
    const suffix = opts.permanent ? '?permanent=1' : ''
    await this.req<void>(`/api/guides/${id}${suffix}`, { method: 'DELETE' })
  }

  /** VER-01: التقاط لقطة عند «تم» — الخادم يُسقط التكرار المتجاور فيرد 204 فنعيد null.
   *  الفشل غير الصامت (شبكة/خطأ صادق) يُلقى كـDaliliApiError برسالة عربية. */
  async createVersion(guideId: string): Promise<VersionSummaryDto | null> {
    const r = await this.req<VersionSummaryDto | undefined>(`/api/guides/${guideId}/versions`, { method: 'POST' })
    return r ?? null
  }

  /** VER-01: قائمة السجل — من الأحدث للأقدم، بلا حقل data (JSON قد يكون كبيرًا) */
  listVersions(guideId: string, signal?: AbortSignal) {
    return this.req<ListVersionsDto>(`/api/guides/${guideId}/versions`, { signal })
  }

  /** VER-01: تفاصيل نسخة كاملة — الشكل يمرّ عبر عارض القراءة القائم بلا فرع خاص */
  getVersion(guideId: string, versionId: string, signal?: AbortSignal) {
    return this.req<GuideVersionDetailsDto>(`/api/guides/${guideId}/versions/${versionId}`, { signal })
  }

  createShare(id: string) {
    return this.req<ShareInfoDto>(`/api/guides/${id}/share`, { method: 'POST' })
  }

  /** VOX-05: يفرّغ صوت الدليل لكل خطوة — بلا apply اقتراحات (زر المحرر)، ومع apply تُملأ
   *  الملاحظات الفارغة خادميًا (الوضع التلقائي بعد النشر — قرار المالك 2026-08-30). الفشل يُلقى برسالة عربية */
  transcribeGuide(id: string, opts: { apply?: boolean; signal?: AbortSignal } = {}) {
    return this.req<TranscribeResultDto>(`/api/guides/${id}/transcribe`, {
      method: 'POST',
      json: { apply: opts.apply ?? false },
      signal: opts.signal,
    })
  }

  /** VOX-09: تفريغ تعليقات الخطوات الصوتية (ميك الخطوة) — يملأ الملاحظة الفارغة ويُلحق
   *  أسفل المكتوبة، ولا يمس صوتًا ولا نصًا أبدًا. كل خطوة بنتيجتها بصدق */
  transcribeSteps(id: string, signal?: AbortSignal) {
    return this.req<TranscribeStepsResultDto>(`/api/guides/${id}/transcribe-steps`, { method: 'POST', signal })
  }

  /** VIEW-06: عدّاد مشاهدات مجمّع — نداء ناري من العارض العام بعد تحميل ناجح */
  trackShareView(token: string) {
    return this.req<void>(`/api/share/${token}/view`, { method: 'POST' })
  }

  async revokeShare(id: string) {
    await this.req<void>(`/api/guides/${id}/share`, { method: 'DELETE' })
  }

  publicGuide(token: string, signal?: AbortSignal) {
    return this.req<PublicGuideDto>(`/api/share/${token}`, { signal })
  }

  search(
    params: { q: string; limit?: number; from?: string; to?: string; shared?: boolean; folder?: string; site?: string },
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams({ q: params.q })
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.from !== undefined) qs.set('from', params.from)
    if (params.to !== undefined) qs.set('to', params.to)
    if (params.shared !== undefined) qs.set('shared', String(params.shared))
    if (params.folder !== undefined) qs.set('folder', params.folder)
    if (params.site !== undefined) qs.set('site', params.site)
    return this.req<SearchResponseDto>(`/api/search?${qs.toString()}`, { signal })
  }

  searchSuggest(q: string, signal?: AbortSignal) {
    return this.req<SearchResponseDto>(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal })
  }

  /** SRCH-04: شارة الاكتشاف — أدلة المالك على نطاق التبويب النشط، مرتّبة بالشاشة ثم الموقع */
  discover(site: string, screen?: string, signal?: AbortSignal) {
    const q = screen ? `&screen=${encodeURIComponent(screen)}` : ''
    return this.req<DiscoverResponseDto>(`/api/discover?site=${encodeURIComponent(site)}${q}`, { signal })
  }

  // ——— GM-05: تعليقات الخطوات ——

  /** تعليقات دليل من رابط المشاركة — للضيف في العارض العام */
  shareComments(token: string, signal?: AbortSignal) {
    return this.req<CommentsResponseDto>(`/api/share/${token}/comments`, { signal })
  }

  /** ضيف يعلّق عبر رابط المشاركة — بلا حساب، الاسم اختياري */
  addShareComment(token: string, input: CreateCommentDto) {
    return this.req<CommentResponseDto>(`/api/share/${token}/comments`, { json: input })
  }

  /** تعليقات دليل المالك — للمحرر حيث يردّ ويوسم محلولًا */
  guideComments(id: string, signal?: AbortSignal) {
    return this.req<CommentsResponseDto>(`/api/guides/${id}/comments`, { signal })
  }

  /** المالك يعلّق/يردّ من المحرر — يظهر بعلامة «صاحب الدليل» */
  addGuideComment(id: string, input: CreateCommentDto) {
    return this.req<CommentResponseDto>(`/api/guides/${id}/comments`, { json: input })
  }

  updateGuideComment(id: string, commentId: string, patch: UpdateCommentDto) {
    return this.req<CommentResponseDto>(`/api/guides/${id}/comments/${commentId}`, {
      method: 'PATCH',
      json: patch,
    })
  }

  async deleteGuideComment(id: string, commentId: string) {
    await this.req<void>(`/api/guides/${id}/comments/${commentId}`, { method: 'DELETE' })
  }

  // ——— إدارة الفريق (Team Management) ——

  getTeamMembers() {
    return this.req<MemberDto[]>('/api/team')
  }

  inviteMember(input: InviteMemberReq) {
    return this.req<MemberDto>('/api/team', { method: 'POST', json: input })
  }

  updateMember(userId: string, patch: UpdateMemberReq) {
    return this.req<MemberDto>(`/api/team/${userId}`, { method: 'PATCH', json: patch })
  }

  async removeMember(userId: string) {
    await this.req<void>(`/api/team/${userId}`, { method: 'DELETE' })
  }

  // ——— الفرق ككيان (المرحلة د — WS-08، ترحيل 0010) ——

  /** الأقسام الحية — includeArchived يضم المؤرشفة (لوحة الأقسام وحدها تحتاجها) */
  listTeams(signal?: AbortSignal, includeArchived = false) {
    return this.req<TeamDto[]>(`/api/team/teams${includeArchived ? '?all=1' : ''}`, { signal })
  }

  async createTeam(name: string, parentId: string | null = null) {
    return this.req<TeamDto>('/api/team/teams', { json: { name, parentId } })
  }

  async updateTeam(id: string, patch: { name?: string; parentId?: string | null }) {
    return this.req<TeamDto>(this.teamPath(id), { method: 'PATCH', json: patch })
  }

  /** ORG-01: الأرشفة هي الطريق العادي — 409 E-ORG-01 إن بقي فيه أعضاء أو فروع */
  async archiveTeam(id: string) {
    return this.req<TeamDto>(this.teamPath(id, '/archive'), { method: 'POST' })
  }

  async unarchiveTeam(id: string) {
    return this.req<TeamDto>(this.teamPath(id, '/unarchive'), { method: 'POST' })
  }

  /** ORG-02: يستبدل قائمة مدراء القسم كاملة */
  async setTeamManagers(id: string, userIds: string[]) {
    return this.req<TeamDto>(this.teamPath(id, '/managers'), { method: 'PUT', json: { userIds } })
  }

  /** حذف فعلي لقسم فارغ تماماً فقط (أُنشئ خطأً) — غيره 409 ويُؤرشف */
  async deleteTeam(id: string) {
    await this.req<void>(this.teamPath(id), { method: 'DELETE' })
  }

  private teamPath(id: string, suffix = '') {
    return `/api/team/teams/${encodeURIComponent(id)}${suffix}`
  }

  // ——— دعوات المساحة (WS-01) — رابط يُرسل واتساب، بلا SMTP ——

  createInvite(input: InviteCreateReq) {
    return this.req<InviteDto>('/api/team/invites', { method: 'POST', json: input })
  }

  /** علنًا بلا جلسة — صفحة /invite/:token تقرأ به */
  getInvite(token: string) {
    return this.req<InviteInfoDto>(`/api/invites/${encodeURIComponent(token)}`)
  }

  /** علنًا بلا جلسة — يعيد جلسة العضو الجديد بكوكي */
  acceptInvite(token: string, input: AcceptInviteReq) {
    return this.req<{ id: string; email: string }>(`/api/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      json: input,
    })
  }

  /** ORG-00: حساب قائم مسجَّل الدخول ينضم بالدعوة — تصير مساحتها النشطة */
  joinInvite(token: string) {
    return this.req<{ workspaceId: string }>(`/api/invites/${encodeURIComponent(token)}/join`, { method: 'POST' })
  }

  // ——— المساحات (ORG-00) والتعطيل (ORG-07) والسجل (ORG-08) ——

  // ——— م٢: لوحة الشركة ———

  getCompanyAccount(signal?: AbortSignal) {
    return this.req<CompanyAccountDto>('/api/team/account', { signal })
  }

  renameCompanyAccount(name: string) {
    return this.req<CompanyAccountDto>('/api/team/account', { method: 'PATCH', json: { name } })
  }

  // ——— م٢: إدارة المنصة (PLATFORM_ADMINS + تحقق بخطوتين) ———

  platformMfa(signal?: AbortSignal) {
    return this.req<PlatformMfaDto>('/api/platform/mfa', { signal })
  }

  platformVerifyMfa(code: string) {
    return this.req<{ ok: true }>('/api/platform/mfa', { method: 'POST', json: { code } })
  }

  platformSummary(signal?: AbortSignal) {
    return this.req<PlatformSummaryDto>('/api/platform/summary', { signal })
  }

  platformAccounts(filters: { kind?: string; status?: string; q?: string }, signal?: AbortSignal) {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()
    return this.req<PlatformAccountDto[]>(`/api/platform/accounts${qs ? `?${qs}` : ''}`, { signal })
  }

  platformCreateAccount(input: { kind: 'company' | 'partner'; name: string; adminEmail: string; note?: string }) {
    return this.req<{ account: PlatformAccountDto; invite: { inviteUrl: string; emailed: boolean } }>('/api/platform/accounts', { method: 'POST', json: input })
  }

  platformAccount(id: string, signal?: AbortSignal) {
    return this.req<PlatformAccountDetailDto>(`/api/platform/accounts/${encodeURIComponent(id)}`, { signal })
  }

  platformUpdateAccount(id: string, patch: { name?: string; note?: string }) {
    return this.req<PlatformAccountDto>(`/api/platform/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch })
  }

  platformSetStatus(id: string, status: AccountStatus, reason?: string) {
    return this.req<PlatformAccountDto>(`/api/platform/accounts/${encodeURIComponent(id)}/status`, { method: 'POST', json: { status, reason } })
  }

  platformAdminInvite(id: string, email: string) {
    return this.req<{ inviteUrl: string; emailed: boolean }>(`/api/platform/accounts/${encodeURIComponent(id)}/admin-invite`, { method: 'POST', json: { email } })
  }

  platformUser(email: string, signal?: AbortSignal) {
    return this.req<PlatformUserDto>(`/api/platform/users?email=${encodeURIComponent(email)}`, { signal })
  }

  platformResetLink(userId: string) {
    return this.req<{ ok: true }>(`/api/platform/users/${encodeURIComponent(userId)}/reset-link`, { method: 'POST' })
  }

  platformEndSessions(userId: string) {
    return this.req<{ ok: true }>(`/api/platform/users/${encodeURIComponent(userId)}/end-sessions`, { method: 'POST' })
  }

  platformAudit(signal?: AbortSignal) {
    return this.req<PlatformAuditDto[]>('/api/platform/audit', { signal })
  }

  // ج١: الأنظمة — المنصة تعرّفها بنطاقاتها ومقدّميها، والشركة تختار أنظمتها وشريكها
  platformSystems(signal?: AbortSignal) {
    return this.req<PlatformSystemDto[]>('/api/platform/systems', { signal })
  }

  platformCreateSystem(input: { name: string; domains: string[] }) {
    return this.req<PlatformSystemDto>('/api/platform/systems', { method: 'POST', json: input })
  }

  platformUpdateSystem(id: string, patch: { name?: string; domains?: string[]; hidden?: boolean }) {
    return this.req<PlatformSystemDto>(`/api/platform/systems/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch })
  }

  platformAddProvider(id: string, partnerId: string) {
    return this.req<PlatformSystemDto>(`/api/platform/systems/${encodeURIComponent(id)}/providers`, { method: 'POST', json: { partnerId } })
  }

  platformRemoveProvider(id: string, partnerId: string) {
    return this.req<PlatformSystemDto>(`/api/platform/systems/${encodeURIComponent(id)}/providers/${encodeURIComponent(partnerId)}`, { method: 'DELETE' })
  }

  platformUploadSystemLogo(id: string, file: Blob) {
    const fd = new FormData()
    fd.append('file', file, 'logo')
    return this.req<PlatformSystemDto>(`/api/platform/systems/${encodeURIComponent(id)}/logo`, { body: fd })
  }

  // ش١: لوحة الشريك — الملف العام، والشعار، وأنظمته وعملاؤه، ونظام الدليل الرسمي وجمهوره
  partnerConsole(signal?: AbortSignal) {
    return this.req<PartnerConsoleDto>('/api/admin/partner', { signal })
  }

  /** ش٢: «أوقف الخدمة لهذه الشركة» لنظام — يعيد لوحة الشريك بعدها */
  stopPartnerService(companyId: string, systemId: string) {
    return this.req<PartnerConsoleDto>(`/api/admin/partner/clients/${encodeURIComponent(companyId)}/${encodeURIComponent(systemId)}/stop`, { method: 'POST' })
  }

  partnerReports(signal?: AbortSignal) {
    return this.req<PartnerReportsDto>('/api/admin/partner/reports', { signal })
  }

  /** ش٢: الجرس في المساحة النشطة */
  notifications(signal?: AbortSignal) {
    return this.req<NotificationsDto>('/api/notifications', { signal })
  }

  /** بلا ids يُعلَّم الكل مقروءاً */
  markNotificationsRead(ids?: string[]) {
    return this.req<void>('/api/notifications/read', { method: 'POST', json: ids ? { ids } : {} })
  }

  partnerProfile(signal?: AbortSignal) {
    return this.req<PartnerProfileDto>('/api/admin/profile', { signal })
  }

  updatePartnerProfile(patch: { description?: string; website?: string }) {
    return this.req<PartnerProfileDto>('/api/admin/profile', { method: 'PATCH', json: patch })
  }

  uploadPartnerLogo(file: Blob) {
    const fd = new FormData()
    fd.append('file', file, 'logo')
    return this.req<PartnerProfileDto>('/api/admin/profile/logo', { body: fd })
  }

  updateOfficial(id: string, patch: { official?: boolean; systemId?: string; audience?: 'all' | 'listed'; companyIds?: string[] }) {
    return this.req<{ official: OfficialDto }>(`/api/guides/${encodeURIComponent(id)}/official`, { method: 'PATCH', json: patch })
  }

  companySystems(signal?: AbortSignal) {
    return this.req<CompanySystemDto[]>('/api/admin/systems', { signal })
  }

  companyAddSystem(id: string) {
    return this.req<CompanySystemDto>(`/api/admin/systems/${encodeURIComponent(id)}`, { method: 'POST' })
  }

  companyRemoveSystem(id: string) {
    return this.req<CompanySystemDto>(`/api/admin/systems/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  companyChoosePartner(id: string, partnerId: string | null) {
    return this.req<CompanySystemDto>(`/api/admin/systems/${encodeURIComponent(id)}/partner`, { method: 'PUT', json: { partnerId } })
  }

  companyAddDomain(id: string, domain: string) {
    return this.req<CompanySystemDto>(`/api/admin/systems/${encodeURIComponent(id)}/domains`, { method: 'POST', json: { domain } })
  }

  companyRemoveDomain(id: string, domain: string) {
    return this.req<CompanySystemDto>(`/api/admin/systems/${encodeURIComponent(id)}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' })
  }

  listMyWorkspaces(signal?: AbortSignal) {
    return this.req<WorkspaceDto[]>('/api/me/workspaces', { signal })
  }

  switchWorkspace(workspaceId: string) {
    return this.req<{ workspaceId: string }>('/api/me/workspace', { method: 'PUT', json: { workspaceId } })
  }

  deactivateMember(userId: string) {
    return this.req<MemberDto>(`/api/team/${encodeURIComponent(userId)}/deactivate`, { method: 'POST' })
  }

  reactivateMember(userId: string) {
    return this.req<MemberDto>(`/api/team/${encodeURIComponent(userId)}/reactivate`, { method: 'POST' })
  }

  listAudit(filters: { action?: string; before?: string } = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams()
    if (filters.action) qs.set('action', filters.action)
    if (filters.before) qs.set('before', filters.before)
    const q = qs.toString()
    return this.req<{ items: AuditEntryDto[] }>(`/api/audit${q ? `?${q}` : ''}`, { signal })
  }

  /** رابط تنزيل CSV — يُفتح مباشرة فيرسل المتصفح الكوكي */
  auditCsvUrl(action?: string) {
    return `${this.base}/api/audit.csv${action ? `?action=${encodeURIComponent(action)}` : ''}`
  }

  // ——— البوكمارك (WS-04) ——

  toggleBookmark(guideId: string) {
    return this.req<{ bookmarked: boolean }>(`/api/guides/${encodeURIComponent(guideId)}/bookmark`, {
      method: 'POST',
    })
  }

  // ——— DTOP-03: ربط الأجهزة (المتصفّح يوافق ويدير؛ الديسكتوب يطلب الرمز من Rust مباشرة) ——

  devicePending(code: string, signal?: AbortSignal) {
    return this.req<DevicePendingDto>(`/api/device/pending?code=${encodeURIComponent(code)}`, { signal })
  }

  deviceApprove(userCode: string, approve: boolean) {
    return this.req<{ ok: true }>('/api/device/approve', { json: { userCode, approve } })
  }

  listDevices(signal?: AbortSignal) {
    return this.req<DeviceDto[]>('/api/devices', { signal })
  }

  async revokeDevice(id: string) {
    await this.req<void>(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

}
