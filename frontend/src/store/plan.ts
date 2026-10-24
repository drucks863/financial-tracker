import { computed } from 'vue'
import { state, uid } from './finance'
import { loanSummary } from '../lib/loan'
import type { Loan, PayDeduction, PayFrequency, SharedCost } from '../types'

// The My numbers page: steady-state pay, contributions, taxes and housing. Mirrors the
// "Misc. Calculations" tab of the Net Worth / Retirement workbook. Other screens read
// `planned` instead of recomputing these figures.

export const PAY_FREQUENCIES: { label: string; value: PayFrequency; perYear: number }[] = [
  { label: 'Weekly', value: 'weekly', perYear: 52 },
  { label: 'Every two weeks', value: 'biweekly', perYear: 26 },
  { label: 'Twice a month', value: 'semimonthly', perYear: 24 },
  { label: 'Monthly', value: 'monthly', perYear: 12 }
]

export const newDeduction = (): PayDeduction => ({ id: uid('p'), name: '', perPaycheck: 0 })
export const newLoan = (): Loan => ({ id: uid('p'), name: '', amount: 0, rate: 0.065, termYears: 30, start: new Date().toISOString().slice(0, 7), extraMonthly: 0 })
export const newSharedCost = (): SharedCost => ({ id: uid('p'), name: '', monthly: 0, share: 1 })

export const planned = computed(() => {
  const p = state.plan!
  const perYear = PAY_FREQUENCIES.find((f) => f.value === p.payFrequency)?.perYear ?? 26
  const toMonthly = (perPaycheck: number) => (perPaycheck * perYear) / 12

  // Per paycheck
  const gross = p.salary / perYear
  const k401 = gross * p.k401
  const match = gross * p.match
  const deductions = p.deductions.reduce((a, d) => a + (Number(d.perPaycheck) || 0), 0)
  // Estimate: what's left after 401k and other deductions, taxed at the effective rate.
  // Close enough for planning; the real figure can be entered instead.
  const taxable = Math.max(0, gross - k401 - deductions)
  const taxes = taxable * p.taxRate
  const estTakeHome = taxable - taxes
  const takeHome = p.takeHome ?? estTakeHome

  // Monthly housing
  const housing = p.housing.map((h) => ({ ...h, mine: (Number(h.monthly) || 0) * h.share }))
  const housingTotal = housing.reduce((a, h) => a + (Number(h.monthly) || 0), 0)
  const housingMine = housing.reduce((a, h) => a + h.mine, 0)

  // Loans: this month's payment for each one still being paid
  const loans = (p.loans ?? []).map((l) => ({ loan: l, ...loanSummary(l) }))
  const loanPayments = loans.reduce((a, l) => a + (l.balance > 0 ? l.payment : 0), 0)

  const takeHomeMonthly = toMonthly(takeHome)
  const savedMonthly = toMonthly(k401 + match + deductions)
  return {
    perYear,
    paycheck: { gross, k401, match, deductions, taxes, estTakeHome, takeHome },
    monthly: {
      gross: toMonthly(gross),
      k401: toMonthly(k401),
      match: toMonthly(match),
      deductions: toMonthly(deductions),
      taxes: toMonthly(taxes),
      takeHome: takeHomeMonthly,
      housingTotal,
      housingMine,
      loanPayments,
      /** take-home after my share of rent and bills, and loan payments */
      afterHousing: takeHomeMonthly - housingMine - loanPayments,
      saved: savedMonthly
    },
    housing,
    loans,
    savedYearly: savedMonthly * 12,
    /** share of gross pay going to 401k (yours + company) and other deductions */
    savedRate: p.salary ? (savedMonthly * 12) / p.salary : null
  }
})
