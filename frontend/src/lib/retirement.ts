// Retirement projection: year by year, in today's dollars. Pure functions, no Vue, so `npm test`
// can check the math directly. The Retirement page (views/RetirementView.vue) builds the inputs from
// the financial profile and Net worth, then lets you tweak copies of them.
//
// How it works:
// - Everything is in today's dollars: growth uses the real return, (1 + return) / (1 + inflation) − 1,
//   and contributions grow with raises above inflation.
// - While working, each year the balance earns the return and the year's contributions are added.
// - From the retirement age on, contributions stop and the year's spending is taken out, less Social
//   Security once it starts.
// - "Earliest age" is the first age where retiring that year keeps the money from running out before
//   the plan-to age. Taxes in retirement aren't modelled: spending is what you'd take out.

export interface RetirementInputs {
  /** age today, whole years */
  currentAge: number
  /** invested today (retirement and brokerage accounts) */
  startBalance: number
  /** saved a year today: your 401k, company 401k, paycheck deductions, other saving */
  yearlySaving: number
  /** yearly raise, 0–1; contributions grow with it */
  salaryGrowth: number
  /** yearly investment return before inflation, 0–1 */
  returnRate: number
  /** yearly inflation, 0–1 */
  inflation: number
  /** spending a year in retirement, today's dollars */
  retirementSpending: number
  /** Social Security a year, today's dollars (0 to leave it out) */
  socialSecurity: number
  socialSecurityAge: number
  /** the age you'd like to retire at */
  targetAge: number
  /** plan for the money to last until this age */
  planToAge: number
}

export interface ProjectionYear {
  age: number
  /** balance at the start of that age, today's dollars */
  balance: number
  /** saved (positive) or taken out (negative) during the year */
  flow: number
  retired: boolean
}

export interface Projection {
  retireAge: number
  years: ProjectionYear[]
  /** first age the money can't cover a full year's spending, or null when it lasts through the plan-to age */
  runsOutAt: number | null
  /** balance on the day you retire */
  atRetirement: number
}

export interface RetirementResult {
  /** the projection for retiring at the target age */
  target: Projection
  /** earliest age the money lasts to the plan-to age, null when it never does */
  earliestAge: number | null
  /** balance needed at the target age for the money to last (today's dollars) */
  neededAtTarget: number
  /** the return after inflation used for the projection */
  realReturn: number
}

export const realRate = (rate: number, inflation: number): number => (1 + rate) / (1 + inflation) - 1

const clampAge = (age: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(age)))

/** Year-by-year balances when retiring at `retireAge`. */
export function project(inputs: RetirementInputs, retireAge: number): Projection {
  const startAge = Math.round(inputs.currentAge)
  const endAge = Math.max(startAge, Math.round(inputs.planToAge))
  const retireAt = clampAge(retireAge, startAge, endAge)
  const growth = realRate(inputs.returnRate, inputs.inflation)
  const raise = realRate(inputs.salaryGrowth, inputs.inflation)

  const years: ProjectionYear[] = []
  let balance = Math.max(0, inputs.startBalance)
  let saving = Math.max(0, inputs.yearlySaving)
  let runsOutAt: number | null = null
  let atRetirement = balance
  for (let age = startAge; age <= endAge; age++) {
    const retired = age >= retireAt
    if (age === retireAt) atRetirement = balance
    let flow: number
    if (retired) {
      const socialSecurity = age >= inputs.socialSecurityAge ? Math.max(0, inputs.socialSecurity) : 0
      flow = -Math.max(0, inputs.retirementSpending - socialSecurity)
    } else {
      flow = saving
      saving *= 1 + raise
    }
    years.push({ age, balance, flow, retired })
    // Saving and spending happen through the year, so they earn about half a year's return.
    const next = balance * (1 + growth) + flow * (1 + growth / 2)
    // the first year spending can't be fully covered (a cent of rounding doesn't count)
    if (next < -0.5 && runsOutAt === null) runsOutAt = age
    balance = Math.max(0, next)
  }
  // a last point for the end of the plan
  if (endAge >= startAge) years.push({ age: endAge + 1, balance, flow: 0, retired: true })
  return { retireAge: retireAt, years, runsOutAt, atRetirement }
}

/**
 * What it takes for the money to last from `age` to the plan-to age: the present value of the
 * spending not covered by Social Security, at the real return (today's dollars).
 */
export function neededAt(inputs: RetirementInputs, age: number): number {
  const growth = realRate(inputs.returnRate, inputs.inflation)
  let needed = 0
  for (let year = Math.round(age); year <= Math.round(inputs.planToAge); year++) {
    const socialSecurity = year >= inputs.socialSecurityAge ? Math.max(0, inputs.socialSecurity) : 0
    const draw = Math.max(0, inputs.retirementSpending - socialSecurity)
    // same mid-year timing as project()
    needed += (draw * (1 + growth / 2)) / Math.pow(1 + growth, year - Math.round(age) + 1)
  }
  return needed
}

export function retirement(inputs: RetirementInputs): RetirementResult {
  const startAge = Math.round(inputs.currentAge)
  const endAge = Math.max(startAge, Math.round(inputs.planToAge))
  let earliestAge: number | null = null
  for (let age = startAge; age <= endAge; age++) {
    if (project(inputs, age).runsOutAt === null) {
      earliestAge = age
      break
    }
  }
  const target = project(inputs, inputs.targetAge)
  return { target, earliestAge, neededAtTarget: neededAt(inputs, target.retireAge), realReturn: realRate(inputs.returnRate, inputs.inflation) }
}
