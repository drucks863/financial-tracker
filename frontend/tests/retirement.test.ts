// Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  budgetAt,
  chanceItLasts,
  claimFactor,
  estimateSocialSecurity,
  estimateWithdrawalTax,
  accessAgeFor,
  isBrokerage,
  lifeAt,
  mortgagePayment,
  socialSecurityFor,
  workingFlowAt,
  neededAt,
  project,
  realRate,
  retirement,
  type RetirementInputs
} from '../src/lib/retirement.ts'
import { applyOverrides, cleanOverrides } from '../src/lib/scenario.ts'

const base: RetirementInputs = {
  currentAge: 30,
  startBalance: 50_000,
  yearlySaving: 20_000,
  salaryGrowth: 0.03,
  returnRate: 0.07,
  inflation: 0.03,
  retirementSpending: 50_000,
  salary: 85_000,
  volatility: 0,
  loans: [],
  healthcareBefore65: 0,
  withdrawalTax: 0,
  socialSecurity: 0,
  socialSecurityAge: 67,
  targetAge: 65,
  planToAge: 95
}
const near = (actual: number, expected: number, tolerance = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

test('real return takes inflation out', () => {
  near(realRate(0.07, 0.03), 0.038835, 0.000001)
  assert.equal(realRate(0.03, 0.03), 0)
})

test('with no return, saving just adds up and spending just comes out', () => {
  const flat = { ...base, returnRate: 0.03, inflation: 0.03, salaryGrowth: 0.03, startBalance: 10_000, yearlySaving: 1_000, retirementSpending: 2_000, currentAge: 60, targetAge: 62, planToAge: 70 }
  const run = project(flat, 62)
  assert.equal(run.atRetirement, 12_000) // two years of saving
  assert.deepEqual(
    run.years.map((year) => [year.age, year.balance]),
    [
      [60, 10_000],
      [61, 11_000],
      [62, 12_000],
      [63, 10_000],
      [64, 8_000],
      [65, 6_000],
      [66, 4_000],
      [67, 2_000],
      [68, 0],
      [69, 0],
      [70, 0],
      [71, 0]
    ]
  )
  assert.equal(run.runsOutAt, 68)
})

test('money lasting exactly to the plan-to age does not count as running out', () => {
  const flat = { ...base, returnRate: 0, inflation: 0, salaryGrowth: 0, startBalance: 10_000, yearlySaving: 0, retirementSpending: 1_000, currentAge: 60, targetAge: 60, planToAge: 69 }
  assert.equal(project(flat, 60).runsOutAt, null) // ten years of 1,000 from 10,000
  assert.equal(project({ ...flat, planToAge: 70 }, 60).runsOutAt, 70)
})

test('earliest age is the first one where the money lasts', () => {
  const result = retirement(base)
  assert.ok(result.earliestAge !== null)
  const earliest = result.earliestAge!
  assert.equal(project(base, earliest).runsOutAt, null)
  assert.notEqual(project(base, earliest - 1).runsOutAt, null)
})

test('saving more or spending less retires you sooner; Social Security helps', () => {
  const earliest = (inputs: RetirementInputs) => retirement(inputs).earliestAge!
  assert.ok(earliest({ ...base, yearlySaving: 30_000 }) < earliest(base))
  assert.ok(earliest({ ...base, retirementSpending: 40_000 }) < earliest(base))
  assert.ok(earliest({ ...base, socialSecurity: 24_000 }) < earliest(base))
  assert.ok(earliest({ ...base, returnRate: 0.05 }) > earliest(base))
})

test('needed balance matches what project() draws down', () => {
  const inputs = { ...base, socialSecurity: 20_000 }
  const needed = neededAt(inputs, 60)
  // starting retirement with exactly that much lasts, a little less doesn't
  const exact = project({ ...inputs, currentAge: 60, startBalance: needed, yearlySaving: 0 }, 60)
  assert.equal(exact.runsOutAt, null)
  near(exact.years.at(-1)!.balance, 0, 1)
  assert.notEqual(project({ ...inputs, currentAge: 60, startBalance: needed - 1_000, yearlySaving: 0 }, 60).runsOutAt, null)
})

test('keep the nest egg: needs more, ends where it started, and retires later', () => {
  const inputs = { ...base, socialSecurity: 20_000, keepNestEgg: true }
  const needed = neededAt(inputs, 60)
  assert.ok(needed > neededAt({ ...inputs, keepNestEgg: false }, 60))
  // retiring with exactly that much keeps it in most of the last 5 years, a little less doesn't
  const exact = project({ ...inputs, currentAge: 60, startBalance: needed, yearlySaving: 0 }, 60)
  assert.ok(exact.works)
  assert.equal(exact.lastYears.length, 5)
  assert.ok(exact.lastYears.filter((balance) => balance >= needed - 0.5).length >= 3)
  const short = project({ ...inputs, currentAge: 60, startBalance: needed - 1_000, yearlySaving: 0 }, 60)
  assert.equal(short.runsOutAt, null) // it still lasts...
  assert.ok(!short.works) // ...but the nest egg shrank
  // a harder goal means a later earliest age, with or without ups and downs
  assert.ok(retirement(inputs).earliestAge! > retirement({ ...inputs, keepNestEgg: false }).earliestAge!)
  const shaky = { ...inputs, volatility: 0.15 }
  // (here keeping it 8 in 10 times never happens before 95, so there's no earliest age at all)
  assert.ok((retirement(shaky, 0.8).earliestConfident ?? Infinity) > retirement({ ...shaky, keepNestEgg: false }, 0.8).earliestConfident!)
  assert.ok(chanceItLasts(shaky, 55) <= chanceItLasts({ ...shaky, keepNestEgg: false }, 55))
  // one bad final year doesn't decide it: 4 of the last 5 kept is enough, 2 of 5 isn't
  const pathWith = (finalYears: number[]) => {
    const steady = { ...inputs, currentAge: 60, startBalance: 1_000_000, yearlySaving: 0, retirementSpending: 0, socialSecurity: 0, planToAge: 69, volatility: 0.15 }
    return chanceItLasts(steady, 60, [Float64Array.from([0, 0, 0, 0, 0, ...finalYears])])
  }
  assert.equal(pathWith([0, 0, 0, 0, -0.3]), 1)
  assert.equal(pathWith([0, 0, -0.1, 0, 0]), 0) // down 10% at 67 and never back: 2 of 5 kept
  // no return after inflation: no balance can be kept while withdrawing
  assert.equal(neededAt({ ...inputs, returnRate: 0.03 }, 60), Infinity)
})

test('never retiring in time gives no earliest age', () => {
  assert.equal(retirement({ ...base, startBalance: 0, yearlySaving: 0 }).earliestAge, null)
})

test('a target age before today retires now', () => {
  assert.equal(project(base, 20).retireAge, 30)
})

test('overrides apply on top of the real numbers, and matching ones are dropped', () => {
  const real = { salary: 90_000, k401: 0.06 }
  assert.deepEqual(applyOverrides(real, { k401: 0.1 }), { salary: 90_000, k401: 0.1 })
  // junk from storage is ignored
  assert.deepEqual(applyOverrides(real, { k401: Number.NaN, gone: 5 } as never), real)
  assert.deepEqual(cleanOverrides(real, { salary: 90_000, k401: 0.1 }), { k401: 0.1 })
})

test('Social Security estimate follows the 2026 formula and the claiming age', () => {
  // $85k for 35 years: average $7,083/mo → 90% of $1,286 + 32% of the rest
  near(estimateSocialSecurity(85_000, 65, 67), (0.9 * 1286 + 0.32 * (85_000 / 12 - 1286)) * 12, 1)
  near(claimFactor(62), 0.7, 1e-9)
  near(claimFactor(70), 1.24, 1e-9)
  near(claimFactor(67), 1, 1e-9)
  // fewer working years, a smaller benefit; earnings above the cap don't count
  assert.ok(estimateSocialSecurity(85_000, 45, 67) < estimateSocialSecurity(85_000, 65, 67))
  near(estimateSocialSecurity(500_000, 65, 67), estimateSocialSecurity(184_500, 65, 67), 0.01)
  // null means "estimate it" in the projection
  assert.ok(retirement({ ...base, socialSecurity: null }).earliestAge! < retirement(base).earliestAge!)
})

test('the retirement budget: loans stop at payoff, health insurance until 65, Social Security, tax', () => {
  const inputs = {
    ...base,
    inflation: 0,
    returnRate: 0,
    retirementSpending: 60_000,
    loans: [{ monthlyPayment: 1_000, endsAtAge: 58 }],
    healthcareBefore65: 8_400,
    withdrawalTax: 0.2
  }
  const at55 = budgetAt(inputs, 55, 24_000)
  assert.equal(at55.loanChange, 0) // still paying, no inflation to shrink it
  assert.equal(at55.healthcare, 8_400)
  assert.equal(at55.socialSecurity, 0) // not until 67
  near(at55.withdrawal, (60_000 + 8_400) / 0.8, 0.01)
  near(at55.tax, at55.withdrawal - 68_400, 0.01)
  const at70 = budgetAt(inputs, 70, 24_000)
  assert.equal(at70.loanChange, -12_000)
  assert.equal(at70.healthcare, 0)
  assert.equal(at70.socialSecurity, 24_000)
  near(at70.withdrawal, (60_000 - 12_000 - 24_000) / 0.8, 0.01)
  // with inflation, a fixed payment is worth less in today's dollars while it lasts
  const inflated = budgetAt({ ...inputs, inflation: 0.03 }, 40, 0)
  near(inflated.loanChange, -(12_000 - 12_000 / Math.pow(1.03, 10)), 0.01)
})

test('ups and downs: the middle run matches average years, and the chance drops as spending rises', () => {
  const shaky = { ...base, volatility: 0.15 }
  const result = retirement(shaky, 0.9)
  const retireIndex = result.target.years.findIndex((year) => year.age === result.target.retireAge)
  // the median balance at retirement is close to the average-years balance
  const median = result.range[retireIndex].median
  assert.ok(Math.abs(median - result.target.atRetirement) / result.target.atRetirement < 0.15, `${median} vs ${result.target.atRetirement}`)
  assert.ok(result.range.every((year) => year.low <= year.median && year.median <= year.high))
  // wanting more certainty means retiring later
  assert.ok(result.earliestConfident! >= result.earliestAge!)
  assert.ok(chanceItLasts({ ...shaky, retirementSpending: 90_000 }, 55) < chanceItLasts(shaky, 55))
  // the same inputs give the same answer
  assert.equal(chanceItLasts(shaky, 55), chanceItLasts(shaky, 55))
})

test('tax guess from account names', () => {
  const guess = estimateWithdrawalTax([
    { name: 'Roth IRA', balance: 50_000 },
    { name: 'HSA', balance: 10_000 },
    { name: 'Taxable', balance: 20_000 },
    { name: '401k', balance: 20_000 }
  ])
  near(guess.rate, (20_000 * 0.05 + 20_000 * 0.12) / 100_000, 0.001)
  assert.deepEqual(guess.taxFree, ['Roth IRA', 'HSA'])
  assert.deepEqual(guess.preTax, ['401k'])
})

/* ---------- family and home ---------- */

const family = {
  fromAge: 32,
  spouseSalary: 60_000,
  spouseSavingRate: 0.1,
  retiredSpending: 12_000,
  kidsAtAge: [33, 35],
  childYearly: 18_000,
  childcareYearly: 13_000
}
const home = {
  atAge: 34,
  price: 400_000,
  downPayment: 0.2,
  closingCosts: 0.03,
  mortgageRate: 0.065,
  mortgageYears: 30,
  ownershipRate: 0.025,
  rentYearly: 18_000
}

test('mortgage payment matches the usual formula', () => {
  near(mortgagePayment(320_000, 0.065, 30), 2022.62, 0.01)
  near(mortgagePayment(12_000, 0, 1), 1_000, 0.001)
})

test('family: spouse saving from the wedding, kids until 18 with child care before 5', () => {
  const inputs = { ...base, salaryGrowth: 0.03, inflation: 0.03, family }
  assert.deepEqual(lifeAt(inputs, 31), { spouseSaving: 0, kids: 0, college: 0, couple: 0, mortgage: 0, ownership: 0, rentSaved: 0, purchase: 0 })
  const at32 = lifeAt(inputs, 32)
  near(at32.spouseSaving, 6_000) // no raise above inflation
  assert.equal(at32.kids, 0)
  assert.equal(lifeAt(inputs, 33).kids, 31_000) // one baby, with child care
  assert.equal(lifeAt(inputs, 36).kids, 62_000) // two under 5
  assert.equal(lifeAt(inputs, 38).kids, 18_000 + 31_000) // the first is 5, in school
  assert.equal(lifeAt(inputs, 50).kids, 18_000 + 18_000) // 17 and 15
  assert.equal(lifeAt(inputs, 51).kids, 18_000) // the first turned 18
  assert.equal(lifeAt(inputs, 53).kids, 0)
  // while working the kids come out of what's saved
  near(workingFlowAt(inputs, 33, 20_000), 20_000 + 6_000 - 31_000)
})

test('family: health insurance for two, spending for two and the spouse’s Social Security', () => {
  const inputs = { ...base, healthcareBefore65: 8_400, socialSecurity: 24_000, family: { ...family, kidsAtAge: [] } }
  const early = budgetAt(inputs, 60, socialSecurityFor(inputs, 60), 60)
  assert.equal(early.healthcare, 16_800)
  assert.equal(early.family, 12_000)
  // the spouse gets their own estimate or half of yours, whichever is more
  const spouse = Math.max(estimateSocialSecurity(60_000, 60, 67), 12_000)
  near(socialSecurityFor(inputs, 60), 24_000 + spouse)
  assert.equal(socialSecurityFor({ ...base, socialSecurity: 24_000 }, 60), 24_000)
})

test('home: down payment the year you buy, then mortgage and owning instead of rent', () => {
  const inputs = { ...base, inflation: 0.03, home }
  assert.equal(lifeAt(inputs, 33).purchase, 0)
  const bought = lifeAt(inputs, 34)
  assert.equal(bought.purchase, 92_000) // 20% down + 3% closing
  near(bought.mortgage, 2022.62 * 12, 0.5)
  assert.equal(bought.ownership, 10_000)
  assert.equal(bought.rentSaved, 18_000)
  near(workingFlowAt(inputs, 34, 20_000), 20_000 - 92_000 - (2022.62 * 12 + 10_000 - 18_000), 0.5)
  // a fixed payment is worth less each year, and stops after 30 years
  near(lifeAt(inputs, 44).mortgage, (2022.62 * 12) / Math.pow(1.03, 10), 0.5)
  assert.equal(lifeAt(inputs, 64).mortgage, 0)
  // paid off in retirement: owning costs less than the rent did
  const retired = budgetAt(inputs, 70, 0)
  assert.equal(retired.home, -8_000)
  assert.equal(retired.spending, 42_000)
})

test('family and home push the earliest age later; leaving them out changes nothing', () => {
  const plain = retirement(base)
  assert.deepEqual(retirement({ ...base, family: undefined, home: undefined }).earliestAge, plain.earliestAge)
  const kids = retirement({ ...base, family: { ...family, spouseSavingRate: 0, retiredSpending: 0 } })
  assert.ok((kids.earliestAge ?? 999) > (plain.earliestAge ?? 0))
})

test('family: the spouse pays their share of the kids and the home while working, none once retired', () => {
  const inputs = { ...base, inflation: 0.03, salaryGrowth: 0.03, family: { ...family, spouseCostShare: 0.5 }, home: { ...home, atAge: 36 } }
  // 33: married, one baby: half of 31,000 comes out of saving
  near(workingFlowAt(inputs, 33, 20_000), 20_000 + 6_000 - 15_500)
  // 37: a year after buying, two kids under 5: half of the kids and owning, the whole rent back
  const life = lifeAt(inputs, 37)
  near(workingFlowAt(inputs, 37, 20_000), 20_000 + 6_000 - 0.5 * (life.kids + life.mortgage + life.ownership) + 18_000)
  // the down payment still comes out of the investments in full
  near(workingFlowAt(inputs, 36, 0) - workingFlowAt({ ...inputs, home: undefined }, 36, 0), -0.5 * (lifeAt(inputs, 36).mortgage + 10_000) + 18_000 - 92_000, 0.5)
  // retired: the whole cost is in the budget
  assert.equal(budgetAt(inputs, 50, 0, 50).family, 36_000 + 12_000)
  // before the wedding there's no one to share with
  const early = { ...inputs, family: { ...inputs.family, fromAge: 40 } }
  near(workingFlowAt(early, 33, 20_000), 20_000 - 31_000)
})

/* ---------- getting at the money, flexible spending, later-life costs ---------- */

test('retirement accounts open at 60, or at the retire age under the rule of 55', () => {
  assert.equal(accessAgeFor(50), 60)
  assert.equal(accessAgeFor(54), 60)
  assert.equal(accessAgeFor(55), 55)
  assert.equal(accessAgeFor(58), 58)
  assert.equal(accessAgeFor(65), 60)
  assert.ok(isBrokerage('Schwab Brokerage'))
  assert.ok(!isBrokerage('Roth Brokerage'))
  assert.ok(!isBrokerage('401k'))
})

test('before 60 spending comes from the brokerage first, then 401k money with a 10% penalty', () => {
  const flat = { ...base, returnRate: 0.03, inflation: 0.03, salaryGrowth: 0.03, currentAge: 50, targetAge: 50, planToAge: 62, yearlySaving: 0, retirementSpending: 10_000, socialSecurity: 0 }
  // all reachable: no penalty (and with no account split given, nothing changes from before)
  const open = project({ ...flat, startBalance: 200_000 }, 50)
  assert.equal(open.penalties, 0)
  near(open.years.find((year) => year.age === 60)!.balance, 100_000)
  // only $30k in the brokerage: three years from it, then 10%-penalized 401k money until 60
  const split = project({ ...flat, startBalance: 200_000, startOpen: 30_000 }, 50)
  assert.equal(split.years.find((year) => year.age === 52)!.penalty, 0)
  near(split.years.find((year) => year.age === 53)!.penalty, 10_000 / 0.9 * 0.1, 0.01)
  near(split.penalties, 7 * (10_000 / 0.9) * 0.1, 0.5)
  assert.equal(split.years.find((year) => year.age === 60)!.penalty, 0)
  // retiring at 55 under the rule of 55: no penalty at all
  const at55 = project({ ...flat, currentAge: 55, targetAge: 55, startBalance: 200_000, startOpen: 0 }, 55)
  assert.equal(at55.penalties, 0)
})

test('saving splits between the brokerage and retirement accounts', () => {
  const flat = { ...base, returnRate: 0.03, inflation: 0.03, salaryGrowth: 0.03, currentAge: 50, targetAge: 52, planToAge: 60, startBalance: 0, startOpen: 0, yearlySaving: 10_000, openSaving: 4_000 }
  const run = project(flat, 52)
  assert.equal(run.years.find((year) => year.age === 52)!.open, 8_000)
  assert.equal(run.atRetirement, 20_000)
})

test('flexible spending cuts the target only after a big drop', () => {
  const flat = { ...base, returnRate: 0.03, inflation: 0.03, currentAge: 60, targetAge: 60, planToAge: 70, yearlySaving: 0, startBalance: 100_000, retirementSpending: 10_000, socialSecurity: 0, cutInBadYears: 0.2 }
  const run = project(flat, 60)
  // 100k → 90k → 80k: at 80k it's 20% down, so not yet; below that the target is 8,000
  assert.deepEqual(
    run.years.slice(0, 5).map((year) => [year.age, Math.round(year.balance), year.cut]),
    [
      [60, 100_000, false],
      [61, 90_000, false],
      [62, 80_000, false],
      [63, 70_000, true],
      [64, 62_000, true]
    ]
  )
})

test('spending drops from 75, Medicare is added from 65, Social Security can be cut', () => {
  const inputs = { ...base, spendingAfter75: 0.8, healthcareAfter65: 8_400, healthcareBefore65: 10_000, socialSecurityCut: 0.2, socialSecurityCutAge: 70 }
  assert.equal(budgetAt(inputs, 74, 0).target, 50_000)
  assert.equal(budgetAt(inputs, 75, 0).target, 40_000)
  assert.equal(budgetAt(inputs, 64, 0).healthcare, 10_000)
  assert.equal(budgetAt(inputs, 65, 0).healthcare, 8_400)
  assert.equal(budgetAt(inputs, 69, 20_000).socialSecurity, 20_000)
  assert.equal(budgetAt(inputs, 70, 20_000).socialSecurity, 16_000)
})

test('family: college for 4 years, and a spouse who keeps working after you retire', () => {
  const inputs = { ...base, healthcareBefore65: 8_400, family: { ...family, kidsAtAge: [30], collegeYearly: 25_000, spouseCostShare: 0.5, spouseRetireAge: 58 } }
  assert.equal(lifeAt(inputs, 47).college, 0)
  assert.equal(lifeAt(inputs, 48).college, 25_000)
  assert.equal(lifeAt(inputs, 51).college, 25_000)
  assert.equal(lifeAt(inputs, 52).college, 0)
  // retired at 50 with the spouse still working: their plan covers you, they pay half the college, no "for two" extra yet
  const working = budgetAt(inputs, 50, 0, 50)
  assert.equal(working.healthcare, 0)
  assert.equal(working.family, 25_000)
  assert.equal(working.spousePays, 12_500)
  // once they stop: insurance for two, the extra for two, nothing from their paycheck
  const both = budgetAt(inputs, 58, 0, 50)
  assert.equal(both.healthcare, 16_800)
  assert.equal(both.family, 12_000)
  assert.equal(both.spousePays, 0)
  // the spouse's saving keeps going in while they work
  const run = project({ ...inputs, salaryGrowth: 0.03, inflation: 0.03, yearlySaving: 0 }, 50)
  assert.ok(run.years.find((year) => year.age === 55)!.flow > run.years.find((year) => year.age === 58)!.flow)
})

test('part-time work covers spending until the age set', () => {
  const inputs = { ...base, partTimeYearly: 20_000, partTimeUntilAge: 60 }
  assert.equal(budgetAt(inputs, 59, 0).partTime, 20_000)
  assert.equal(budgetAt(inputs, 59, 0).withdrawal, 30_000)
  assert.equal(budgetAt(inputs, 60, 0).partTime, 0)
  // never more than what's needed
  assert.equal(budgetAt({ ...inputs, partTimeYearly: 80_000 }, 59, 0).withdrawal, 0)
  assert.ok((retirement(inputs).earliestAge ?? 99) < (retirement(base).earliestAge ?? 99))
})
