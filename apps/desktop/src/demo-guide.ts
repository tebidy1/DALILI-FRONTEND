import { assembleGuide } from '@dalili/core'

/**
 * دليل تجريبي بخطوة ديسكتوب واحدة — يُبنى عبر النواة لا في Rust (القاعدة الذهبيّة).
 * أسماء الحقول مطابقة لعقد `zStepSource` في `@dalili/shared` حرفيًّا:
 * `processName` · `windowTitle` · `appId`.
 */
export function buildDemoDesktopGuide() {
  return assembleGuide([
    {
      kind: 'click',
      target: { text: 'حفظ' },
      source: {
        kind: 'desktop',
        processName: 'EXCEL.EXE',
        windowTitle: 'Workbook1 - Excel',
        appId: 'app:EXCEL.EXE',
      },
      ts: 0,
    },
  ])
}
