import type { AssignedItemDto, CourseStateDto } from '@dalili/shared'

/** د١: بيانات اختبار مشتركة لبطاقة الدورة — كرّاسة بدليلين مُسندة لم تبدأ */
export const course = (over: Partial<CourseStateDto> = {}): CourseStateDto => ({
  guideId: 'bk', title: 'فواتير المبيعات', kind: 'booklet',
  items: [
    { id: 'gA', title: 'فاتورة مبدئية', done: false, type: 'guide', minutes: 1 },
    { id: 'gB', title: 'تحصيل دفعة', done: false, type: 'guide', minutes: 1 },
  ],
  itemsDone: 0, minutes: 20, nextItemId: 'gA', completedAt: null, ...over,
})

export const assignedItem = (over: Partial<AssignedItemDto> = {}): AssignedItemDto => ({
  assignmentId: 'a1', guideId: 'bk', title: 'فواتير المبيعات', kind: 'booklet', site: 'erp.example', stepCount: 5,
  assignerEmail: 'mgr@x.sa', note: 'ابدأ بها', createdAt: '2026-09-10T00:00:00Z', openedAt: null, doneAt: null,
  course: course(), ...over,
})
