// Retirement projection, year by year, in today's dollars. Pure functions, no Vue, so `npm test`
// can check the math directly. The Retirement page (views/RetirementView.vue) builds the inputs from
// the financial profile, Net worth and Cash flow, then lets you tweak copies of them.
//
// How it works:
// - Everything is in today's dollars. Growth uses the real return, (1 + return) / (1 + inflation) − 1,
//   and saving grows with raises above inflation. The page converts to future dollars for display.
// - While working, each year the balance earns the return and the year's saving is added.
// - From the retirement age on, saving stops and each year's withdrawal comes out:
//     spending (your target, today's dollars)
//     − loan payments that have ended (a fixed payment also shrinks with inflation while it lasts)
//     + health insurance until Medicare at 65
//     − Social Security once it starts
//   grossed up for the tax on withdrawals.
// - Market ups and downs: the same plan is run against many sequences of yearly returns (lognormal,
//   median = the average return), giving the chance the money lasts and a good-years/bad-years range.
// - "Earliest age" is the first retirement age where the plan works through the plan-to age:
//   with average returns, and with at least the chance you ask for.
// - What "works" means is the goal (`keepNestEgg`):
//     money lasts: the balance never runs out before the plan-to age;
//     keep the nest egg: in most of the last 5 years of the plan (3 of 5 year-ends), you still have at
//     least what you retired with, in today's dollars. Dips along the way are allowed; you live off the
//     growth. "Most of the last 5" so one crash in the final year doesn't decide it (Devin, 2026-11-02).
// - Life changes (optional; Devin plans to marry, have kids and buy a home within ~5 years, 2026-11-02):
//     family: from the age you marry, the spouse's saving is added while working, each child costs a
//       yearly amount until 18 (plus child care before school, both parents working), the spouse's
//       Social Security adds to yours, and retirement spending and health insurance are for two;
//     home: the year you buy, the down payment and closing costs come out of the investments; from then
//       on the mortgage (fixed, so it shrinks with inflation and stops at payoff) and the costs of owning
//       replace rent. While working these change what you save; once retired, what you spend.

export interface LoanPayoff {
  /** the fixed monthly payment, in dollars of the day it's paid (it doesn't rise with inflation) */
  monthlyPayment: number
  /** age at the last payment; spending drops from the next year */
  endsAtAge: number
}

export interface Family {
  /** your age when you marry; the spouse's saving and Social Security count from then */
  fromAge: number
  /** spouse's gross salary a year, today's dollars; rises with the same raises as yours */
  spouseSalary: number
  /** share of it the spouse saves into investments, 0–1 */
  spouseSavingRate: number
  /** extra spending a year in retirement for the two of you, today's dollars */
  retiredSpending: number
  /** your age when each child is born */
  kidsAtAge: number[]
  /** what a child costs a year until 18, today's dollars */
  childYearly: number
  /** child care a year per child before school (birth to 5), since both of you work */
  childcareYearly: number
  /**
   * share of the kids and the home (mortgage, tax, insurance, upkeep) the spouse pays from their own
   * paycheck while you both work, 0–1. Left out = 0. Once retired everything comes from the shared
   * investments.
   */
  spouseCostShare?: number
}

export interface Home {
  /** your age when you buy */
  atAge: number
  /** price in today's dollars */
  price: number
  /** down payment and closing costs, shares of the price (0–1); they come out of the investments that year */
  downPayment: number
  closingCosts: number
  /** mortgage rate a year (0–1) and length in years */
  mortgageRate: number
  mortgageYears: number
  /** property tax, insurance and upkeep a year, share of the price (0–1); rises with inflation */
  ownershipRate: number
  /** rent a year today that stops once you own */
  rentYearly: number
}

export interface RetirementInputs {
  /** age today, whole years */
  currentAge: number
  /** invested today (retirement and brokerage accounts) */
  startBalance: number
  /** saved a year today: your 401k, company 401k, paycheck deductions, other saving */
  yearlySaving: number
  /** yearly raise, 0–1; saving grows with it */
  salaryGrowth: number
  /** gross yearly salary today; used for the Social Security estimate */
  salary: number
  /** yearly investment return before inflation, 0–1 (the average year) */
  returnRate: number
  /** yearly inflation, 0–1 */
  inflation: number
  /** spread of yearly returns, 0–1 (standard deviation); 0 means every year is average */
  volatility: number
  /** spending a year in retirement, today's dollars, including today's loan payments */
  retirementSpending: number
  /** loans whose payments are in that spending; they drop out once paid off */
  loans: LoanPayoff[]
  /** health insurance a year until Medicare at 65, today's dollars */
  healthcareBefore65: number
  /** tax on what you take out, 0–1 (Roth and HSA money is tax-free) */
  withdrawalTax: number
  /** Social Security a year, today's dollars; null estimates it from your salary */
  socialSecurity: number | null
  socialSecurityAge: number
  /** the age you'd like to retire at */
  targetAge: number
  /** plan for the money to last until this age */
  planToAge: number
  /** the goal: false (or left out) = the money lasts; true = still have what you retired with at the end */
  keepNestEgg?: boolean
  /** a spouse and kids; left out = just you */
  family?: Family
  /** buying a home instead of renting; left out = keep renting */
  home?: Home
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
  /** first age the money can't cover a full year, or null when it lasts through the plan-to age */
  runsOutAt: number | null
  /** balance on the day you retire */
  atRetirement: number
  /** balance after the plan-to age (the last point) */
  atEnd: number
  /** year-end balances of the last 5 years of the plan (fewer when retired for less), oldest first */
  lastYears: number[]
  /** the goal is met: the money lasts, and with keepNestEgg it ends at least where it started */
  works: boolean
}

export interface RangeYear {
  age: number
  /** bad years: 1 in 10 runs ends lower */
  low: number
  median: number
  /** good years: 1 in 10 runs ends higher */
  high: number
}

export interface RetirementResult {
  /** retiring at the target age, average returns every year */
  target: Projection
  /** earliest age the goal is met with average returns, null when it never is */
  earliestAge: number | null
  /** earliest age the goal is met in at least `confidence` of the runs, null when it never is */
  earliestConfident: number | null
  /** share of runs where retiring at the target age meets the goal through the plan-to age, 0–1 */
  chanceAtTarget: number
  /** balance range by age when retiring at the target age */
  range: RangeYear[]
  /** balance needed at the target age to meet the goal with average returns (today's dollars; Infinity when no balance can) */
  neededAtTarget: number
  /** Social Security a year used for the target age, today's dollars */
  socialSecurityAtTarget: number
  /** the first retirement year's withdrawal, today's dollars (after loans, health insurance, Social Security, tax) */
  firstWithdrawal: number
  realReturn: number
}

export const realRate = (rate: number, inflation: number): number => (1 + rate) / (1 + inflation) - 1

const clampAge = (age: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(age)))
const ageRange = (inputs: RetirementInputs) => {
  const startAge = Math.round(inputs.currentAge)
  return { startAge, endAge: Math.max(startAge, Math.round(inputs.planToAge)) }
}

/* ---------- Social Security ---------- */

// 2026 figures (SSA): bend points of the benefit formula and the most earnings that count.
export const SOCIAL_SECURITY_2026 = { firstBend: 1286, secondBend: 7749, earningsCap: 184_500, fullAge: 67, careerStart: 22 }

/** Share of the full benefit when claiming at `claimAge` (full retirement age 67). */
export function claimFactor(claimAge: number): number {
  const months = Math.round((Math.min(70, Math.max(62, claimAge)) - SOCIAL_SECURITY_2026.fullAge) * 12)
  if (months >= 0) return 1 + months * (0.08 / 12)
  const early = -months
  return 1 - Math.min(36, early) * (5 / 9 / 100) - Math.max(0, early - 36) * (5 / 12 / 100)
}

/**
 * Rough Social Security a year, today's dollars: today's salary for every year worked from 22 until
 * retiring (the best 35 count, zeros fill the rest), through the 2026 benefit formula, adjusted for
 * the claiming age. Your real estimate is on ssa.gov; this assumes a steady career at today's pay.
 */
export function estimateSocialSecurity(salary: number, retireAge: number, claimAge: number): number {
  const rules = SOCIAL_SECURITY_2026
  const yearsWorked = Math.min(35, Math.max(0, Math.round(retireAge) - rules.careerStart))
  const averageMonthly = ((Math.min(Math.max(0, salary), rules.earningsCap) / 12) * yearsWorked) / 35
  const fullBenefit =
    0.9 * Math.min(averageMonthly, rules.firstBend) +
    0.32 * Math.max(0, Math.min(averageMonthly, rules.secondBend) - rules.firstBend) +
    0.15 * Math.max(0, averageMonthly - rules.secondBend)
  return fullBenefit * 12 * claimFactor(claimAge)
}

/** Your Social Security a year (today's dollars), when retiring at `retireAge`. */
export const ownSocialSecurity = (inputs: RetirementInputs, retireAge: number): number =>
  inputs.socialSecurity ?? estimateSocialSecurity(inputs.salary, retireAge, inputs.socialSecurityAge)

/**
 * The spouse's Social Security a year: their own estimate (same ages and claiming age as you), or the
 * spousal benefit of half of yours if that's more. 0 without a family.
 */
export function spouseSocialSecurity(inputs: RetirementInputs, retireAge: number): number {
  if (!inputs.family) return 0
  const own = estimateSocialSecurity(inputs.family.spouseSalary, retireAge, inputs.socialSecurityAge)
  return Math.max(own, ownSocialSecurity(inputs, retireAge) / 2)
}

/** Social Security a year for the household (you, plus a spouse when there's a family). */
export const socialSecurityFor = (inputs: RetirementInputs, retireAge: number): number =>
  ownSocialSecurity(inputs, retireAge) + spouseSocialSecurity(inputs, retireAge)

/* ---------- family and home ---------- */

/** Monthly payment on a fixed-rate loan. */
export function mortgagePayment(amount: number, yearlyRate: number, years: number): number {
  const months = Math.max(1, Math.round(years * 12))
  const rate = yearlyRate / 12
  if (amount <= 0) return 0
  if (rate <= 0) return amount / months
  return (amount * rate) / (1 - Math.pow(1 + rate, -months))
}

export interface LifeChanges {
  /** the spouse's saving that year (counted while working) */
  spouseSaving: number
  /** kids that year: their cost plus child care */
  kids: number
  /** extra spending for two (counted once retired) */
  couple: number
  /** mortgage payment that year, today's dollars (a fixed payment shrinks with inflation) */
  mortgage: number
  /** property tax, insurance and upkeep */
  ownership: number
  /** rent no longer paid, as a positive amount */
  rentSaved: number
  /** down payment and closing costs, only in the year you buy */
  purchase: number
}

/** Family and home amounts at `age`, today's dollars a year. All zero when neither is in the plan. */
export function lifeAt(inputs: RetirementInputs, age: number): LifeChanges {
  const changes: LifeChanges = { spouseSaving: 0, kids: 0, couple: 0, mortgage: 0, ownership: 0, rentSaved: 0, purchase: 0 }
  const family = inputs.family
  if (family && age >= family.fromAge) {
    const raise = realRate(inputs.salaryGrowth, inputs.inflation)
    const years = Math.max(0, age - Math.round(inputs.currentAge))
    changes.spouseSaving = Math.max(0, family.spouseSalary) * Math.max(0, family.spouseSavingRate) * Math.pow(1 + raise, years)
    changes.couple = Math.max(0, family.retiredSpending)
  }
  if (family) {
    for (const born of family.kidsAtAge) {
      const childAge = age - born
      if (childAge < 0 || childAge >= 18) continue
      changes.kids += Math.max(0, family.childYearly) + (childAge < 5 ? Math.max(0, family.childcareYearly) : 0)
    }
  }
  const home = inputs.home
  if (home && age >= home.atAge) {
    const price = Math.max(0, home.price)
    const down = Math.min(1, Math.max(0, home.downPayment))
    const owned = age - home.atAge
    if (owned === 0) changes.purchase = price * (down + Math.max(0, home.closingCosts))
    if (owned < Math.round(home.mortgageYears)) {
      const payment = mortgagePayment(price * (1 - down), home.mortgageRate, home.mortgageYears) * 12
      changes.mortgage = payment * Math.pow(1 + inputs.inflation, -owned)
    }
    changes.ownership = price * Math.max(0, home.ownershipRate)
    changes.rentSaved = Math.max(0, home.rentYearly)
  }
  return changes
}

/** What owning costs that year compared with renting (+ more, − less), the purchase left out. */
export const homeChange = (life: LifeChanges): number => life.mortgage + life.ownership - life.rentSaved

/* ---------- withdrawals ---------- */

export interface YearBudget {
  /** your spending target */
  target: number
  /** loan payments no longer made (paid off, or worth less after inflation), as a negative amount */
  loanChange: number
  /** health insurance before Medicare (for two once married) */
  healthcare: number
  /** kids, and the extra for two */
  family: number
  /** owning instead of renting: mortgage and costs of owning less the rent (plus the purchase, the year you buy) */
  home: number
  /** spending that year: target + loanChange + healthcare + family + home */
  spending: number
  /** Social Security that year */
  socialSecurity: number
  /** tax on what comes out */
  tax: number
  /** taken out of the investments */
  withdrawal: number
}

/** The year's budget at `age` when retired, today's dollars. */
export function budgetAt(inputs: RetirementInputs, age: number, socialSecurity: number): YearBudget {
  const yearsFromNow = age - inputs.currentAge
  const deflate = Math.pow(1 + inputs.inflation, -Math.max(0, yearsFromNow))
  const target = Math.max(0, inputs.retirementSpending)
  let loanChange = 0
  for (const loan of inputs.loans) {
    const yearly = Math.max(0, loan.monthlyPayment) * 12
    // the target counts today's payment; a fixed payment is worth less each year, and nothing once it's paid off
    loanChange -= yearly - (age <= loan.endsAtAge ? yearly * deflate : 0)
  }
  loanChange = Math.max(loanChange, -target)
  const life = lifeAt(inputs, age)
  const married = !!inputs.family && age >= inputs.family.fromAge
  const healthcare = age < 65 ? Math.max(0, inputs.healthcareBefore65) * (married ? 2 : 1) : 0
  const family = life.kids + life.couple
  // owning can't take spending below zero
  const home = Math.max(homeChange(life) + life.purchase, -(target + loanChange + healthcare + family))
  const spending = target + loanChange + healthcare + family + home
  const fromSocialSecurity = age >= inputs.socialSecurityAge ? Math.min(spending, Math.max(0, socialSecurity)) : 0
  const need = spending - fromSocialSecurity
  const taxRate = Math.min(0.9, Math.max(0, inputs.withdrawalTax))
  const withdrawal = need / (1 - taxRate)
  return { target, loanChange, healthcare, family, home, spending, socialSecurity: fromSocialSecurity, tax: withdrawal - need, withdrawal }
}

/**
 * Saved (+) or taken out (−) at `age` while working, today's dollars: your saving (`saving`, already
 * grown with raises) plus the spouse's, less your part of the kids and of owning (once married the
 * spouse's paycheck pays `spouseCostShare` of them), plus the rent you no longer pay, less the down
 * payment and closing costs the year you buy (from the investments).
 *
 * Before 2026-11-03 the kids and the whole home came out of your saving alone, as if the spouse's pay
 * (beyond what they save) covered none of it; Devin spotted that two kids wiped out ~18 years of saving.
 */
export function workingFlowAt(inputs: RetirementInputs, age: number, saving: number): number {
  const life = lifeAt(inputs, age)
  const family = inputs.family
  const spouseShare = family && age >= family.fromAge ? Math.min(1, Math.max(0, family.spouseCostShare ?? 0)) : 0
  const yours = 1 - spouseShare
  return saving + life.spouseSaving - yours * (life.kids + life.mortgage + life.ownership) + life.rentSaved - life.purchase
}

/** Spending at `age`, today's dollars: the target, with loan payments adjusted, plus health insurance before 65. */
export const spendingAt = (inputs: RetirementInputs, age: number): number => budgetAt(inputs, age, 0).spending

/** What comes out of the investments at `age` when retired, today's dollars (tax included). */
export const withdrawalAt = (inputs: RetirementInputs, age: number, socialSecurity: number): number => budgetAt(inputs, age, socialSecurity).withdrawal

/* ---------- tax on withdrawals ---------- */

/**
 * A starting guess for the tax on withdrawals from account names: Roth and HSA money comes out
 * tax-free, a taxable brokerage account only pays on gains (about 5% of what you take out), and
 * anything else (401k, IRA) is taken as pre-tax at about 12%. Weighted by balance.
 */
export function estimateWithdrawalTax(accounts: { name: string; balance: number }[]): { rate: number; taxFree: string[]; taxable: string[]; preTax: string[] } {
  const taxFree: string[] = []
  const taxable: string[] = []
  const preTax: string[] = []
  let total = 0
  let tax = 0
  for (const account of accounts) {
    const balance = Math.max(0, account.balance)
    total += balance
    if (/roth|hsa/i.test(account.name)) taxFree.push(account.name)
    else if (/taxable|brokerage|individual|reit|stock|crypto|fund/i.test(account.name)) {
      taxable.push(account.name)
      tax += balance * 0.05
    } else {
      preTax.push(account.name)
      tax += balance * 0.12
    }
  }
  return { rate: total ? Math.round((tax / total) * 1000) / 1000 : 0.1, taxFree, taxable, preTax }
}

/* ---------- projection ---------- */

/**
 * Year-by-year balances when retiring at `retireAge`. `returns` gives each year's real return
 * (index 0 = the current age); without it every year earns the average.
 */
export function project(inputs: RetirementInputs, retireAge: number, returns?: ArrayLike<number>): Projection {
  const { startAge, endAge } = ageRange(inputs)
  const retireAt = clampAge(retireAge, startAge, endAge)
  const average = realRate(inputs.returnRate, inputs.inflation)
  const raise = realRate(inputs.salaryGrowth, inputs.inflation)
  const socialSecurity = socialSecurityFor(inputs, retireAt)

  const years: ProjectionYear[] = []
  let balance = Math.max(0, inputs.startBalance)
  let saving = Math.max(0, inputs.yearlySaving)
  let runsOutAt: number | null = null
  let atRetirement = balance
  for (let age = startAge; age <= endAge; age++) {
    const retired = age >= retireAt
    if (age === retireAt) atRetirement = balance
    let flow: number
    if (retired) flow = -withdrawalAt(inputs, age, socialSecurity)
    else {
      flow = workingFlowAt(inputs, age, saving)
      saving *= 1 + raise
    }
    years.push({ age, balance, flow, retired })
    const growth = returns ? returns[age - startAge] : average
    // Saving and spending happen through the year, so they earn about half a year's return.
    const next = balance * (1 + growth) + flow * (1 + growth / 2)
    // the first year spending can't be fully covered (a cent of rounding doesn't count)
    if (next < -0.5 && runsOutAt === null) runsOutAt = age
    balance = Math.max(0, next)
  }
  // a last point for the end of the plan
  years.push({ age: endAge + 1, balance, flow: 0, retired: true })
  const lastYears = years.slice(1).filter((year) => year.age > retireAt).slice(-KEEP_WINDOW).map((year) => year.balance)
  return { retireAge: retireAt, years, runsOutAt, atRetirement, atEnd: balance, lastYears, works: meetsGoal(inputs, runsOutAt === null, atRetirement, lastYears) }
}

/** Keeping the nest egg is judged on this many final year-ends; most of them must be at or above it. */
export const KEEP_WINDOW = 5

/**
 * The goal check shared by project() and chanceItLasts(). `lastYears` are the final year-end balances
 * after retiring (up to KEEP_WINDOW). A cent of rounding doesn't count.
 */
function meetsGoal(inputs: RetirementInputs, lasted: boolean, atRetirement: number, lastYears: ArrayLike<number>): boolean {
  if (!lasted) return false
  if (!inputs.keepNestEgg || lastYears.length === 0) return true
  let kept = 0
  for (let index = 0; index < lastYears.length; index++) if (lastYears[index] >= atRetirement - 0.5) kept++
  return kept * 2 > lastYears.length
}

/**
 * What it takes to meet the goal from `age` to the plan-to age with average returns (today's dollars).
 * Money lasts: the present value of the withdrawals, at the real return. Keep the nest egg: the
 * smallest balance that passes the goal (most of the last 5 year-ends at or above it), found by
 * halving; more money always helps, since it grows faster than the bar rises. Infinity when the
 * return can't keep any balance (zero or less after inflation, with something to withdraw).
 */
export function neededAt(inputs: RetirementInputs, age: number): number {
  const growth = realRate(inputs.returnRate, inputs.inflation)
  const socialSecurity = socialSecurityFor(inputs, age)
  const first = Math.round(age)
  const last = Math.round(inputs.planToAge)
  const withdrawals: number[] = []
  for (let year = first; year <= last; year++) withdrawals.push(withdrawalAt(inputs, year, socialSecurity))
  let needed = 0
  // same mid-year timing as project()
  withdrawals.forEach((amount, index) => (needed += (amount * (1 + growth / 2)) / Math.pow(1 + growth, index + 1)))
  if (!inputs.keepNestEgg || needed <= 0) return Math.max(0, needed)
  if (growth <= 0) return Infinity

  const keeps = (start: number) => {
    let balance = start
    const ends: number[] = []
    for (const amount of withdrawals) {
      balance = balance * (1 + growth) - amount * (1 + growth / 2)
      if (balance < -0.5) return false
      ends.push(balance)
    }
    return meetsGoal(inputs, true, start, ends.slice(-KEEP_WINDOW))
  }
  let low = needed
  let high = needed * 2
  for (let tries = 0; !keeps(high); tries++) {
    if (tries > 60) return Infinity
    low = high
    high *= 2
  }
  for (let step = 0; step < 60 && high - low > 0.5; step++) {
    const middle = (low + high) / 2
    if (keeps(middle)) high = middle
    else low = middle
  }
  return high
}

/* ---------- market ups and downs ---------- */

export const RUNS = 500

// Seeded, so the same inputs always give the same answer (and moving one input doesn't reshuffle the luck).
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

let shockCache: { years: number; shocks: Float64Array[] } | null = null
/** Standard normal draws, one row per run and one column per year; the same every time. */
function shocks(years: number): Float64Array[] {
  if (shockCache && shockCache.years >= years) return shockCache.shocks
  const random = seededRandom(20261101)
  const rows = Array.from({ length: RUNS }, () => {
    const row = new Float64Array(years)
    for (let year = 0; year < years; year++) {
      // Box–Muller
      const u = Math.max(random(), 1e-12)
      row[year] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
    }
    return row
  })
  shockCache = { years, shocks: rows }
  return rows
}

/** Yearly real returns for each run: lognormal around the average, so the middle run matches average returns. */
export function returnPaths(inputs: RetirementInputs): Float64Array[] {
  const { startAge, endAge } = ageRange(inputs)
  const years = endAge - startAge + 1
  const center = Math.log(1 + realRate(inputs.returnRate, inputs.inflation))
  const spread = Math.max(0, inputs.volatility)
  return shocks(years).map((row) => {
    const path = new Float64Array(years)
    for (let year = 0; year < years; year++) path[year] = Math.exp(center + spread * row[year]) - 1
    return path
  })
}

/** Each year's saving (+) or withdrawal (−) when retiring at `retireAge`; the same in every run. */
function flows(inputs: RetirementInputs, retireAge: number): Float64Array {
  // the last entry of project() is the end-of-plan point, not a year
  return Float64Array.from(project(inputs, retireAge).years.slice(0, -1), (year) => year.flow)
}

/** Share of runs that meet the goal through the plan-to age when retiring at `retireAge` (same math as project(), no arrays). */
export function chanceItLasts(inputs: RetirementInputs, retireAge: number, paths = returnPaths(inputs)): number {
  if (inputs.volatility <= 0) return project(inputs, retireAge).works ? 1 : 0
  const yearly = flows(inputs, retireAge)
  const { startAge, endAge } = ageRange(inputs)
  const retireIndex = clampAge(retireAge, startAge, endAge) - startAge
  // the year-ends that count for keeping the nest egg: the last KEEP_WINDOW, and only after retiring
  const firstCounted = Math.max(retireIndex, yearly.length - KEEP_WINDOW)
  const lastYears = new Float64Array(Math.max(0, yearly.length - firstCounted))
  let lasted = 0
  for (const path of paths) {
    let balance = Math.max(0, inputs.startBalance)
    let atRetirement = balance
    let ok = true
    for (let year = 0; year < yearly.length; year++) {
      if (year === retireIndex) atRetirement = balance
      const next = balance * (1 + path[year]) + yearly[year] * (1 + path[year] / 2)
      if (year >= firstCounted) lastYears[year - firstCounted] = next
      if (next < -0.5) {
        ok = false
        break
      }
      balance = next
    }
    if (ok && meetsGoal(inputs, true, atRetirement, lastYears)) lasted++
  }
  return lasted / paths.length
}

const percentile = (sorted: number[], share: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))))]

export function retirement(inputs: RetirementInputs, confidence = 0.9): RetirementResult {
  const { startAge, endAge } = ageRange(inputs)
  const paths = returnPaths(inputs)

  let earliestAge: number | null = null
  for (let age = startAge; age <= endAge && earliestAge === null; age++) if (project(inputs, age).works) earliestAge = age

  let earliestConfident: number | null = null
  for (let age = earliestAge ?? endAge + 1; age <= endAge && earliestConfident === null; age++)
    if (chanceItLasts(inputs, age, paths) >= confidence - 1e-9) earliestConfident = age
  // with no ups and downs, "confident" is just "average"
  if (inputs.volatility <= 0) earliestConfident = earliestAge

  const target = project(inputs, inputs.targetAge)
  const runs = paths.map((path) => project(inputs, target.retireAge, path))
  const range: RangeYear[] = target.years.map((year, index) => {
    const balances = runs.map((run) => run.years[index].balance).sort((a, b) => a - b)
    return { age: year.age, low: percentile(balances, 0.1), median: percentile(balances, 0.5), high: percentile(balances, 0.9) }
  })
  const chanceAtTarget = inputs.volatility <= 0 ? (target.works ? 1 : 0) : runs.filter((run) => run.works).length / runs.length
  const socialSecurityAtTarget = socialSecurityFor(inputs, target.retireAge)

  return {
    target,
    earliestAge,
    earliestConfident,
    chanceAtTarget,
    range,
    neededAtTarget: neededAt(inputs, target.retireAge),
    socialSecurityAtTarget,
    firstWithdrawal: withdrawalAt(inputs, target.retireAge, socialSecurityAtTarget),
    realReturn: realRate(inputs.returnRate, inputs.inflation)
  }
}
