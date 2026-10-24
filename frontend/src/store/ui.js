import { reactive, computed } from 'vue'
import { state, categoryTotals } from './finance'
import { series, otherColor } from '../lib/chart-colors'

// View state shared across screens (not persisted).
function latestMonth() {
  const months = state.entries.filter((e) => e.type === 'income').map((e) => e.date.slice(0, 7))
  const latest = months.sort().pop() || new Date().toISOString().slice(0, 7)
  return { year: +latest.slice(0, 4), month: +latest.slice(5, 7) - 1 }
}

const start = latestMonth()
export const ui = reactive({
  year: start.year,
  month: start.month,
  entryDialog: { open: false, entry: null }
})

export const selectedYm = computed(() => `${ui.year}-${String(ui.month + 1).padStart(2, '0')}`)

export function openEntry(entry = null) {
  ui.entryDialog.entry = entry
  ui.entryDialog.open = true
}

// Expense categories ranked by all-time spend. The top seven keep a fixed
// palette slot everywhere in the app; the rest share the "Other" grey.
export const categoryRank = computed(() => {
  const totals = categoryTotals('expense', () => true)
  return Object.entries(totals)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name]) => name)
})

export function categoryColor(name, dark) {
  const i = categoryRank.value.indexOf(name)
  return i >= 0 && i < 7 ? series(i, dark) : otherColor(dark)
}
export const isFolded = (name) => {
  const i = categoryRank.value.indexOf(name)
  return i < 0 || i >= 7
}
