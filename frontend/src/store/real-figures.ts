import { computed } from 'vue'
import { state, monthTotals, netWorthSeries } from './finance'
import { planned } from './plan'
import { localYm } from '../lib/format'

// Your real numbers in the shape the Plan pages (simulators) start from: the financial profile,
// the latest Net worth snapshot and recent Cash flow averages. Read-only figures; simulators copy
// them into a scenario (lib/scenario.ts) and tweak the copy.

/** How many recent full months the spending and saving averages use. */
export const RECENT_MONTHS = 12

export const realFigures = computed(() => {
  const plan = state.plan!
  const pay = planned.value

  // Age from the birth year on the profile (null until it's filled in).
  const thisYear = new Date().getFullYear()
  const age = plan.birthYear && plan.birthYear > 1900 && plan.birthYear <= thisYear ? thisYear - plan.birthYear : null

  // Latest Net worth snapshot, by group.
  const latest = netWorthSeries().at(-1) ?? null

  // Recent full months with entries (this month is still in progress, so it's left out).
  const currentYm = localYm()
  const year = +currentYm.slice(0, 4)
  const months = [...monthTotals(year - 1), ...monthTotals(year)]
    .filter((month) => month.ym < currentYm && month.count > 0)
    .slice(-RECENT_MONTHS)
  const average = (pick: (month: (typeof months)[number]) => number) =>
    months.length ? months.reduce((total, month) => total + pick(month), 0) / months.length : null
  const monthlySpending = average((month) => month.expense)
  const monthlyIncome = average((month) => month.income)

  return {
    age,
    birthYear: plan.birthYear ?? null,
    salary: plan.salary,
    /** your 401k and the company's, shares of salary 0–1 */
    k401: plan.k401,
    match: plan.match,
    /** other paycheck deductions (HSA...), yearly */
    deductionsYearly: pay.monthly.deductions * 12,
    /** saved a year through the paycheck: 401k (yours + company) and deductions */
    paycheckSavingYearly: pay.savedYearly,
    takeHomeMonthly: pay.monthly.takeHome,
    netWorth: latest ? { date: latest.date, total: latest.total, ...latest.byGroup } : null,
    recent: {
      months: months.length,
      from: months[0]?.ym ?? null,
      to: months.at(-1)?.ym ?? null,
      /** average spending a month (all expenses, rent and loan payments included) */
      spending: monthlySpending,
      income: monthlyIncome,
      /** average left over a month after spending (income in entries is take-home pay) */
      leftOver: monthlyIncome !== null && monthlySpending !== null ? monthlyIncome - monthlySpending : null
    }
  }
})
