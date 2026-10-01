import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// الباكند الافتراضي 8787 (Node). للاختبار على لارافل المحلّي مرّر:
//   DALILI_API_TARGET=http://localhost:8790  (يضبطه مشغّل الطقم المحلّي)
const apiTarget = process.env.DALILI_API_TARGET || 'http://localhost:8787'
const webPort = Number(process.env.DALILI_WEB_PORT || 5174)

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      '/api': apiTarget,
      '/files': apiTarget,
    },
  },
})
