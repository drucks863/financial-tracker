// Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mergeNetWorth, SAMPLE_ACCOUNT_IDS } from '../src/lib/net-worth-import.ts'
import type { FinanceData } from '../src/types.ts'

const sampleSeed = JSON.parse(readFileSync(new URL('../src/data/seed.sample.json', import.meta.url), 'utf8')) as FinanceData

const sheet = {
  accounts: [
    { name: 'Checking', group: 'Cash' as const, values: { '2026-09-30': 1000, '2026-10-31': 1200 } },
    { name: 'Taxable', group: 'Investments' as const, values: { '2026-09-30': 5000, '2026-10-31': 5100 } }
  ],
  dates: ['2026-09-30', '2026-10-31'],
  problems: []
}
let counter = 0
const newId = () => `a${++counter}`

test('the sample account list matches the sample seed', () => {
  assert.deepEqual([...SAMPLE_ACCOUNT_IDS].sort(), sampleSeed.netWorth.accounts.map((account) => account.id).sort())
})

test('importing over the sample drops the sample accounts and their months', () => {
  const merged = mergeNetWorth(structuredClone(sampleSeed.netWorth), sheet, newId, SAMPLE_ACCOUNT_IDS)
  assert.deepEqual(merged.accounts.map((account) => account.name), ['Checking', 'Taxable'])
  assert.ok(!merged.accounts.some((account) => account.name === 'Brokerage'))
  assert.deepEqual(merged.snapshots.map((snapshot) => snapshot.date).sort(), ['2026-09-30', '2026-10-31'])
  const october = merged.snapshots.find((snapshot) => snapshot.date === '2026-10-31')!
  assert.equal(Object.values(october.values).reduce((sum, value) => sum + value, 0), 6300)
})

test('importing over real data keeps other accounts and months', () => {
  const real = {
    accounts: [
      { id: 'mine', name: 'Checking', group: 'Cash' as const },
      { id: 'car', name: 'Car', group: 'Other assets' as const }
    ],
    snapshots: [{ date: '2025-01-31', values: { mine: 800, car: 9000 } }]
  }
  const merged = mergeNetWorth(real, sheet, newId)
  assert.deepEqual(merged.accounts.map((account) => account.name), ['Checking', 'Car', 'Taxable'])
  assert.equal(merged.snapshots.find((snapshot) => snapshot.date === '2025-01-31')?.values.car, 9000)
  assert.equal(merged.snapshots.find((snapshot) => snapshot.date === '2026-10-31')?.values.mine, 1200)
  assert.equal(real.snapshots.length, 1, 'the input is not changed')
})
