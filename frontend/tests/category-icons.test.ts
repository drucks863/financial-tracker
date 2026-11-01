// Run with `npm test`. Every category from the sheets gets its own icon.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { categoryIcon } from '../src/lib/category-icons.ts'

test('sheet expense categories each get a different icon', () => {
  const seed = JSON.parse(readFileSync(new URL('../src/data/seed.sample.json', import.meta.url), 'utf8'))
  const expense = seed.categories.filter((c: { type: string }) => c.type === 'expense').map((c: { name: string }) => categoryIcon(c.name))
  assert.equal(new Set(expense).size, expense.length, expense.join(', '))
  assert.ok(!expense.includes('pi-tag'))
})

test('picks by name and falls back by type', () => {
  assert.equal(categoryIcon('Rent/Mortgage'), 'pi-key')
  assert.equal(categoryIcon('Insurance/Taxes'), 'pi-shield')
  assert.equal(categoryIcon('Wages', 'income'), 'pi-wallet')
  assert.equal(categoryIcon('Zzz'), 'pi-tag')
  assert.equal(categoryIcon('Education'), 'pi-graduation-cap')
  assert.equal(categoryIcon('Refunds', 'income'), 'pi-undo')
  assert.equal(categoryIcon('Other', 'income'), 'pi-money-bill')
})
