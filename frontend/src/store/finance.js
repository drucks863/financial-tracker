import { reactive, watch } from 'vue'
import seed from '@seed'

// Single in-memory store for the prototype, persisted to localStorage.
// Shapes mirror the planned DynamoDB items so the API swap is mechanical:
//   Category  { id, type: income|expense|savings, name, subcategories[], essential?, fromPaycheck? }
//   Entry     { id, date: YYYY-MM-DD, type, category, subcategory, description, amount }
//   Account   { id, name, group: Cash|Investments|Other assets|Debt }
//   Snapshot  { date: YYYY-MM-DD, values: { [accountId]: number } }

const KEY = 'financial-tracker.v1'
const clone = (o) => JSON.parse(JSON.stringify(o))

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.version === seed.version) return parsed
    }
  } catch {
    /* storage blocked: fall back to seed */
  }
  return clone(seed)
}

export const state = reactive(load())

watch(
  state,
  (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  },
  { deep: true }
)

export function resetToSheetData() {
  const fresh = clone(seed)
  Object.keys(state).forEach((k) => delete state[k])
  Object.assign(state, fresh)
}

export const isSampleData = !!seed.sample

export const uid = (p = 'e') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/* ---------- categories ---------- */

export const categoriesOf = (type) => state.categories.filter((c) => c.type === type)
export const findCategory = (type, name) => state.categories.find((c) => c.type === type && c.name === name)

export function addCategory({ type, name, essential = false, fromPaycheck = false, subcategories = [] }) {
  name = name.trim()
  if (!name || findCategory(type, name)) return null
  const cat = { id: uid('c'), type, name, subcategories: subcategories.length ? subcategories : ['Other'] }
  if (type === 'expense') cat.essential = essential
  if (type === 'savings') cat.fromPaycheck = fromPaycheck
  state.categories.push(cat)
  return cat
}

export function renameCategory(cat, newName) {
  newName = newName.trim()
  if (!newName || newName === cat.name || findCategory(cat.type, newName)) return false
  state.entries.forEach((e) => {
    if (e.type === cat.type && e.category === cat.name) e.category = newName
  })
  cat.name = newName
  return true
}

export function addSubcategory(cat, name) {
  name = name.trim()
  if (!name || cat.subcategories.includes(name)) return false
  cat.subcategories.push(name)
  return true
}

export function renameSubcategory(cat, oldName, newName) {
  newName = newName.trim()
  if (!newName || cat.subcategories.includes(newName)) return false
  cat.subcategories[cat.subcategories.indexOf(oldName)] = newName
  state.entries.forEach((e) => {
    if (e.type === cat.type && e.category === cat.name && e.subcategory === oldName) e.subcategory = newName
  })
  return true
}

export const entriesUsing = (cat, sub) =>
  state.entries.filter((e) => e.type === cat.type && e.category === cat.name && (!sub || e.subcategory === sub)).length

export function removeSubcategory(cat, sub) {
  if (entriesUsing(cat, sub)) return false
  cat.subcategories = cat.subcategories.filter((s) => s !== sub)
  return true
}

export function removeCategory(cat) {
  if (entriesUsing(cat)) return false
  state.categories.splice(state.categories.indexOf(cat), 1)
  return true
}

// Makes sure a category/subcategory pair exists (used by import).
export function ensureCategory(type, name, sub) {
  let cat = findCategory(type, name) || addCategory({ type, name, subcategories: [sub || 'Other'] })
  if (sub && !cat.subcategories.includes(sub)) cat.subcategories.push(sub)
  return cat
}

/* ---------- entries ---------- */

export function saveEntry(entry) {
  ensureCategory(entry.type, entry.category, entry.subcategory)
  if (entry.id) {
    const i = state.entries.findIndex((e) => e.id === entry.id)
    if (i >= 0) {
      state.entries[i] = { ...entry }
      return state.entries[i]
    }
  }
  const e = { ...entry, id: uid() }
  state.entries.push(e)
  return e
}

export function deleteEntry(id) {
  const i = state.entries.findIndex((e) => e.id === id)
  if (i >= 0) state.entries.splice(i, 1)
}

export const ymOf = (date) => date.slice(0, 7)
export const yearsAvailable = () => [...new Set(state.entries.map((e) => +e.date.slice(0, 4)))].sort((a, b) => b - a)

/* ---------- aggregates ---------- */

// Per-month totals for one year. Mirrors the sheet's Summary tab:
// net = income - expenses; leftover = net - savings that come out of take-home pay.
export function monthTotals(year) {
  const essential = new Set(state.categories.filter((c) => c.type === 'expense' && c.essential).map((c) => c.name))
  const paycheck = new Set(state.categories.filter((c) => c.type === 'savings' && c.fromPaycheck).map((c) => c.name))
  const rows = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    ym: `${year}-${String(m + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
    essential: 0,
    discretionary: 0,
    saved: 0,
    savedFromCash: 0,
    count: 0
  }))
  for (const e of state.entries) {
    if (+e.date.slice(0, 4) !== year) continue
    const r = rows[+e.date.slice(5, 7) - 1]
    r.count++
    if (e.type === 'income') r.income += e.amount
    else if (e.type === 'expense') {
      r.expense += e.amount
      essential.has(e.category) ? (r.essential += e.amount) : (r.discretionary += e.amount)
    } else if (e.type === 'savings') {
      r.saved += e.amount
      if (!paycheck.has(e.category)) r.savedFromCash += e.amount
    }
  }
  for (const r of rows) {
    r.net = r.income - r.expense
    r.leftover = r.net - r.savedFromCash
    r.savingsRate = r.income ? r.net / r.income : null
  }
  return rows
}

// Averages skip zero months, matching the sheet's Average column.
export const avgNonZero = (values) => {
  const nz = values.filter((v) => Math.abs(v) > 0.004)
  return nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0
}

// { [category]: { total, subs: { [sub]: total } } } for the given filter
export function categoryTotals(type, filter) {
  const out = {}
  for (const e of state.entries) {
    if (e.type !== type || !filter(e)) continue
    const c = (out[e.category] ||= { total: 0, subs: {} })
    c.total += e.amount
    c.subs[e.subcategory] = (c.subs[e.subcategory] || 0) + e.amount
  }
  return out
}

// Year grid like the sheet's Expenses / Income tabs: rows per category and subcategory, 12 months.
export function yearGrid(type, year) {
  const grid = {}
  for (const cat of categoriesOf(type)) {
    grid[cat.name] = { months: Array(12).fill(0), subs: Object.fromEntries(cat.subcategories.map((s) => [s, Array(12).fill(0)])) }
  }
  for (const e of state.entries) {
    if (e.type !== type || +e.date.slice(0, 4) !== year) continue
    const m = +e.date.slice(5, 7) - 1
    const g = (grid[e.category] ||= { months: Array(12).fill(0), subs: {} })
    g.months[m] += e.amount
    ;(g.subs[e.subcategory] ||= Array(12).fill(0))[m] += e.amount
  }
  return grid
}

/* ---------- net worth ---------- */

export const NW_GROUPS = ['Cash', 'Investments', 'Other assets', 'Debt']

export function netWorthSeries() {
  const { accounts, snapshots } = state.netWorth
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((s) => {
    const byGroup = Object.fromEntries(NW_GROUPS.map((g) => [g, 0]))
    for (const a of accounts) byGroup[a.group] += s.values[a.id] || 0
    const assets = byGroup.Cash + byGroup.Investments + byGroup['Other assets']
    return { date: s.date, byGroup, assets, debt: byGroup.Debt, total: assets + byGroup.Debt, values: s.values }
  })
}

export function saveSnapshot(date, values) {
  const existing = state.netWorth.snapshots.find((s) => s.date === date)
  if (existing) existing.values = { ...values }
  else state.netWorth.snapshots.push({ date, values: { ...values } })
}

export function deleteSnapshot(date) {
  state.netWorth.snapshots = state.netWorth.snapshots.filter((s) => s.date !== date)
}

export function addAccount(name, group) {
  name = name.trim()
  if (!name) return null
  const a = { id: uid('a'), name, group }
  state.netWorth.accounts.push(a)
  return a
}
