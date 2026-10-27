import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://sdshreyas.github.io/meesho/
export default defineConfig({
  base: '/meesho/',
  plugins: [react()],
})
