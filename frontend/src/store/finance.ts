import { reactive, watch } from 'vue'
import seed from '@seed'
import { loanBalanceAt, propertyValueAt } from '../lib/loan'
import type { Account, AccountGroup, Category, Entry, EntryDraft, EntryType, FinanceData, MonthTotals, NetWorthPoint, Plan, Subscription } from '../types'

// Single in-memory store for the prototype, persisted to localStorage.

const KEY = 'financial-tracker.v1'
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o))

export const emptyPlan = (): Plan => ({
  salary: 0,
  payFrequency: 'biweekly',
  taxRate: 0.22,
  takeHome: null,
  k401: 0,
  match: 0,
  deductions: [],
  housing: [],
  loans: []
})

// Older saved data (and seeds without one) have no plan, or an earlier shape; fill in defaults.
const validPlan = (p: unknown): p is Plan => {
  const q = p as Partial<Plan> | undefined
  return !!q && !!q.payFrequency && Array.isArray(q.deductions) && Array.isArray(q.housing)
}
const withPlan = (d: FinanceData): FinanceData => {
  const plan = validPlan(d.plan) ? d.plan : validPlan(seed.plan) ? clone(seed.plan) : emptyPlan()
  return { ...d, plan: { ...plan, loans: plan.loans ?? [] } }
}

// Saved data from another version is kept when its shape still fits (missing pieces get
// defaults); otherwise a copy is set aside before the seed replaces it, so nothing is lost.
const usable = (d: Partial<FinanceData> | null): d is FinanceData =>
  !!d && Array.isArray(d.categories) && Array.isArray(d.entries) && !!d.netWorth && Array.isArray(d.netWorth.snapshots)

function load(): FinanceData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FinanceData> | null
      if (parsed?.version === seed.version && usable(parsed)) return withPlan(parsed)
      if (usable(parsed)) return withPlan({ ...parsed, subscriptions: parsed.subscriptions ?? [], version: seed.version })
      localStorage.setItem(`${KEY}.backup`, raw)
    }
  } catch {
    /* storage blocked or unreadable: fall back to seed */
  }
  return withPlan(clone(seed))
}

export const state = reactive<FinanceData>(load())

// Save shortly after edits stop (typing shouldn't rewrite the whole store every keystroke),
// and right away when the page is hidden or closed.
let saveTimer: ReturnType<typeof setTimeout> | undefined
function save(): void {
  clearTimeout(saveTimer)
  saveTimer = undefined
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
watch(
  state,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 400)
  },
  { deep: true }
)
addEventListener('pagehide', () => saveTimer !== undefined && save())
addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer !== undefined && save())

export function resetToSheetData(): void {
  Object.assign(state, withPlan(clone(seed)))
}

export const isSampleData = !!seed.sample

export const uid = (p = 'e'): string => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/* ---------- categories ---------- */

export const categoriesOf = (type: EntryType): Category[] => state.categories.filter((c) => c.type === type)
export const findCategory = (type: EntryType, name: string | null | undefined): Category | undefined =>
  state.categories.find((c) => c.type === type && c.name === name)

interface NewCategory {
  type: EntryType
  name: string
  essential?: boolean
  subcategories?: string[]
}

export function addCategory({ type, name, essential = false, subcategories = [] }: NewCategory): Category | null {
  name = name.trim()
  if (!name || findCategory(type, name)) return null
  const cat: Category = { id: uid('c'), type, name, subcategories: subcategories.length ? subcategories : ['Other'] }
  if (type === 'expense') cat.essential = essential
  state.categories.push(cat)
  return cat
}

export function renameCategory(cat: Category, newName: string): boolean {
  newName = newName.trim()
  if (!newName || newName === cat.name || findCategory(cat.type, newName)) return false
  state.entries.forEach((e) => {
    if (e.type === cat.type && e.category === cat.name) e.category = newName
  })
  cat.name = newName
  return true
}

export function addSubcategory(cat: Category, name: string): boolean {
  name = name.trim()
  if (!name || cat.subcategories.includes(name)) return false
  cat.subcategories.push(name)
  return true
}

export function renameSubcategory(cat: Category, oldName: string, newName: string): boolean {
  newName = newName.trim()
  if (!newName || cat.subcategories.includes(newName)) return false
  cat.subcategories[cat.subcategories.indexOf(oldName)] = newName
  state.entries.forEach((e) => {
    if (e.type === cat.type && e.category === cat.name && e.subcategory === oldName) e.subcategory = newName
  })
  return true
}

export const entriesUsing = (cat: Category, sub?: string): number =>
  state.entries.filter((e) => e.type === cat.type && e.category === cat.name && (!sub || e.subcategory === sub)).length

export function removeSubcategory(cat: Category, sub: string): boolean {
  if (entriesUsing(cat, sub)) return false
  cat.subcategories = cat.subcategories.filter((s) => s !== sub)
  return true
}

export function removeCategory(cat: Category): boolean {
  if (entriesUsing(cat)) return false
  state.categories.splice(state.categories.indexOf(cat), 1)
  return true
}

// Makes sure a category/subcategory pair exists (used by import and new entries).
export function ensureCategory(type: EntryType, name: string, sub?: string): Category {
  const cat = findCategory(type, name) ?? addCategory({ type, name, subcategories: [sub || 'Other'] })!
  if (sub && !cat.subcategories.includes(sub)) cat.subcategories.push(sub)
  return cat
}

/* ---------- entries ---------- */

export function saveEntry(entry: EntryDraft): Entry {
  ensureCategory(entry.type, entry.category, entry.subcategory)
  if (entry.id) {
    const i = state.entries.findIndex((e) => e.id === entry.id)
    if (i >= 0) {
      state.entries[i] = { ...entry, id: entry.id }
      return state.entries[i]
    }
  }
  const e: Entry = { ...entry, id: uid() }
  state.entries.push(e)
  return e
}

export function deleteEntry(id: string): void {
  const i = state.entries.findIndex((e) => e.id === id)
  if (i >= 0) state.entries.splice(i, 1)
}

export const yearsAvailable = (): number[] => [...new Set(state.entries.map((e) => +e.date.slice(0, 4)))].sort((a, b) => b - a)

/* ---------- aggregates ---------- */

// Per-month totals for one year. Mirrors the sheet's Summary tab:
// net = income - expenses.
export function monthTotals(year: number): MonthTotals[] {
  const essential = new Set(state.categories.filter((c) => c.type === 'expense' && c.essential).map((c) => c.name))
  const rows: MonthTotals[] = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    ym: `${year}-${String(m + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
    essential: 0,
    discretionary: 0,
    count: 0,
    net: 0,
    savingsRate: null
  }))
  for (const e of state.entries) {
    if (+e.date.slice(0, 4) !== year) continue
    const r = rows[+e.date.slice(5, 7) - 1]
    r.count++
    if (e.type === 'income') r.income += e.amount
    else {
      r.expense += e.amount
      if (essential.has(e.category)) r.essential += e.amount
      else r.discretionary += e.amount
    }
  }
  for (const r of rows) {
    r.net = r.income - r.expense
    r.savingsRate = r.income ? r.net / r.income : null
  }
  return rows
}

// Averages skip zero months, matching the sheet's Average column.
export const avgNonZero = (values: number[]): number => {
  const nz = values.filter((v) => Math.abs(v) > 0.004)
  return nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0
}

export interface CategoryTotal {
  total: number
  subs: Record<string, number>
}

export function categoryTotals(type: EntryType, filter: (e: Entry) => boolean): Record<string, CategoryTotal> {
  const out: Record<string, CategoryTotal> = {}
  for (const e of state.entries) {
    if (e.type !== type || !filter(e)) continue
    const c = (out[e.category] ??= { total: 0, subs: {} })
    c.total += e.amount
    c.subs[e.subcategory] = (c.subs[e.subcategory] || 0) + e.amount
  }
  return out
}

export interface GridRow {
  months: number[]
  subs: Record<string, number[]>
}

// Year grid like the sheet's Expenses / Income tabs: rows per category and subcategory, 12 months.
export function yearGrid(type: EntryType, year: number): Record<string, GridRow> {
  const zeros = () => Array<number>(12).fill(0)
  const grid: Record<string, GridRow> = {}
  for (const cat of categoriesOf(type)) {
    grid[cat.name] = { months: zeros(), subs: Object.fromEntries(cat.subcategories.map((s) => [s, zeros()])) }
  }
  for (const e of state.entries) {
    if (e.type !== type || +e.date.slice(0, 4) !== year) continue
    const m = +e.date.slice(5, 7) - 1
    const g = (grid[e.category] ??= { months: zeros(), subs: {} })
    g.months[m] += e.amount
    ;(g.subs[e.subcategory] ??= zeros())[m] += e.amount
  }
  return grid
}

/* ---------- net worth ---------- */

export const NW_GROUPS: AccountGroup[] = ['Cash', 'Investments', 'Other assets', 'Debt']

export function netWorthSeries(): NetWorthPoint[] {
  const { accounts, snapshots } = state.netWorth
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((s) => {
    const byGroup = Object.fromEntries(NW_GROUPS.map((g) => [g, 0])) as Record<AccountGroup, number>
    // Debt balances count as amounts owed whichever sign they were entered with.
    for (const a of accounts) byGroup[a.group] += a.group === 'Debt' ? Math.abs(s.values[a.id] || 0) : s.values[a.id] || 0
    // Loans from the financial profile add their balance for that month, and the property they bought
    // (valued conservatively) counts under Other assets.
    const loans: Record<string, number> = {}
    const properties: Record<string, number> = {}
    for (const l of state.plan?.loans ?? []) {
      const ym = s.date.slice(0, 7)
      const b = loanBalanceAt(l, ym)
      if (b > 0) {
        loans[l.id] = b
        byGroup.Debt += b
      }
      const v = propertyValueAt(l, ym)
      if (v > 0) {
        properties[l.id] = v
        byGroup['Other assets'] += v
      }
    }
    const assets = byGroup.Cash + byGroup.Investments + byGroup['Other assets']
    return { date: s.date, byGroup, assets, debt: byGroup.Debt, loans, properties, total: assets - byGroup.Debt, values: s.values }
  })
}

export function saveSnapshot(date: string, values: Record<string, number>): void {
  const existing = state.netWorth.snapshots.find((s) => s.date === date)
  if (existing) existing.values = { ...values }
  else state.netWorth.snapshots.push({ date, values: { ...values } })
}

export function deleteSnapshot(date: string): void {
  state.netWorth.snapshots = state.netWorth.snapshots.filter((s) => s.date !== date)
}

export function addAccount(name: string, group: AccountGroup): Account | null {
  name = name.trim()
  if (!name) return null
  const a: Account = { id: uid('a'), name, group }
  state.netWorth.accounts.push(a)
  return a
}

/* ---------- subscriptions ---------- */

/** Save a subscription; `index` null adds a new one. */
export function saveSubscription(index: number | null, sub: Subscription): void {
  if (index === null) state.subscriptions.push(sub)
  else state.subscriptions.splice(index, 1, sub)
}

export function deleteSubscription(index: number): void {
  state.subscriptions.splice(index, 1)
}
