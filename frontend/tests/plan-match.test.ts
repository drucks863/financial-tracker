// Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchPlanItem, planItemSpend } from '../src/lib/plan-match.ts'

const items = [
  { id: 'rent', name: 'Rent' },
  { id: 'water', name: 'Water' },
  { id: 'electric', name: 'Electric' },
  { id: 'gas', name: 'Gas' },
  { id: 'car', name: 'Car loan' }
]
const expense = (category: string, subcategory: string, amount = 100) => ({ type: 'expense', category, subcategory, amount })

test('matches items by subcategory, then category', () => {
  assert.equal(matchPlanItem(expense('Rent/Mortgage', 'Rent/Mortgage'), items)?.id, 'rent')
  assert.equal(matchPlanItem(expense('Utilities', 'Electricity'), items)?.id, 'electric')
  assert.equal(matchPlanItem(expense('Utilities', 'Water'), items)?.id, 'water')
  assert.equal(matchPlanItem(expense('Car loan', 'Other'), items)?.id, 'car')
})

test('leaves out spending that is not on the list', () => {
  assert.equal(matchPlanItem(expense('Utilities', 'Internet'), items), null)
  assert.equal(matchPlanItem(expense('Food', 'Groceries'), items), null)
  // "Entertainment" contains no "rent"; insurance "Car" is too short to match "Car loan"
  assert.equal(matchPlanItem(expense('Entertainment', 'Entertainment'), items), null)
  assert.equal(matchPlanItem(expense('Insurance/Taxes', 'Car'), items), null)
  // a short item name only matches exactly
  assert.equal(matchPlanItem(expense('Vehicle', 'Gasoline'), items), null)
  assert.equal(matchPlanItem(expense('Utilities', 'Gas'), items)?.id, 'gas')
})

test('ignores income', () => {
  assert.equal(matchPlanItem({ type: 'income', category: 'Rent', subcategory: 'Rent', amount: 1 }, items), null)
})

test('adds up spending per item and lists what was counted', () => {
  const spend = planItemSpend(
    [expense('Rent/Mortgage', 'Rent/Mortgage', 1100), expense('Utilities', 'Water', 45), expense('Utilities', 'Internet', 70), expense('Utilities', 'Water', 5)],
    items
  )
  assert.equal(spend.total, 1150)
  assert.deepEqual(spend.byItem, { rent: 1100, water: 50 })
  assert.deepEqual(spend.counted, ['Rent/Mortgage', 'Utilities / Water'])
})

test('an item removed from the list stops counting', () => {
  const entries = [expense('Rent/Mortgage', 'Rent/Mortgage', 1100), expense('Utilities', 'Water', 45)]
  assert.equal(planItemSpend(entries, items).total, 1145)
  assert.equal(planItemSpend(entries, items.filter((item) => item.id !== 'water')).total, 1100)
})
