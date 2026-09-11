import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tldrawSync from './vite-plugin-tldraw-sync.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tldrawSync()],
})
