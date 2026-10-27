// Validated categorical order (dataviz reference palette), light and dark steps.
// Colors follow the entity: a category keeps its slot no matter what else is shown.
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

export const OTHER_LIGHT = '#a3a29c'
export const OTHER_DARK = '#6b6a65'

export const series = (i: number, dark: boolean): string => (dark ? DARK : LIGHT)[i % 8]
export const otherColor = (dark: boolean): string => (dark ? OTHER_DARK : OTHER_LIGHT)

// Fixed roles used across the app.
export const ROLE: Record<'income' | 'expense' | 'cash' | 'investments' | 'other' | 'debt', number> = {
  income: 0, // blue
  expense: 1, // orange
  cash: 2, // aqua
  investments: 0, // blue
  other: 6, // violet
  debt: 7 // red
}

// Expense categories skip the income (blue) and expense (orange) slots so a category never
// looks like the income or expense series, and the red slot, which sits too close to pink
// and reads as "bad". Five slots, validated in stacked order in both modes; the sixth
// category and beyond share the "Other" grey.
const CATEGORY_SLOTS = [2, 3, 4, 5, 6]
export const CATEGORY_COLOR_COUNT = CATEGORY_SLOTS.length
export const categorySeries = (rankIndex: number, dark: boolean): string => series(CATEGORY_SLOTS[rankIndex], dark)

export interface ChartChrome {
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  surface: string
}

export function chrome(dark: boolean): ChartChrome {
  return dark
    ? { ink: '#e9e8e4', ink2: '#b4b3ad', muted: '#85847e', grid: '#222220', axis: '#3a3a37', surface: '#131312' }
    : { ink: '#161615', ink2: '#5a5a56', muted: '#787873', grid: '#efefed', axis: '#c8c8c4', surface: '#ffffff' }
}
