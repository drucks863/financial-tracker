// Renders the PNG app icons in public/ from the SVG sources in icons/ (and public/favicon.svg).
// Run after changing an icon. Needs Playwright's Chromium, which isn't a
// project dependency: install it globally (`npm i -g playwright && npx playwright install chromium`), then
// `NODE_PATH=$(npm root -g) node scripts/make-icons.ts`.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// require (not import) so NODE_PATH can find a global Playwright
const { chromium } = createRequire(import.meta.url)('playwright')

const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url))

const outputs: { source: string; size: number; out: string }[] = [
  { source: 'public/favicon.svg', size: 32, out: 'public/favicon-32.png' },
  { source: 'icons/app-icon.svg', size: 180, out: 'public/apple-touch-icon.png' },
  { source: 'icons/app-icon.svg', size: 192, out: 'public/icon-192.png' },
  { source: 'icons/app-icon.svg', size: 512, out: 'public/icon-512.png' },
  { source: 'icons/app-icon-maskable.svg', size: 512, out: 'public/icon-maskable-512.png' }
]

const browser = await chromium.launch()
for (const { source, size, out } of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const svg = readFileSync(path(source), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`)
  await page.screenshot({ path: path(out), omitBackground: true })
  await page.close()
  console.log(`${out} (${size}px)`)
}
await browser.close()
