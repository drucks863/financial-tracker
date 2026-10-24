import { computed } from 'vue'
import { state, monthTotals, avgNonZero, uid } from './finance'
import type { PlanLine } from '../types'

// The My numbers page: steady-state pay, contributions, taxes and housing. Mirrors the
// "Misc. Calculations" tab of the Net Worth / Retirement workbook. Other screens read
// `planned` instead of recomputing these figures.

export const newLine = (name = ''): PlanLine => ({ id: uid('p'), name, monthly: 0 })

const sumLines = (lines: PlanLine[]) => lines.reduce((a, l) => a + (Number(l.monthly) || 0), 0)

/** Average monthly non-essential spending from entries over the latest year that has any. */
const averageLiving = computed(() => {
  const years = [...new Set(state.entries.map((e) => +e.date.slice(0, 4)))].sort((a, b) => b - a)
  for (const y of years) {
    const v = avgNonZero(monthTotals(y).map((r) => r.discretionary))
    if (v) return { monthly: v, year: y }
  }
  return { monthly: 0, year: null as number | null }
})

export const planned = computed(() => {
  const p = state.plan!
  const grossMonthly = p.salary / 12
  const k401 = grossMonthly * p.k401
  const match = grossMonthly * p.match
  const otherContrib = sumLines(p.contributions)
  const paycheckContrib = sumLines(p.contributions.filter((c) => c.fromPaycheck))
  const takeHomeContrib = otherContrib - paycheckContrib
  // Estimate: gross minus what comes out of the paycheck (401k and paycheck contributions),
  // taxed at the effective rate. A close-enough approximation; enter the real figure when known.
  const estTakeHome = Math.max(0, (grossMonthly - k401 - paycheckContrib) * (1 - p.taxRate))
  const takeHome = p.takeHome ?? estTakeHome
  const h = p.housing
  const bills = sumLines(h.bills)
  const rentMine = h.split ? h.rent * h.rentShare : h.rent
  const billsMine = h.split ? bills * h.billsShare : bills
  const housing = rentMine + billsMine
  const living = p.living.useAverage ? averageLiving.value.monthly : p.living.monthly
  const left = takeHome - takeHomeContrib - housing - living
  const savedMonthly = k401 + match + otherContrib + Math.max(0, left)
  return {
    grossMonthly,
    taxesMonthly: Math.max(0, grossMonthly - k401 - paycheckContrib - estTakeHome),
    estTakeHome,
    takeHome,
    k401,
    match,
    otherContrib,
    paycheckContrib,
    takeHomeContrib,
    rentTotal: h.rent,
    billsTotal: bills,
    rentMine,
    billsMine,
    housing,
    living,
    livingAverageYear: averageLiving.value.year,
    /** what's left each month after contributions, housing and living costs */
    left,
    savedMonthly,
    savedYearly: savedMonthly * 12,
    /** share of gross pay saved, counting the company match */
    savedRate: p.salary ? (savedMonthly * 12) / p.salary : null
  }
})
