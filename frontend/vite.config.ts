import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Real figures live in src/data/seed.local.json (gitignored). Without it the app
// starts from generated sample data, which is what the public repo carries.
const localSeed = fileURLToPath(new URL('./src/data/seed.local.json', import.meta.url))
const sampleSeed = fileURLToPath(new URL('./src/data/seed.sample.json', import.meta.url))

// `npm run build:server` (the build bundled into the Spring Boot jar) always uses the sample seed: the
// jar gets its data from the API, and real figures must never end up inside a deployable artifact.
const seedFor = (mode: string) => (mode !== 'server' && existsSync(localSeed) ? localSeed : sampleSeed)

// `npm run build` produces a normal multi-file build for hosting (S3/CloudFront later).
// `npm run build:preview` inlines everything into one HTML file for the shareable prototype.
export default defineConfig(({ mode }) => ({
  plugins: [vue(), ...(mode === 'preview' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@seed': seedFor(mode) } },
  // `npm run dev` proxies /api to the Spring Boot API (`./gradlew :backend:bootRun`, port 8080),
  // and the sign-in paths too, for running the backend with Google sign-in locally
  server: {
    proxy: Object.fromEntries(['/api', '/oauth2', '/login', '/logout'].map((path) => [path, 'http://localhost:8080']))
  },
  build: {
    outDir: mode === 'preview' ? 'dist-preview' : 'dist',
    assetsInlineLimit: mode === 'preview' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000
  }
}))
