import { defineConfig } from 'vite'

export default defineConfig({
  base: '/digital-twin-drone/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})