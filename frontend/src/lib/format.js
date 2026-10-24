const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

export const money = (v) => usd0.format(Math.round(v || 0))
export const money2 = (v) => usd2.format(v || 0)
export const moneyCompact = (v) => compact.format(v || 0)
export const signedMoney = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + usd0.format(Math.abs(Math.round(v || 0)))
export const pct = (v) => {
  if (v == null || !isFinite(v)) return '—'
  const p = v * 100
  return `${Math.abs(p) < 10 ? p.toFixed(1) : Math.round(p)}%`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}
export const shortDate = (iso) => {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ’${String(y).slice(2)}`
}
