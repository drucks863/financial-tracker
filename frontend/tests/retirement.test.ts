// Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neededAt, project, realRate, retirement, type RetirementInputs } from '../src/lib/retirement.ts'
import { applyOverrides, cleanOverrides } from '../src/lib/scenario.ts'

const base: RetirementInputs = {
  currentAge: 30,
  startBalance: 50_000,
  yearlySaving: 20_000,
  salaryGrowth: 0.03,
  returnRate: 0.07,
  inflation: 0.03,
  retirementSpending: 50_000,
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
