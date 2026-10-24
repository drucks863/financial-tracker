import * as XLSX from 'xlsx'
import { state, monthTotals, yearGrid, yearsAvailable, netWorthSeries, categoriesOf } from '../store/finance'
import { MONTHS, MONTHS_LONG } from './format'

/* ================= saving files ================= */

// Inside a claude.ai artifact, files go through the viewer's `downloads` capability.
// Anywhere else (local dev, the real app) a plain blob link does the job.
export async function saveFile(filename, data) {
  const claude = window.claude
  if (claude?.use) {
    const downloads = await claude.use('downloads')
    if (downloads) {
      await downloads.save({ filename, data })
      return 'saved'
    }
    throw { code: 'unavailable', message: 'Downloads are not available in this view.' }
  }
  const blob = data instanceof Blob ? data : new Blob([data])
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'saved'
}

/* ================= export ================= */

const ENTRY_COLUMNS = ['Date', 'Type', 'Category', 'Subcategory', 'Description', 'Amount']
const TYPE_LABEL = { income: 'Income', expense: 'Expense', savings: 'Savings' }

function entryRows(filter = () => true) {
  return [...state.entries]
    .filter(filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.category.localeCompare(b.category))
    .map((e) => [e.date, TYPE_LABEL[e.type], e.category, e.subcategory, e.description, round2(e.amount)])
}
const round2 = (v) => Math.round(v * 100) / 100

export function entriesCsv(filter) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [ENTRY_COLUMNS, ...entryRows(filter)].map((r) => r.map(esc).join(',')).join('\n')
}

function gridSheet(type, year) {
  const g = yearGrid(type, year)
  const order = categoriesOf(type).map((c) => c.name)
  const rows = [[type === 'expense' ? 'Expenses' : 'Income', '', ...MONTHS, 'Total', 'Average']]
  const avg = (arr) => {
    const nz = arr.filter((v) => Math.abs(v) > 0.004)
    return nz.length ? round2(nz.reduce((a, b) => a + b, 0) / nz.length) : 0
  }
  for (const name of Object.keys(g).sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    const m = g[name].months.map(round2)
    rows.push([name, 'Monthly totals:', ...m, round2(m.reduce((a, b) => a + b, 0)), avg(m)])
    for (const [sub, sm] of Object.entries(g[name].subs)) {
      const r = sm.map(round2)
      rows.push(['', sub, ...r, round2(r.reduce((a, b) => a + b, 0)), avg(r)])
    }
    rows.push([])
  }
  return XLSX.utils.aoa_to_sheet(rows)
}

export function workbookBytes({ includeNetWorth = true } = {}) {
  const wb = XLSX.utils.book_new()
  const entries = XLSX.utils.aoa_to_sheet([ENTRY_COLUMNS, ...entryRows()])
  entries['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 11 }]
  XLSX.utils.book_append_sheet(wb, entries, 'Entries')

  const summary = [['Month', 'Income', 'Expenses', 'Essentials', 'Discretionary', 'Net', 'Saved & invested']]
  for (const y of yearsAvailable().sort()) {
    for (const r of monthTotals(y)) {
      if (!r.count) continue
      summary.push([`${MONTHS[r.month]} ${y}`, round2(r.income), round2(r.expense), round2(r.essential), round2(r.discretionary), round2(r.net), round2(r.saved)])
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  for (const y of yearsAvailable().sort()) {
    XLSX.utils.book_append_sheet(wb, gridSheet('expense', y), `Expenses ${y}`)
    XLSX.utils.book_append_sheet(wb, gridSheet('income', y), `Income ${y}`)
  }

  if (includeNetWorth) XLSX.utils.book_append_sheet(wb, netWorthSheet(), 'Net Worth')

  const cats = [['Type', 'Category', 'Subcategory', 'Essential']]
  for (const c of state.categories) for (const s of c.subcategories) cats.push([TYPE_LABEL[c.type], c.name, s, c.essential ? 'Yes' : ''])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cats), 'Categories')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function netWorthSheet() {
  const pts = netWorthSeries()
  const rows = [['Group', 'Account', ...pts.map((p) => p.date)]]
  for (const a of state.netWorth.accounts) rows.push([a.group, a.name, ...pts.map((p) => round2(p.values[a.id] || 0))])
  rows.push([])
  rows.push(['', 'Total assets', ...pts.map((p) => round2(p.assets))])
  rows.push(['', 'Total debt', ...pts.map((p) => round2(p.debt))])
  rows.push(['', 'Net worth', ...pts.map((p) => round2(p.total))])
  return XLSX.utils.aoa_to_sheet(rows)
}

export function netWorthCsv() {
  const sheet = netWorthSheet()
  return XLSX.utils.sheet_to_csv(sheet)
}

/* ================= import ================= */

async function readWorkbook(file) {
  const buf = await file.arrayBuffer()
  return XLSX.read(buf, { cellDates: true, type: 'array' })
}

const num = (v) => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const s = v.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
    if (s === '' || s === '-') return null
    const n = Number(s)
    return isFinite(n) ? n : null
  }
  return null
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const pad = (n) => String(n).padStart(2, '0')

function toIsoDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3] || 1)}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[1])}-${pad(m[2])}`
  const d = new Date(s)
  return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function typeOf(v, amount) {
  const t = norm(v)
  if (t.startsWith('inc')) return 'income'
  if (t.startsWith('sav') || t.startsWith('inv') || t.startsWith('trans')) return 'savings'
  if (t.startsWith('exp')) return 'expense'
  return amount < 0 ? 'income' : 'expense'
}

/**
 * Row-per-entry file (CSV or XLSX): Date, Type, Category, Subcategory, Description, Amount.
 * Header names are matched loosely; Type is optional (defaults to Expense).
 * Returns { entries, problems }.
 */
export async function parseEntriesFile(file) {
  const wb = await readWorkbook(file)
  const sheet = wb.Sheets[wb.SheetNames.find((n) => norm(n) === 'entries') || wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false })
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'date') && r.some((c) => norm(c) === 'amount'))
  if (headerIdx < 0) return { entries: [], problems: ['Could not find a header row with Date and Amount columns.'] }
  const head = rows[headerIdx].map(norm)
  const col = (...names) => head.findIndex((h) => names.includes(h))
  const c = {
    date: col('date', 'month'),
    type: col('type', 'kind'),
    category: col('category', 'cat'),
    sub: col('subcategory', 'sub', 'subcat'),
    desc: col('description', 'desc', 'merchant', 'payee', 'note', 'notes'),
    amount: col('amount', 'value', 'total')
  }
  const entries = []
  const problems = []
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const amount = num(r[c.amount])
    const date = toIsoDate(r[c.date])
    if (amount == null && !date) return
    if (amount == null || !date) {
      problems.push(`Row ${headerIdx + i + 2}: ${!date ? 'unreadable date' : 'missing amount'}, skipped`)
      return
    }
    const type = c.type >= 0 ? typeOf(r[c.type], amount) : 'expense'
    entries.push({
      date,
      type,
      category: String(r[c.category] ?? '').trim() || 'Uncategorized',
      subcategory: String(r[c.sub] ?? '').trim() || 'Other',
      description: c.desc >= 0 ? String(r[c.desc] ?? '').trim() : '',
      amount: type === 'income' ? Math.abs(amount) : amount
    })
  })
  return { entries, problems }
}

/**
 * A "Cash Flow 'YY" workbook in the Google Sheets layout: the Expenses and Income tabs hold
 * monthly totals per subcategory, and each month tab lists itemized entries under its
 * subcategory columns. Itemized rows are used where present; anything the month tabs
 * don't itemize is filled from the Expenses/Income totals so monthly totals always match.
 */
export async function parseCashFlowWorkbook(file, year) {
  const wb = await readWorkbook(file)
  const problems = []
  const get = (name) => wb.Sheets[wb.SheetNames.find((n) => norm(n) === norm(name))]
  const aoa = (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

  // 1) category trees + monthly truth from Expenses / Income tabs
  function readTree(name) {
    const sheet = get(name)
    if (!sheet) return null
    const rows = aoa(sheet)
    const cats = []
    let cur = null
    for (const r of rows) {
      const a = r[0]
      const c = r[2]
      if (a && c && String(c).toLowerCase().startsWith('monthly')) {
        cur = { name: String(a).trim(), subs: [], totals: {} }
        cats.push(cur)
      } else if (cur && c && !a && String(c).trim()) {
        const sub = String(c).trim()
        cur.subs.push(sub)
        cur.totals[sub] = Array.from({ length: 12 }, (_, i) => num(r[3 + i]) || 0)
      }
    }
    return cats
  }
  const expense = readTree('Expenses')
  const income = readTree('Income')
  if (!expense) return { entries: [], categories: [], problems: ['This workbook has no “Expenses” tab.'] }

  const entries = []
  const found = {}
  const findCat = (name) => expense.find((c) => norm(c.name) === norm(name) || norm(c.name).startsWith(norm(name).slice(0, 6)))

  // 2) itemized month tabs
  MONTHS_LONG.forEach((monthName, mi) => {
    const sheet = get(monthName)
    if (!sheet) return
    const rows = aoa(sheet)
    const heads = []
    rows.forEach((r, ri) => {
      if (ri < 17 || !r[0] || ['card', 'amazon'].includes(norm(r[0]))) return
      if (findCat(r[0])) heads.push(ri)
    })
    // top block: Auto Withdrawals (label in J, amount in K) and Savings (label in G, amount in H)
    const paid = (income || []).some((c) => Object.values(c.totals).some((t) => Math.abs(t[mi]) > 0.004))
    if (paid) {
      for (const r of rows.slice(0, 16)) {
        for (const [lc, vc, category] of [[9, 10, 'Auto withdrawals'], [6, 7, 'Savings']]) {
          const label = String(r[lc] ?? '').trim()
          const amt = num(r[vc])
          if (label && !/total/i.test(label) && amt)
            entries.push({ date: `${year}-${pad(mi + 1)}-01`, type: 'savings', category, subcategory: label, description: '', amount: amt })
        }
      }
    }
    heads.forEach((ri, hi) => {
      const cat = findCat(rows[ri][0])
      const end = heads[hi + 1] ?? rows.length
      const cols = rows[ri].map((v, ci) => (ci >= 2 && v ? ci : -1)).filter((ci) => ci >= 0)
      const paired = cols.length < 2 || cols[1] - cols[0] === 2
      if (!paired) return // single-column header rows (rent, subscriptions, utilities) only carry totals
      cols.forEach((ci, k) => {
        const label = String(rows[ri][ci]).trim()
        const sub = cat.subs.find((s) => norm(s) === norm(label)) || cat.subs[k] || cat.subs.at(-1)
        for (let rr = ri + 2; rr < end; rr++) {
          const d = rows[rr]?.[ci]
          const amt = num(rows[rr]?.[ci + 1])
          if (d && amt) {
            entries.push({ date: `${year}-${pad(mi + 1)}-01`, type: 'expense', category: cat.name, subcategory: sub, description: String(d).trim(), amount: amt })
            const key = `${cat.name}|${sub}|${mi}`
            found[key] = (found[key] || 0) + amt
          }
        }
      })
    })
  })

  // 3) fill the rest from monthly totals so every month matches the sheet
  for (const cat of expense) {
    for (const sub of cat.subs) {
      cat.totals[sub].forEach((t, mi) => {
        const diff = Math.round((t - (found[`${cat.name}|${sub}|${mi}`] || 0)) * 100) / 100
        if (Math.abs(diff) > 0.01)
          entries.push({ date: `${year}-${pad(mi + 1)}-01`, type: 'expense', category: cat.name, subcategory: sub, description: 'Monthly total', amount: diff })
      })
    }
  }
  for (const cat of income || []) {
    for (const sub of cat.subs) {
      cat.totals[sub].forEach((t, mi) => {
        if (Math.abs(t) > 0.004) entries.push({ date: `${year}-${pad(mi + 1)}-01`, type: 'income', category: cat.name, subcategory: sub, description: '', amount: t })
      })
    }
  }
  if (!income) problems.push('No “Income” tab found, so only expenses were read.')

  const categories = [
    ...expense.map((c) => ({ type: 'expense', name: c.name, subcategories: c.subs })),
    ...(income || []).map((c) => ({ type: 'income', name: c.name, subcategories: c.subs }))
  ]
  return { entries, categories, problems }
}

/**
 * The "Net Worth Tracker" tab: one row of month-end dates, then account rows
 * (name in column C) under section headings in column B.
 */
export async function parseNetWorthWorkbook(file) {
  const wb = await readWorkbook(file)
  const name = wb.SheetNames.find((n) => norm(n).includes('networth')) || wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })
  const dateRowIdx = rows.findIndex((r) => r.filter((v) => v instanceof Date || (typeof v === 'string' && toIsoDate(v) && /\d/.test(v))).length >= 2)
  if (dateRowIdx < 0) return { accounts: [], snapshots: [], problems: ['Could not find a row of dates.'] }
  const dateCols = rows[dateRowIdx]
    .map((v, ci) => ({ ci, date: v instanceof Date || typeof v === 'string' ? toIsoDate(v) : null }))
    .filter((d) => d.date && d.ci > 1)
  const sectionGroup = (label) => {
    const l = norm(label)
    if (l.startsWith('cash')) return 'Cash'
    if (l.startsWith('invest')) return 'Investments'
    if (l.startsWith('otherasset')) return 'Other assets'
    if (l.startsWith('debt')) return 'Debt'
    return null
  }
  let group = 'Cash'
  const accounts = []
  for (const r of rows.slice(dateRowIdx + 1)) {
    const g = sectionGroup(r[1])
    if (g) group = g
    const label = r[2]
    if (!label || /total|subtotal|net worth/i.test(String(r[1] ?? '') + label)) continue
    const values = Object.fromEntries(dateCols.map((d) => [d.date, num(r[d.ci]) || 0]))
    if (Object.values(values).some((v) => v !== 0)) accounts.push({ name: String(label).trim(), group, values })
  }
  return { accounts, dates: dateCols.map((d) => d.date), problems: accounts.length ? [] : ['No account rows with balances were found.'] }
}
