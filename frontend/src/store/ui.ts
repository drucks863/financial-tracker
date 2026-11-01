import { reactive, computed } from 'vue'
import type { Entry } from '../types'
import { state, categoryTotals } from './finance'
import { categorySeries, otherColor, CATEGORY_COLOR_COUNT } from '../lib/chart-colors'
import { localYm } from '../lib/format'

// View state shared across screens (not persisted).
function latestMonth(): { year: number; month: number } {
  const months = state.entries.filter((e) => e.type === 'income').map((e) => e.date.slice(0, 7))
  const latest = months.sort().pop() || localYm()
  return { year: +latest.slice(0, 4), month: +latest.slice(5, 7) - 1 }
}

const start = latestMonth()
export const ui = reactive({
  year: start.year,
  /** 0-based month */
  month: start.month,
  entryDialog: { open: false, entry: null as Entry | null },
  profileTab: 'plan' as ProfileTab
})

/** Tabs on the financial profile page (opened from the avatar). */
export const PROFILE_TABS = [
  { id: 'plan', label: 'Budget setup', note: 'Your pay, contributions, taxes, bills and loans. The rest of the app plans from these.' },
  { id: 'categories', label: 'Categories', note: 'The categories and subcategories entries are filed under.' },
  { id: 'subscriptions', label: 'Subscriptions', note: 'Recurring charges and what they cost each month and year.' },
  { id: 'files', label: 'Import & export', note: 'Bring in past years from your sheets, or download everything.' }
] as const
export type ProfileTab = (typeof PROFILE_TABS)[number]['id']
export const isProfileTab = (t: string): t is ProfileTab => PROFILE_TABS.some((x) => x.id === t)

export const selectedYm = computed(() => `${ui.year}-${String(ui.month + 1).padStart(2, '0')}`)

export function openEntry(entry: Entry | null = null): void {
  ui.entryDialog.entry = entry
  ui.entryDialog.open = true
}

// Expense categories ranked by spend in the year being viewed (ui.year), then by all-time
// spend for the ones with nothing that year. The top five keep a fixed palette slot everywhere
// in the app while that year is shown; the rest share the "Other" grey. Ranking by all-time
// spend instead put a year's big categories into Other whenever older years looked different.
export const categoryRank = computed<string[]>(() => {
  const year = String(ui.year)
  const thisYear = categoryTotals('expense', (e) => e.date.startsWith(year))
  const allTime = categoryTotals('expense', () => true)
  const spent = (totals: typeof allTime, name: string) => totals[name]?.total ?? 0
  return Object.keys(allTime).sort((a, b) => spent(thisYear, b) - spent(thisYear, a) || spent(allTime, b) - spent(allTime, a))
})

export function categoryColor(name: string, dark: boolean): string {
  const rankIndex = categoryRank.value.indexOf(name)
  return rankIndex >= 0 && rankIndex < CATEGORY_COLOR_COUNT ? categorySeries(rankIndex, dark) : otherColor(dark)
}
