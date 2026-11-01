// Reading files into entries and net worth snapshots: CSV/XLSX entry lists, the "Cash Flow 'YY"
// Google Sheets workbooks (every layout used since 2022) and the Net Worth tracker tab.
// Only depends on `xlsx`, so it runs in the browser and in `npm test` (plain Node).
import * as XLSX from 'xlsx'
import type { AccountGroup, EntryDraft, EntryType } from '../types'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface ParsedEntries {
  entries: EntryDraft[]
  categories?: { type: EntryType; name: string; subcategories: string[] }[]
  problems: string[]
}

export interface ParsedNetWorth {
  accounts: { name: string; group: AccountGroup; values: Record<string, number> }[]
  dates: string[]
  problems: string[]
}

/* ================= cell helpers ================= */

type Cell = string | number | boolean | Date | null | undefined
type Rows = Cell[][]

async function readWorkbook(file: Blob): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer()
  return XLSX.read(buffer, { cellDates: true, type: 'array' })
}
const sheetRows = (sheet: XLSX.WorkSheet): Rows => XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null })

const num = (v: Cell): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    // "53,20" is a typo for 53.20 (a comma followed by exactly two digits), not 5,320
    const decimalComma = /^\s*-?\$?\d+,\d{2}\s*$/.test(v)
    const s = (decimalComma ? v.replace(',', '.') : v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
    if (s === '' || s === '-') return null
    const n = Number(s)
    return isFinite(n) ? n : null
  }
  return null
}
const norm = (s: Cell): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (s: Cell): string => String(s ?? '').trim()
const pad = (n: number | string): string => String(n).padStart(2, '0')
const round2 = (v: number): number => Math.round(v * 100) / 100

function toIsoDate(v: Cell): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
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
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function typeOf(v: Cell, amount: number): EntryType {
  const t = norm(v)
  if (t.startsWith('inc')) return 'income'
  if (t.startsWith('exp')) return 'expense'
  return amount < 0 ? 'income' : 'expense'
}

/* ================= entries file ================= */

/**
 * Row-per-entry file (CSV or XLSX): Date, Type, Category, Subcategory, Description, Amount.
 * Header names are matched loosely; Type is optional (defaults to Expense).
 */
export async function parseEntriesFile(file: Blob): Promise<ParsedEntries> {
  const wb = await readWorkbook(file)
  const sheet = wb.Sheets[wb.SheetNames.find((n) => norm(n) === 'entries') || wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, blankrows: false })
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'date') && r.some((c) => norm(c) === 'amount'))
  if (headerIdx < 0) return { entries: [], problems: ['Could not find a header row with Date and Amount columns.'] }
  const head = rows[headerIdx].map(norm)
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const c = {
    date: col('date', 'month'),
    type: col('type', 'kind'),
    category: col('category', 'cat'),
    sub: col('subcategory', 'sub', 'subcat'),
    desc: col('description', 'desc', 'merchant', 'payee', 'note', 'notes'),
    amount: col('amount', 'value', 'total')
  }
  const entries: EntryDraft[] = []
  const problems: string[] = []
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const amount = num(r[c.amount])
    const date = toIsoDate(r[c.date])
    if (amount == null && !date) return
    if (amount === null || !date) {
      problems.push(`Row ${headerIdx + i + 2}: ${!date ? 'unreadable date' : 'missing amount'}, skipped`)
      return
    }
    const type = c.type >= 0 ? typeOf(r[c.type], amount) : 'expense'
    entries.push({
      date,
      type,
      category: text(r[c.category]) || 'Uncategorized',
      subcategory: text(r[c.sub]) || 'Other',
      description: c.desc >= 0 ? text(r[c.desc]) : '',
      amount: type === 'income' ? Math.abs(amount) : amount
    })
  })
  return { entries, problems }
}

/* ================= Cash Flow workbook ================= */

interface MonthTab {
  month: number // 0-11
  year: number
  rows: Rows
  /** 2022 to Sep 2024 layout: "Expenses (Recurring)" list, a block of itemized columns, "Income (Recurring)". */
  legacy: boolean
}

/** Month tabs are named "January" ('24 on) or "January 23" ('22, '23). The name's year wins over the one picked. */
function monthTabs(wb: XLSX.WorkBook, year: number): MonthTab[] {
  const tabs: MonthTab[] = []
  for (const name of wb.SheetNames) {
    const m = name.trim().match(/^([A-Za-z]+)\.?\s*['’]?\s*(\d{2}|\d{4})?$/)
    if (!m) continue
    const month = MONTH_NAMES.findIndex((full) => full.toLowerCase() === m[1].toLowerCase() || (m[1].length === 3 && full.toLowerCase().startsWith(m[1].toLowerCase())))
    if (month < 0) continue
    const tabYear = m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : year
    const rows = sheetRows(wb.Sheets[name])
    const legacy = rows.slice(0, 3).some((r) => r.some((cell) => norm(cell).includes('recurring')))
    tabs.push({ month, year: tabYear, rows, legacy })
  }
  return tabs.sort((a, b) => a.year - b.year || a.month - b.month)
}

const monthDate = (tab: MonthTab): string => `${tab.year}-${pad(tab.month + 1)}-01`

/* ---------- legacy month tabs ('22 to Sep '24) ---------- */

interface LegacyLine {
  type: EntryType
  category: string
  subcategory: string
  /** The column heading's category, before item-level rules (used when the refined one has no total). */
  headingTarget?: [string, string]
  description: string
  amount: number
}

// Fixed bills from the "Expenses (Recurring)" list, matched on the normalized name.
const RECURRING_RULES: [RegExp, string, string][] = [
  // insurance first: "Renters Insurance" contains "rent"
  [/(car|auto|truck|vehicle).*insurance|insurance.*(car|auto|truck)/, 'Insurance/Taxes', 'Car'],
  [/health.*insurance/, 'Insurance/Taxes', 'Health'],
  [/insurance/, 'Insurance/Taxes', 'Home'],
  [/rent|mortgage/, 'Rent/Mortgage', 'Rent/Mortgage'],
  [/water|sewer/, 'Utilities', 'Water'],
  [/electric|power/, 'Utilities', 'Electricity'],
  [/internet|wifi/, 'Utilities', 'Internet'],
  [/phone|cell|wireless/, 'Utilities', 'Phone'],
  [/gym|fitness|crunch/, 'Subscriptions', 'Gym'],
  [/music|spotify|pandora/, 'Subscriptions', 'Music'],
  [/amazon|prime/, 'Subscriptions', 'Amazon'],
  [/^tv|tv$|hulu|netflix|espn|youtube|disney|hbo|peacock|paramount|sling|fubo/, 'Subscriptions', 'TV'],
  [/game|xbox|playstation|psplus|nintendo|steam/, 'Subscriptions', 'Games']
]

// Column headings of the itemized block, mapped to the 2026 categories.
const HEADING_RULES: [RegExp, string, string][] = [
  [/restaurant|dining|eatingout|takeout/, 'Food', 'Restaurants'],
  [/grocer|food/, 'Food', 'Groceries'],
  [/household|home|house/, 'Home', 'Other'],
  [/cloth/, 'Everyday', 'Clothes'],
  [/personal|toiletr/, 'Everyday', 'Personal supplies'],
  [/truck|car|vehicle|auto|gas|fuel/, 'Vehicle', 'Other'],
  [/entertain|fun/, 'Entertainment', 'Entertainment'],
  [/hobb|toy/, 'Entertainment', 'Hobby/Toys'],
  [/health|medical|doctor|pharm/, 'Health/medical', 'Other'],
  [/travel|vacation|trip/, 'Travel', 'Other'],
  [/^pet|dog/, 'Pets', 'Other'],
  [/gift/, 'Gifts', 'Gifts'],
  [/other|misc/, 'Everyday', 'Other']
]

// Item-level refinements inside a mapped category, matched on the normalized description.
const ITEM_RULES: { category: string; match: RegExp; to: [string, string] }[] = [
  { category: 'Food', match: /mcdonald|wendy|burgerking|domino|checkers|arby|china|starbucks|chickfil|subway|taco|pizza|panera|dairyqueen|chipotle|ilovenyc|popeye|kfc|sonic|whataburger|restaurant|grill|cafe|diner|bar$/, to: ['Food', 'Restaurants'] },
  { category: 'Vehicle', match: /gas|fuel|shell|chevron|exxon|wawa|racetrac|circlek/, to: ['Vehicle', 'Fuel'] },
  { category: 'Vehicle', match: /sunpass|toll|epass/, to: ['Vehicle', 'SunPass'] },
  { category: 'Vehicle', match: /registration|license|dmv/, to: ['Vehicle', 'Registration/license'] },
  { category: 'Vehicle', match: /repair|oilchange|tire|mechanic|brake/, to: ['Vehicle', 'Repairs'] },
  { category: 'Pets', match: /vet|shots|flea|tick|earclean|nexguard|heartgard/, to: ['Pets', 'Vet/medical'] },
  { category: 'Pets', match: /food|treat|bully|chew/, to: ['Pets', 'Food'] },
  { category: 'Pets', match: /toy/, to: ['Pets', 'Toys'] },
  { category: 'Pets', match: /leash|harness|collar|crate|bowl|brush|bags|tag|boots|comb|blanket|shampoo|mat|trimmer|supplies|stand|holder|seatcover/, to: ['Pets', 'Supplies'] },
  { category: 'Everyday', match: /gift|xmas|christmas|birthday/, to: ['Gifts', 'Gifts'] },
  { category: 'Everyday', match: /hospital|emergency|urgentcare/, to: ['Health/medical', 'Emergency'] },
  { category: 'Everyday', match: /doctor|primcare|primarycare|bloodwork|quest|dentist|dental|vision|clinic/, to: ['Health/medical', 'Doctors/dental/vision'] },
  { category: 'Everyday', match: /cvs|walgreens|pharm|aleve|alieve|vitamin|medicine/, to: ['Health/medical', 'Pharmacy'] },
  { category: 'Everyday', match: /gymannual|lafit|fitness/, to: ['Subscriptions', 'Gym'] },
  { category: 'Everyday', match: /^att$|verizon|tmobile/, to: ['Utilities', 'Phone'] }
]

function mapRule(rules: [RegExp, string, string][], label: string, fallback: [string, string]): [string, string] {
  const key = norm(label)
  const hit = rules.find(([re]) => re.test(key))
  return hit ? [hit[1], hit[2]] : fallback
}

function refineItem(category: string, subcategory: string, description: string): [string, string] {
  const key = norm(description)
  const hit = ITEM_RULES.find((rule) => rule.category === category && rule.match.test(key))
  return hit ? hit.to : [category, subcategory]
}

function incomeTarget(label: string): [string, string] {
  const key = norm(label)
  if (/job|paycheck|wage|salary|work|payroll/.test(key)) return ['Wages', 'Paycheck']
  if (/refund|return|rebate/.test(key)) return ['Other', 'Refunds']
  if (/gift|parent|mom|dad|family/.test(key)) return ['Other', 'Gifts']
  return ['Other', 'Other']
}

const isTotal = (cell: Cell): boolean => norm(cell).startsWith('total')
const isBlockTitle = (cell: Cell): boolean => /expenses|income|savings|result/.test(norm(cell))

/** Name/amount pairs listed under a title cell, until its Total row (or the next block). */
function listUnder(rows: Rows, titleRow: number, col: number): { label: string; amount: number }[] {
  const out: { label: string; amount: number }[] = []
  let blanks = 0
  for (let r = titleRow + 1; r < rows.length; r++) {
    const label = rows[r]?.[col]
    if (isTotal(label) || isBlockTitle(label)) break
    if (!text(label)) {
      if (++blanks >= 3) break
      continue
    }
    blanks = 0
    const amount = num(rows[r]?.[col + 1] ?? null)
    if (amount) out.push({ label: text(label), amount })
  }
  return out
}

function readLegacyMonth(rows: Rows): LegacyLine[] {
  const lines: LegacyLine[] = []
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      const key = norm(cell)
      if (key === 'expensesrecurring') {
        for (const { label, amount } of listUnder(rows, r, c)) {
          const [category, subcategory] = mapRule(RECURRING_RULES, label, ['Subscriptions', 'Other'])
          lines.push({ type: 'expense', category, subcategory, description: label, amount })
        }
      } else if (key === 'incomerecurring' || key === 'incomeother' || key === 'otherincome' || key === 'income') {
        for (const { label, amount } of listUnder(rows, r, c)) {
          const [category, subcategory] = incomeTarget(label)
          lines.push({ type: 'income', category, subcategory, description: label, amount })
        }
      } else if (key === 'expenses') {
        // The next row holds one heading per pair of columns (description, amount), starting here.
        const headingRow = rows[r + 1] ?? []
        headingRow.forEach((heading, hc) => {
          if (hc < c || typeof heading !== 'string' || !text(heading) || num(heading) !== null) return
          const [category, subcategory] = mapRule(HEADING_RULES, heading, [text(heading), 'Other'])
          for (let rr = r + 2; rr < rows.length; rr++) {
            const description = rows[rr]?.[hc]
            if (isTotal(description)) break
            const amount = num(rows[rr]?.[hc + 1] ?? null)
            if (!text(description) || !amount) continue
            // A rental security deposit comes back, so it isn't spending (Devin, 2026-11-01).
            if (category === 'Everyday' && /deposit/.test(norm(description))) continue
            const [cat, sub] = refineItem(category, subcategory, text(description))
            lines.push({ type: 'expense', category: cat, subcategory: sub, description: text(description), amount, headingTarget: [category, subcategory] })
          }
        })
      }
    })
  )
  return lines
}

/* ---------- Expenses / Income tabs ('24 on) ---------- */

interface SheetCategory {
  name: string
  subs: string[]
  totals: Record<string, number[]>
}

function readTree(rows: Rows): SheetCategory[] {
  const cats: SheetCategory[] = []
  let current: SheetCategory | null = null
  for (const r of rows) {
    const a = r[0]
    const c = r[2]
    if (a && c && String(c).toLowerCase().startsWith('monthly')) {
      current = { name: text(a), subs: [], totals: {} }
      cats.push(current)
    } else if (current && c && !a && text(c)) {
      const sub = text(c)
      current.subs.push(sub)
      current.totals[sub] = Array.from({ length: 12 }, (_, i) => num(r[3 + i]) || 0)
    }
  }
  return cats
}

/**
 * A "Cash Flow 'YY" workbook, any year's layout:
 * - '25/'26 (the standard): Expenses and Income tabs hold monthly totals per subcategory; each
 *   month tab lists itemized lines under its category blocks.
 * - '24: same Expenses/Income tabs, but January–September month tabs use the older layout.
 * - '22/'23: no Expenses/Income tabs; month tabs ("January 23") in the older layout only.
 * Itemized lines are used where present and fit the totals; anything else is filled from the
 * totals, so every month's totals match the sheet. Older categories are mapped to the 2026 ones.
 */
export async function parseCashFlowWorkbook(file: Blob, year: number): Promise<ParsedEntries> {
  const wb = await readWorkbook(file)
  const problems: string[] = []
  const tab = (name: string): Rows | null => {
    const found = wb.SheetNames.find((n) => norm(n) === norm(name))
    return found ? sheetRows(wb.Sheets[found]) : null
  }
  const expenseRows = tab('Expenses')
  const incomeRows = tab('Income')
  const months = monthTabs(wb, year)

  if (!expenseRows) {
    const legacy = months.filter((m) => m.legacy)
    if (!legacy.length) return { entries: [], categories: [], problems: ['This workbook has no “Expenses” tab and no month tabs like “January 23”.'] }
    return legacyOnly(legacy)
  }

  const expense = readTree(expenseRows)
  const income = incomeRows ? readTree(incomeRows) : null
  const entries: EntryDraft[] = []
  const found: Record<string, number> = {}
  const key = (category: string, sub: string, month: number) => `${category}|${sub}|${month}`

  // Exact name, or a shared prefix of 4+ letters ("Health" ~ "Health/medical"). Short cells like
  // "-" or "E" must not count as category headers.
  const findCat = (name: Cell) => {
    const normalizedName = norm(name)
    return expense.find(
      (category) =>
        norm(category.name) === normalizedName || (normalizedName.length >= 4 && norm(category.name).startsWith(normalizedName.slice(0, 6)))
    )
  }

  // Where an older month tab's line goes in this workbook's Expenses tab: the item's own target,
  // then its column heading's ("Gas" → Vehicle › Fuel, else Vehicle › Other), then "Other" →
  // Misc ('24). A subcategory only counts if the tab has a total for it that month.
  function legacyTarget(line: LegacyLine, month: number): [string, string] | null {
    const candidates = [[line.category, line.subcategory], line.headingTarget, line.category === 'Everyday' ? ['Misc', 'Misc'] : null]
    for (const candidate of candidates) {
      if (!candidate) continue
      const cat = findCat(candidate[0])
      if (!cat) continue
      const wanted = norm(candidate[1])
      const sub = cat.subs.find((s) => norm(s) === wanted) ?? cat.subs.find((s) => norm(s).includes(wanted)) ?? (cat.subs.length === 1 ? cat.subs[0] : undefined)
      if (sub && Math.abs(cat.totals[sub][month]) > 0.004) return [cat.name, sub]
    }
    return null
  }

  for (const month of months) {
    if (month.year !== year) continue
    if (month.legacy) {
      // Map each line to a category and subcategory the Expenses tab has; drop it otherwise
      // (the totals below still cover it). Lines that overshoot a total are dropped there too.
      const kept: (LegacyLine & { sub: string })[] = []
      for (const line of readLegacyMonth(month.rows)) {
        if (line.type !== 'expense') continue
        const target = legacyTarget(line, month.month)
        if (target) kept.push({ ...line, category: target[0], sub: target[1] })
      }
      const sums: Record<string, number> = {}
      for (const line of kept) sums[key(line.category, line.sub, month.month)] = (sums[key(line.category, line.sub, month.month)] || 0) + line.amount
      for (const line of kept) {
        const k = key(line.category, line.sub, month.month)
        const total = expense.find((c) => c.name === line.category)!.totals[line.sub][month.month]
        if (sums[k] - total > 0.01) continue
        entries.push({ date: monthDate(month), type: 'expense', category: line.category, subcategory: line.sub, description: line.description, amount: line.amount })
        found[k] = (found[k] || 0) + line.amount
      }
      continue
    }

    const rows = month.rows
    const heads: number[] = []
    rows.forEach((r, ri) => {
      if (ri < 17 || !r[0] || ['card', 'amazon'].includes(norm(r[0]))) return
      if (findCat(r[0])) heads.push(ri)
    })
    heads.forEach((ri, hi) => {
      const cat = findCat(rows[ri][0])!
      const end = heads[hi + 1] ?? rows.length
      const cols = rows[ri].map((v, ci) => (ci >= 2 && v ? ci : -1)).filter((ci) => ci >= 0)
      const paired = cols.length < 2 || cols[1] - cols[0] === 2
      if (!paired) return // single-column header rows (rent, subscriptions, utilities) only carry totals
      cols.forEach((ci, k) => {
        const label = text(rows[ri][ci])
        const sub = cat.subs.find((s) => norm(s) === norm(label)) ?? cat.subs[k] ?? cat.subs.at(-1) ?? 'Other'
        for (let rr = ri + 2; rr < end; rr++) {
          const d = rows[rr]?.[ci]
          const amt = num(rows[rr]?.[ci + 1] ?? null)
          if (d && amt) {
            entries.push({ date: monthDate(month), type: 'expense', category: cat.name, subcategory: sub, description: text(d), amount: amt })
            found[key(cat.name, sub, month.month)] = (found[key(cat.name, sub, month.month)] || 0) + amt
          }
        }
      })
    })
  }

  // Fill the rest from monthly totals so every month matches the sheet.
  for (const cat of expense) {
    for (const sub of cat.subs) {
      cat.totals[sub].forEach((t, mi) => {
        const diff = round2(t - (found[key(cat.name, sub, mi)] || 0))
        if (diff < -0.01) {
          // The month tab's lines add up to more than the Expenses tab says, usually a SUM range
          // that stops short of the last lines. The lines are what was spent, so they stay.
          problems.push(`${MONTH_NAMES[mi]} ${year} ${cat.name} › ${sub}: the itemized lines come to $${(-diff).toFixed(2)} more than the Expenses tab total. Kept the lines.`)
        } else if (diff > 0.01)
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

  const categories: NonNullable<ParsedEntries['categories']> = [
    ...expense.map((c) => ({ type: 'expense' as const, name: c.name, subcategories: c.subs })),
    ...(income || []).map((c) => ({ type: 'income' as const, name: c.name, subcategories: c.subs }))
  ]
  return toStandardNames({ entries, categories, problems })
}

/* ---------- 2026 names ---------- */

// Names older workbooks used for what the 2026 sheet calls something else.
const CATEGORY_RENAMES: Record<string, string> = { insurance: 'Insurance/Taxes', misc: 'Everyday' }
const SUBCATEGORY_RENAMES: Record<string, Record<string, string>> = {
  'Insurance/Taxes': { other: 'Taxes' },
  Everyday: { misc: 'Other' },
  Home: { improvements: 'Projects' },
  Subscriptions: { youtubetv: 'TV' }
}

/**
 * Renames older category and subcategory names to the 2026 ones. When anything was renamed (an
 * older workbook), the category list only keeps subcategories that have entries, so a '24 import
 * doesn't add empty leftovers next to the 2026 tree.
 */
function toStandardNames(parsed: ParsedEntries & { categories: NonNullable<ParsedEntries['categories']> }): ParsedEntries {
  let renamed = false
  const rename = (type: EntryType, category: string, subcategory: string): [string, string] => {
    const newCategory = (type === 'expense' && CATEGORY_RENAMES[norm(category)]) || category
    const newSubcategory = (type === 'expense' && SUBCATEGORY_RENAMES[newCategory]?.[norm(subcategory)]) || subcategory
    if (newCategory !== category || newSubcategory !== subcategory) renamed = true
    return [newCategory, newSubcategory]
  }
  const entries = parsed.entries.map((entry) => {
    const [category, subcategory] = rename(entry.type, entry.category, entry.subcategory)
    return { ...entry, category, subcategory }
  })
  const merged = new Map<string, { type: EntryType; name: string; subcategories: string[] }>()
  for (const node of parsed.categories) {
    for (const sub of node.subcategories) {
      const [category, subcategory] = rename(node.type, node.name, sub)
      const target = merged.get(`${node.type}|${category}`) ?? { type: node.type, name: category, subcategories: [] }
      if (!target.subcategories.includes(subcategory)) target.subcategories.push(subcategory)
      merged.set(`${node.type}|${category}`, target)
    }
  }
  let categories = [...merged.values()]
  if (renamed) {
    const used = new Set(entries.map((entry) => `${entry.type}|${entry.category}|${entry.subcategory}`))
    categories = categories
      .map((node) => ({ ...node, subcategories: node.subcategories.filter((sub) => used.has(`${node.type}|${node.name}|${sub}`)) }))
      .filter((node) => node.subcategories.length)
  }
  return { entries, categories, problems: parsed.problems }
}

/** '22/'23 workbooks: every line comes from the month tabs, mapped to the 2026 categories. */
function legacyOnly(tabs: MonthTab[]): ParsedEntries {
  const entries: EntryDraft[] = []
  const problems: string[] = []
  const tree = new Map<string, { type: EntryType; name: string; subcategories: string[] }>()
  for (const month of tabs) {
    const lines = readLegacyMonth(month.rows)
    if (!lines.length) problems.push(`${MONTH_NAMES[month.month]} ${month.year}: nothing found to import.`)
    for (const line of lines) {
      entries.push({ date: monthDate(month), type: line.type, category: line.category, subcategory: line.subcategory, description: line.description, amount: round2(line.amount) })
      const treeKey = `${line.type}|${line.category}`
      const node = tree.get(treeKey) ?? { type: line.type, name: line.category, subcategories: [] }
      if (!node.subcategories.includes(line.subcategory)) node.subcategories.push(line.subcategory)
      tree.set(treeKey, node)
    }
  }
  return { entries, categories: [...tree.values()], problems }
}

/* ================= Net Worth tracker ================= */

/**
 * The "Net Worth Tracker" tab: one row of month-end dates, then account rows
 * (name in column C) under section headings in column B.
 */
export async function parseNetWorthWorkbook(file: Blob): Promise<ParsedNetWorth> {
  const wb = await readWorkbook(file)
  const name = wb.SheetNames.find((n) => norm(n).includes('networth')) || wb.SheetNames[0]
  const rows = sheetRows(wb.Sheets[name])
  const dateRowIdx = rows.findIndex((r) => r.filter((v) => v instanceof Date || (typeof v === 'string' && toIsoDate(v) && /\d/.test(v))).length >= 2)
  if (dateRowIdx < 0) return { accounts: [], dates: [], problems: ['Could not find a row of dates.'] }
  const dateCols = rows[dateRowIdx]
    .map((v, ci) => ({ ci, date: v instanceof Date || typeof v === 'string' ? toIsoDate(v) : null }))
    .filter((d): d is { ci: number; date: string } => !!d.date && d.ci > 1)
  const sectionGroup = (label: Cell): AccountGroup | null => {
    const l = norm(label)
    if (l.startsWith('cash')) return 'Cash'
    if (l.startsWith('invest')) return 'Investments'
    if (l.startsWith('otherasset')) return 'Other assets'
    if (l.startsWith('debt')) return 'Debt'
    return null
  }
  let group: AccountGroup = 'Cash'
  const accounts: ParsedNetWorth['accounts'] = []
  for (const r of rows.slice(dateRowIdx + 1)) {
    const g = sectionGroup(r[1])
    if (g) group = g
    const label = r[2]
    if (!label || /total|subtotal|net worth/i.test(String(r[1] ?? '') + label)) continue
    const values = Object.fromEntries(dateCols.map((d) => [d.date, num(r[d.ci]) || 0]))
    if (Object.values(values).some((v) => v !== 0)) accounts.push({ name: text(label), group, values })
  }
  return { accounts, dates: dateCols.map((d) => d.date), problems: accounts.length ? [] : ['No account rows with balances were found.'] }
}

/** "Cash Flow '23.xlsx" → 2023, so the year picker follows the file. */
export function yearFromFileName(name: string): number | null {
  const m = name.match(/['’](\d{2})\b/) ?? name.match(/\b(20\d{2})\b/)
  if (!m) return null
  return m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1])
}
