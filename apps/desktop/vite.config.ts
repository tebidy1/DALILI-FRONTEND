import { defineConfig } from 'vite'

// قشرة Tauri: منفذ ثابت يعرفه tauri.conf.json (devUrl). لا وكيل /api في ٣أ — لا شبكة بعد.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
})
