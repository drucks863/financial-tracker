// Turns the single-file Vite build into the page fragment a claude.ai artifact expects
// (the artifact host supplies <!doctype>, <html>, <head> and <body> itself).
import { readFileSync, writeFileSync } from 'node:fs'

const [src = 'dist-preview/index.html', out = 'dist-preview/artifact.html'] = process.argv.slice(2)
const html = readFileSync(src, 'utf8')
// The inlined bundle itself contains strings like "<body>", so locate the real tags
// from the end of the document rather than with a greedy regex.
const bodyOpen = html.lastIndexOf('<body>')
const headClose = html.lastIndexOf('</head>', bodyOpen)
const head = html.slice(html.indexOf('<head>') + 6, headClose)
const body = html.slice(bodyOpen + 6, html.lastIndexOf('</body>'))
const keep = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .trim()
const title = keep.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? ''
const rest = keep.replace(title, '')
// title first so it lands in the first 8KB; scripts after the mount point
const scripts = [...rest.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0])
const nonScripts = scripts.reduce((s, sc) => s.replace(sc, ''), rest)
writeFileSync(out, `${title}\n${nonScripts.trim()}\n${body.trim()}\n${scripts.join('\n')}\n`)
console.log(`wrote ${out}`)
