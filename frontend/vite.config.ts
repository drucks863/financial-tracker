import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Real figures live in src/data/seed.local.json (gitignored). Without it the app
// starts from generated sample data, which is what the public repo carries.
const localSeed = fileURLToPath(new URL('./src/data/seed.local.json', import.meta.url))
const seed = existsSync(localSeed) ? localSeed : fileURLToPath(new URL('./src/data/seed.sample.json', import.meta.url))

// `npm run build` produces a normal multi-file build for hosting (S3/CloudFront later).
// `npm run build:preview` inlines everything into one HTML file for the shareable prototype.
export default defineConfig(({ mode }) => ({
  plugins: [vue(), ...(mode === 'preview' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@seed': seed } },
  // the Spring Boot API will run on 8080 during local development
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: {
    outDir: mode === 'preview' ? 'dist-preview' : 'dist',
    assetsInlineLimit: mode === 'preview' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000
  }
}))
