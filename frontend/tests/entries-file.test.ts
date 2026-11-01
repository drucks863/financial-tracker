// Run with `npm test`. The entries file (CSV/XLSX, one row per entry), read in a US time zone:
// the app's own CSV export has to come back on the same dates.
process.env.TZ = 'America/New_York'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseEntriesFile } from '../src/lib/sheet-import.ts'

const csv = [
  'Date,Type,Category,Subcategory,Description,Amount',
  '2026-10-01,Expense,Rent/Mortgage,Rent/Mortgage,Rent,1350',
  '2026-10-31,Income,Wages,Paycheck,Paycheck,2600',
  '2026-11-01,Expense,Food,Groceries,"Store, downtown","1,234.50"',
  '12/1/2026,Expense,Food,Restaurants,Pizza,20'
].join('\n')

test('CSV dates stay on their day and month west of UTC', async () => {
  assert.equal(new Date().getTimezoneOffset() > 0, true, 'this test runs in a US time zone')
  const { entries, problems } = await parseEntriesFile(new Blob([csv]))
  assert.deepEqual(problems, [])
  assert.deepEqual(
    entries.map((entry) => [entry.date, entry.type, entry.amount]),
    [
      ['2026-10-01', 'expense', 1350],
      ['2026-10-31', 'income', 2600],
      ['2026-11-01', 'expense', 1234.5],
      ['2026-12-01', 'expense', 20]
    ]
  )
})

test('real date cells in an XLSX entries file keep their day', async () => {
  const sheet = XLSX.utils.aoa_to_sheet(
    [
      ['Date', 'Category', 'Amount'],
      [new Date(2026, 9, 1), 'Food', 12.5],
      [new Date(2026, 9, 31), 'Food', 7]
    ],
    { cellDates: true }
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Entries')
  const { entries } = await parseEntriesFile(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]))
  assert.deepEqual(entries.map((entry) => entry.date), ['2026-10-01', '2026-10-31'])
})
