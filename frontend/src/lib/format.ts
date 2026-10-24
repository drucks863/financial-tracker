const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

export const money = (v: number): string => usd0.format(Math.round(v || 0))
export const money2 = (v: number): string => usd2.format(v || 0)
export const moneyCompact = (v: number): string => compact.format(v || 0)
export const signedMoney = (v: number): string => (v > 0 ? '+' : v < 0 ? '−' : '') + usd0.format(Math.abs(Math.round(v || 0)))
export const pct = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return '—'
  const p = v * 100
  return `${Math.abs(p) < 10 ? p.toFixed(1) : Math.round(p)}%`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}
/** "Oct 2026" from "2026-10"; a dash for none. */
export const ymLabel = (ym: string | null): string => {
  if (!ym) return '—'
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
/** "Oct 4" from "2026-10-04". */
export const dayLabel = (iso: string): string => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`

// Dates in the viewer's own time zone. toISOString() is UTC, which in the US turns into
// tomorrow (or next month) during the evening.
const pad = (n: number) => String(n).padStart(2, '0')
export const localIso = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const localYm = (d: Date = new Date()): string => localIso(d).slice(0, 7)

export const shortDate = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ’${String(y).slice(2)}`
}
