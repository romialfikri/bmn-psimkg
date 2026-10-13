import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 3022,
    host: '0.0.0.0',
    proxy: {
      '/bmn/api': {
        target: 'http://localhost:8022',
        rewrite: (path) => path.replace(/^\/bmn/, '')
      },
      '/bmn/uploads': {
        target: 'http://localhost:8022',
        rewrite: (path) => path.replace(/^\/bmn/, '')
      },
      '/api': 'http://localhost:8022',
      '/uploads': 'http://localhost:8022'
    }
  },
  preview: {
    port: 3022,
    host: '0.0.0.0',
    proxy: {
      '/bmn/api': {
        target: 'http://localhost:8022',
        rewrite: (path) => path.replace(/^\/bmn/, '')
      },
      '/bmn/uploads': {
        target: 'http://localhost:8022',
        rewrite: (path) => path.replace(/^\/bmn/, '')
      },
      '/api': 'http://localhost:8022',
      '/uploads': 'http://localhost:8022'
    }
  }
})
