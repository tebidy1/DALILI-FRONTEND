import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/** تنظيف DOM بعد كل اختبار — بدل الاعتماد على globals المخفية */
afterEach(cleanup)
