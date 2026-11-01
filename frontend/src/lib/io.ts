import * as XLSX from 'xlsx'
import { state, monthTotals, yearGrid, yearsAvailable, netWorthSeries, categoriesOf } from '../store/finance'
import type { EntryType } from '../types'
import { MONTHS } from './format'

/* ================= saving files ================= */

// Inside a claude.ai artifact, files go through the viewer's `downloads` capability.
// Anywhere else (local dev, the real app) a plain blob link does the job.
export type FileData = string | Blob | ArrayBuffer

export interface SaveError {
  code: string
  message: string
}

export async function saveFile(filename: string, data: FileData): Promise<'saved'> {
  const claude = window.claude
  if (claude?.use) {
    const downloads = await claude.use('downloads')
    if (downloads) {
      await downloads.save({ filename, data })
      return 'saved'
    }
    throw { code: 'unavailable', message: 'Downloads are not available in this view.' } satisfies SaveError
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
const TYPE_LABEL: Record<EntryType, string> = { income: 'Income', expense: 'Expense' }

type Row = (string | number)[]

function entryRows(filter: (e: (typeof state.entries)[number]) => boolean = () => true): Row[] {
  return [...state.entries]
    .filter(filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.category.localeCompare(b.category))
    .map((e) => [e.date, TYPE_LABEL[e.type], e.category, e.subcategory, e.description, round2(e.amount)])
}
const round2 = (v: number): number => Math.round(v * 100) / 100

export function entriesCsv(filter?: Parameters<typeof entryRows>[0]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [ENTRY_COLUMNS, ...entryRows(filter)].map((r) => r.map(esc).join(',')).join('\n')
}

function gridSheet(type: EntryType, year: number): XLSX.WorkSheet {
  const g = yearGrid(type, year)
  const order = categoriesOf(type).map((c) => c.name)
  const rows: Row[] = [[type === 'expense' ? 'Expenses' : 'Income', '', ...MONTHS, 'Total', 'Average']]
  const avg = (arr: number[]) => {
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

export function workbookBytes({ includeNetWorth = true } = {}): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const entries = XLSX.utils.aoa_to_sheet([ENTRY_COLUMNS, ...entryRows()])
  entries['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 11 }]
  XLSX.utils.book_append_sheet(wb, entries, 'Entries')

  const summary: Row[] = [['Month', 'Income', 'Expenses', 'Essentials', 'Discretionary', 'Net']]
  for (const y of yearsAvailable().sort()) {
    for (const r of monthTotals(y)) {
      if (!r.count) continue
      summary.push([`${MONTHS[r.month]} ${y}`, round2(r.income), round2(r.expense), round2(r.essential), round2(r.discretionary), round2(r.net)])
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  for (const y of yearsAvailable().sort()) {
    XLSX.utils.book_append_sheet(wb, gridSheet('expense', y), `Expenses ${y}`)
    XLSX.utils.book_append_sheet(wb, gridSheet('income', y), `Income ${y}`)
  }

  if (includeNetWorth) XLSX.utils.book_append_sheet(wb, netWorthSheet(), 'Net Worth')

  const cats: Row[] = [['Type', 'Category', 'Subcategory', 'Essential']]
  for (const c of state.categories) for (const s of c.subcategories) cats.push([TYPE_LABEL[c.type], c.name, s, c.essential ? 'Yes' : ''])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cats), 'Categories')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function netWorthSheet(): XLSX.WorkSheet {
  const pts = netWorthSeries()
  const rows: Row[] = [['Group', 'Account', ...pts.map((p) => p.date)]]
  for (const a of state.netWorth.accounts) rows.push([a.group, a.name, ...pts.map((p) => round2(p.values[a.id] || 0))])
  rows.push([])
  rows.push(['', 'Total assets', ...pts.map((p) => round2(p.assets))])
  rows.push(['', 'Total debt', ...pts.map((p) => round2(p.debt))])
  rows.push(['', 'Net worth', ...pts.map((p) => round2(p.total))])
  return XLSX.utils.aoa_to_sheet(rows)
}

export function netWorthCsv(): string {
  const sheet = netWorthSheet()
  return XLSX.utils.sheet_to_csv(sheet)
}

/* ================= import ================= */

// Parsing lives in sheet-import.ts (no store or DOM dependencies, so it's testable in Node).
export { parseEntriesFile, parseCashFlowWorkbook, parseNetWorthWorkbook, yearFromFileName } from './sheet-import'
export type { ParsedEntries, ParsedNetWorth } from './sheet-import'
