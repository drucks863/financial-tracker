import type { Loan } from '../types'

// Standard amortization, month by month. Pure functions so Net worth, the financial profile and charts agree.

export interface LoanRow {
  /** YYYY-MM */
  ym: string
  payment: number
  interest: number
  principal: number
  /** balance after this payment */
  balance: number
}

const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const monthsBetween = (a: string, b: string): number => {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** Required monthly payment (principal + interest), before any extra. */
export function loanPayment(l: Loan): number {
  const n = Math.round(l.termYears * 12)
  if (!l.amount || n <= 0) return 0
  const r = l.rate / 12
  return r ? (l.amount * r) / (1 - Math.pow(1 + r, -n)) : l.amount / n
}

const cache = new WeakMap<object, { key: string; rows: LoanRow[] }>()

export function loanSchedule(l: Loan): LoanRow[] {
  const key = `${l.amount}|${l.rate}|${l.termYears}|${l.start}|${l.extraMonthly}`
  const hit = cache.get(l)
  if (hit && hit.key === key) return hit.rows
  const rows: LoanRow[] = []
  const r = l.rate / 12
  const base = loanPayment(l)
  let bal = l.amount
  const max = Math.round(l.termYears * 12)
  if (/^\d{4}-\d{2}$/.test(l.start) && base > 0) {
    for (let i = 0; i < max && bal > 0.005; i++) {
      const interest = bal * r
      const principal = Math.min(bal, base - interest + (l.extraMonthly || 0))
      bal -= principal
      rows.push({ ym: addMonths(l.start, i), payment: interest + principal, interest, principal, balance: Math.max(0, bal) })
    }
  }
  cache.set(l, { key, rows })
  return rows
}

/**
 * Balance owed at the end of month `ym` (YYYY-MM). The month before the first payment (when the
 * loan closed) owes the full amount; earlier than that the loan didn't exist yet.
 */
export function loanBalanceAt(l: Loan, ym: string): number {
  if (!/^\d{4}-\d{2}$/.test(l.start) || !l.amount) return 0
  const i = monthsBetween(l.start, ym)
  if (i < -1) return 0
  if (i === -1) return l.amount
  const rows = loanSchedule(l)
  return i < rows.length ? rows[i].balance : 0
}

export const currentYm = (): string => new Date().toISOString().slice(0, 7)

/** Totals paid so far (through `ym`) and over the whole loan. */
export function loanSummary(l: Loan, ym = currentYm()) {
  const rows = loanSchedule(l)
  const done = rows.filter((x) => x.ym <= ym)
  const sum = (xs: LoanRow[], k: 'interest' | 'principal') => xs.reduce((a, x) => a + x[k], 0)
  const balance = loanBalanceAt(l, ym)
  const value = propertyValueAt(l, ym)
  return {
    payment: loanPayment(l) + (l.extraMonthly || 0),
    balance,
    value,
    /** what you own of the property: its value minus what's still owed */
    equity: value ? value - balance : null,
    payoff: rows.at(-1)?.ym ?? null,
    interestPaid: sum(done, 'interest'),
    principalPaid: sum(done, 'principal'),
    interestTotal: sum(rows, 'interest'),
    rows
  }
}

/**
 * Value of the loan's property at the end of month `ym`: the conservative value, grown (or
 * shrunk) by its yearly change from the valuation month. Zero before the loan closed.
 */
export function propertyValueAt(l: Loan, ym: string): number {
  const p = l.property
  if (!p || !p.value || !/^\d{4}-\d{2}$/.test(p.valuedOn)) return 0
  if (/^\d{4}-\d{2}$/.test(l.start) && monthsBetween(l.start, ym) < -1) return 0
  const months = monthsBetween(p.valuedOn, ym)
  return Math.max(0, p.value * Math.pow(1 + (p.yearlyChange || 0), months / 12))
}
