// Run with `npm test`. Workbooks are built here with made-up numbers in each layout the
// "Cash Flow 'YY" sheets have used; the real files never go in the repo (it's public).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseCashFlowWorkbook, parseNetWorthWorkbook, yearFromFileName } from '../src/lib/sheet-import.ts'
import type { EntryDraft } from '../src/types.ts'

type Grid = (string | number | null)[][]

function workbook(tabs: Record<string, Grid>): Blob {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(tabs)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([bytes])
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const twelve = (byMonth: Record<number, number>): number[] => Array.from({ length: 12 }, (_, i) => byMonth[i] ?? 0)

/** Expenses/Income tab: category row with "Monthly totals:", then one row per subcategory. */
function totalsTab(title: string, tree: Record<string, Record<string, Record<number, number>>>): Grid {
  const rows: Grid = [[], [null, null, title, ...MONTHS, 'Total', 'Average'], [], []]
  for (const [category, subs] of Object.entries(tree)) {
    const sums = twelve({})
    for (const months of Object.values(subs)) twelve(months).forEach((v, i) => (sums[i] += v))
    rows.push([category, null, 'Monthly totals:', ...sums])
    for (const [sub, months] of Object.entries(subs)) rows.push([null, null, sub, ...twelve(months)])
    rows.push([])
  }
  return rows
}

const sum = (entries: EntryDraft[], filter: (e: EntryDraft) => boolean): number =>
  Math.round(entries.filter(filter).reduce((total, e) => total + e.amount, 0) * 100) / 100

/* ---------- '22/'23: month tabs only, older layout ---------- */

// Like "December 22": recurring bills top left, itemized block below, income at the bottom.
const legacyStacked: Grid = [
  ['Expenses (Recurring)', null, null, null],
  ['Rent', 1000, 'Bank', 'EOM'],
  ['Water', 20, 'Bank', '?'],
  ['Electric', 80, 'Bank', ''],
  ['TV Base', 50, 'Card', 'FOM'],
  ['Gym', '-', 'Bank', 'Monthly'],
  ['Apple Music', 10, 'Bank', '20th'],
  ['Renters Insurance', 12, 'Bank', 'Yearly'],
  [],
  ['Total', 1172],
  [],
  ['Expenses', null, null, null, null, null, null, null],
  ['Groceries / Food', null, 'Household', null, 'Truck', null, 'Other', null],
  ['Aldi', 60, 'Lamp', 40, 'Sunpass', 30, 'Birthday Gift', 100],
  ['Wendys', 15, 'Rug', '12,50', 'Gas', 35, 'Website Domain', 25],
  [null, null, null, null, null, null, 'New Deposit', 900],
  ['Total', 75, 'Total', 40, 'Total', 65, 'Total', 1025],
  ['Total', 305],
  [],
  ['Income (Recurring)', null, null, 'Savings (Recurring)', null],
  ['Job (30 days)', 4000, null, '401k', 300],
  [null, null, null, 'HSA', 100],
  ['Total', 4000, null, 'Total', 400]
]

// Like "November 22": the itemized block sits to the right of the recurring list.
const legacySideBySide: Grid = [
  ['Expenses (Recurring)', null, null, null, null, 'Expenses', null, null, null],
  ['Rent', 1000, 'Bank', 'EOM', null, 'Groceries / Food', null, 'Clothing', null],
  ['Electric', 90, 'Bank', '', null, 'Publix', 70, 'Jacket', 80],
  [null, null, null, null, null, 'McDonalds', 12, null, null],
  ['Total', 1090, null, null, null, null, null, null, null],
  [null, null, null, null, null, 'Total', 82, 'Total', 80],
  ['Income (Recurring)', null, null, 'Savings (Recurring)', null],
  ['Job (30 days)', 4100, null, '401k', 300],
  ['Total', 4100]
]

test("'22-style workbook: reads every month tab and maps to the 2026 categories", async () => {
  const file = workbook({ 'November 22': legacySideBySide, 'December 22': legacyStacked })
  const result = await parseCashFlowWorkbook(file, 2026) // tab names carry the year
  const { entries } = result
  assert.deepEqual(result.problems, [])
  assert.ok(entries.every((e) => e.date === '2022-11-01' || e.date === '2022-12-01'))

  const dec = (e: EntryDraft) => e.date === '2022-12-01'
  // "12,50" typed as text: the sheet's SUM skips it, the import reads it as 12.50
  assert.equal(sum(entries, (e) => dec(e) && e.type === 'expense'), 1172 + 305 + 12.5)
  assert.equal(sum(entries, (e) => dec(e) && e.type === 'income'), 4000)
  const find = (description: string) => entries.find((e) => dec(e) && e.description === description)!
  assert.deepEqual([find('Rent').category, find('Rent').subcategory], ['Rent/Mortgage', 'Rent/Mortgage'])
  assert.deepEqual([find('Electric').category, find('Electric').subcategory], ['Utilities', 'Electricity'])
  assert.deepEqual([find('TV Base').category, find('TV Base').subcategory], ['Subscriptions', 'TV'])
  assert.deepEqual([find('Apple Music').subcategory, find('Renters Insurance').category], ['Music', 'Insurance/Taxes'])
  assert.deepEqual([find('Aldi').category, find('Aldi').subcategory], ['Food', 'Groceries'])
  assert.deepEqual([find('Lamp').category, find('Lamp').subcategory], ['Home', 'Other'])
  assert.equal(find('Sunpass').subcategory, 'SunPass')
  assert.equal(find('Gas').subcategory, 'Fuel')
  assert.deepEqual([find('Birthday Gift').category, find('Website Domain').category], ['Gifts', 'Everyday'])
  assert.deepEqual([find('Job (30 days)').category, find('Job (30 days)').subcategory], ['Wages', 'Paycheck'])
  assert.equal(entries.find((e) => dec(e) && e.description === 'Gym'), undefined, 'a "-" amount is skipped')
  assert.equal(entries.find((e) => e.description === 'New Deposit'), undefined, 'a rental deposit is not spending')
  assert.equal(entries.find((e) => e.description === '401k' || e.description === 'HSA'), undefined, 'savings boxes are not tracked')

  const nov = (e: EntryDraft) => e.date === '2022-11-01'
  assert.equal(sum(entries, (e) => nov(e) && e.type === 'expense'), 1090 + 82 + 80)
  assert.equal(sum(entries, (e) => nov(e) && e.type === 'income'), 4100)
  assert.equal(entries.find((e) => nov(e) && e.description === 'Jacket')!.subcategory, 'Clothes')

  const food = result.categories!.find((c) => c.name === 'Food')!
  assert.deepEqual(food.subcategories, ['Groceries', 'Restaurants'])
  assert.equal(entries.find((e) => dec(e) && e.description === 'Wendys')!.subcategory, 'Restaurants', 'known restaurants split out of Groceries / Food')
  assert.equal(entries.find((e) => nov(e) && e.description === 'Publix')!.subcategory, 'Groceries')
})

test('a workbook with neither layout says so', async () => {
  const result = await parseCashFlowWorkbook(workbook({ Sheet1: [['hello']] }), 2024)
  assert.equal(result.entries.length, 0)
  assert.equal(result.problems.length, 1)
})

/* ---------- '24: totals tabs, older month tabs Jan–Sep, newer Oct–Dec ---------- */

test("'24-style workbook: totals win, older month tabs add itemized lines that fit", async () => {
  const expenses = totalsTab('Expenses', {
    'Rent/Mortgage': { 'Rent/Mortgage': { 0: 1000 } },
    Food: { Groceries: { 0: 75 }, Restaurants: { 0: 40 } },
    Home: { Furnishings: { 0: 40 }, Other: { 0: 5 }, Improvements: {} },
    Vehicle: { Fuel: {}, Other: { 0: 35 } },
    Insurance: { Car: { 0: 90 }, Other: {} },
    Misc: { Misc: { 0: 25 } },
    Subscriptions: { 'YouTube TV': { 0: 80 } }
  })
  const income = totalsTab('Income', { Wages: { Paycheck: { 0: 4000 } } })
  const january: Grid = [
    ['Expenses (Recurring)', null, null, null],
    ['Rent', 1000, 'Bank', 'EOM'],
    ['TV Base', 80, 'Card', 'FOM'],
    ['Total', 1080],
    [],
    ['Expenses', null, null, null, null, null, null, null],
    ['Groceries / Food', null, 'Household', null, 'Truck', null, 'Other', null],
    ['Aldi', 60, 'Lamp', 40, 'Gas', 35, 'Website Domain', 25],
    ['Publix', 50, null, null, null, null, null, null],
    ['Total', 110, 'Total', 40, 'Total', 35, 'Total', 25],
    [],
    ['Income (Recurring)', null],
    ['Job (30 days)', 4000]
  ]
  const result = await parseCashFlowWorkbook(workbook({ Expenses: expenses, Income: income, January: january }), 2024)
  const { entries } = result
  // Every subcategory total matches the Expenses tab.
  for (const [category, subcategory, total] of [
    ['Rent/Mortgage', 'Rent/Mortgage', 1000],
    ['Vehicle', 'Other', 35],
    ['Everyday', 'Other', 25],
    ['Subscriptions', 'TV', 80],
    ['Food', 'Groceries', 75],
    ['Food', 'Restaurants', 40],
    ['Home', 'Furnishings', 40],
    ['Home', 'Other', 5]
  ] as const)
    assert.equal(sum(entries, (e) => e.category === category && e.subcategory === subcategory), total, `${category} › ${subcategory}`)
  assert.ok(entries.every((e) => e.amount > 0), 'no negative corrections')
  // Rent fits its total, so the itemized line is kept.
  assert.ok(entries.some((e) => e.description === 'Rent' && e.category === 'Rent/Mortgage'))
  // Groceries lines (110) overshoot the sheet's 75, so the total is used instead.
  assert.ok(!entries.some((e) => e.description === 'Aldi'))
  // "Lamp" maps to Home › Other (total 5), overshoots, and is dropped.
  assert.ok(!entries.some((e) => e.description === 'Lamp'))
  // "Gas" would be Vehicle › Fuel, but this sheet put Jan–Sep fuel under Vehicle › Other.
  assert.equal(entries.find((e) => e.description === 'Gas')!.subcategory, 'Other')
  // Older names become the 2026 ones: Misc → Everyday › Other, Insurance → Insurance/Taxes, YouTube TV → TV.
  assert.deepEqual(
    ['Website Domain', 'TV Base'].map((d) => { const e = entries.find((x) => x.description === d)!; return `${e.category} › ${e.subcategory}` }),
    ['Everyday › Other', 'Subscriptions › TV']
  )
  assert.equal(sum(entries, (e) => e.category === 'Insurance/Taxes' && e.subcategory === 'Car'), 90)
  assert.ok(!entries.some((e) => ['Misc', 'Insurance'].includes(e.category)))
  // Empty older subcategories aren't added to the category list.
  const home = result.categories!.find((c) => c.name === 'Home')!
  assert.deepEqual(home.subcategories, ['Furnishings', 'Other'])
  assert.equal(sum(entries, (e) => e.type === 'income'), 4000)
})

/* ---------- '25/'26: the standard layout ---------- */

test("'26-style workbook: itemized lines under category blocks plus totals", async () => {
  const expenses = totalsTab('Expenses', {
    Food: { Groceries: { 0: 100 }, Restaurants: { 0: 30 }, Other: {} },
    'Rent/Mortgage': { 'Rent/Mortgage': { 0: 1400 } }
  })
  const income = totalsTab('Income', { Wages: { Paycheck: { 0: 5000 } }, Other: { Refunds: { 0: 20 } } })
  const january: Grid = [
    ['Expenses', null, null, 'Income', null, null, 'Disposable Income', null, null, 'Auto Withdrawals', null],
    ['Rent/Mortgage', 1400, null, 'Wages', 5000, null, 'Total', 0, null, 'Roth 401k', 500],
    ['Food', 130, null, 'Other', 20],
    ...Array.from({ length: 15 }, () => []),
    ['Food', null, 'Groceries', null, 'Restaurants', null],
    [null, null, 'Description', 'Amount', 'Description', 'Amount'],
    [null, null, 'Publix', 100, 'Chipotle', 12],
    [null, null, 'Aldi', 15, null, null]
  ]
  const result = await parseCashFlowWorkbook(workbook({ Expenses: expenses, Income: income, January: january }), 2026)
  const { entries } = result
  assert.equal(entries.find((e) => e.description === 'Publix')!.subcategory, 'Groceries')
  assert.equal(entries.find((e) => e.description === 'Chipotle')!.subcategory, 'Restaurants')
  assert.equal(sum(entries, (e) => e.subcategory === 'Restaurants'), 30)
  assert.equal(entries.find((e) => e.subcategory === 'Restaurants' && e.description === 'Monthly total')!.amount, 18)
  assert.equal(sum(entries, (e) => e.type === 'income'), 5020)
  // Groceries lines (115) overshoot the tab's 100, as when a SUM range stops short: lines kept, flagged.
  assert.equal(sum(entries, (e) => e.subcategory === 'Groceries'), 115)
  assert.ok(entries.every((e) => e.amount > 0))
  assert.equal(result.problems.length, 1)
  assert.match(result.problems[0], /January 2026 Food › Groceries.*\$15\.00 more/)
  assert.ok(entries.every((e) => e.date.startsWith('2026-01')))
})

test('year comes from the file name', () => {
  assert.equal(yearFromFileName("Cash Flow '23.xlsx"), 2023)
  assert.equal(yearFromFileName('Cash Flow ’22.xlsx'), 2022)
  assert.equal(yearFromFileName('cashflow-2025.xlsx'), 2025)
  assert.equal(yearFromFileName('export.xlsx'), null)
})

/* ---------- Net Worth / Retirement Calculator ---------- */

test('net worth tracker tab: accounts by section, month-end dates, subtotals skipped', async () => {
  const tracker: Grid = [
    [null, null, null, 1, 2],
    [null, null, null, 'Amount ($)'],
    [null, 'Institution', 'Name / Type', 'Oct-31-2024', 'Nov-30-2024'],
    [],
    [null, 'Cash / Cash Equivalents'],
    [null, 'Checking, savings, etc.'],
    [1, null, 'Checking', 1000, 1200],
    [2, null, 'HYSA', 5000, 5100],
    [3, null, null, null, null],
    [null, 'Subtotal - bank accounts', null, 6000, 6300],
    [],
    [null, 'Investment Accounts'],
    [null, 'Taxable / non-taxable accounts, employer savings accounts, etc.'],
    [1, null, 'Roth IRA', 20000, 20500],
    [2, null, '401k', '$10,000', '$10,400'],
    [null, 'Subtotal - investment accounts', null, 30000, 30900],
    [],
    [null, 'Other Assets'],
    [null, 'Home value, car, other valuable possessions'],
    [1, null, 'Car', 8000, 7900],
    [],
    [null, 'Liabilities'],
    [1, null, 'Credit card', 300, 0],
    [],
    [null, 'Net Worth', null, 43700, 45100]
  ]
  const file = workbook({ 'Retirement Calcuator': [['Retirement Savings Calculator'], [null, 'Current Age', 30]], 'Net Worth Tracker': tracker })
  const result = await parseNetWorthWorkbook(file)
  assert.deepEqual(result.dates, ['2024-10-31', '2024-11-30'])
  assert.deepEqual(
    result.accounts.map((a) => `${a.group}: ${a.name}`),
    ['Cash: Checking', 'Cash: HYSA', 'Investments: Roth IRA', 'Investments: 401k', 'Other assets: Car', 'Debt: Credit card']
  )
  assert.deepEqual(result.accounts.find((a) => a.name === '401k')!.values, { '2024-10-31': 10000, '2024-11-30': 10400 })
  assert.deepEqual(result.problems, [])
})

test('net worth tracker: blank cells are not $0 balances, and empty months are skipped', async () => {
  const tracker: Grid = [
    [null, 'Institution', 'Name / Type', 'Sep-30-2026', 'Oct-31-2026', 'Nov-30-2026', 'Dec-31-2026'],
    [null, 'Cash / Cash Equivalents'],
    [1, null, 'Checking', 1000, 1200, null, null],
    [2, null, 'HYSA', null, 5000, null, null],
    [null, 'Liabilities'],
    [1, null, 'Credit card', 300, 0, null, null]
  ]
  const result = await parseNetWorthWorkbook(workbook({ 'Net Worth Tracker': tracker }))
  assert.deepEqual(result.dates, ['2026-09-30', '2026-10-31'])
  assert.deepEqual(result.accounts.find((a) => a.name === 'Checking')!.values, { '2026-09-30': 1000, '2026-10-31': 1200 })
  // opened in October: September stays unknown instead of $0
  assert.deepEqual(result.accounts.find((a) => a.name === 'HYSA')!.values, { '2026-10-31': 5000 })
  // a typed 0 is a real balance (paid off)
  assert.deepEqual(result.accounts.find((a) => a.name === 'Credit card')!.values, { '2026-09-30': 300, '2026-10-31': 0 })
  assert.deepEqual(result.problems, ['Skipped 2 months with no balances filled in.'])
})

test('Cash Flow workbook: a negative Expenses tab total (a refund) is kept', async () => {
  const file = workbook({
    Expenses: totalsTab('Expenses', { Food: { Groceries: { 0: 200, 1: -15 } } }),
    Income: totalsTab('Income', { Wages: { Paycheck: { 0: 3000, 1: 3000 } } })
  })
  const { entries, problems } = await parseCashFlowWorkbook(file, 2026)
  assert.deepEqual(problems, [])
  assert.equal(sum(entries, (e) => e.type === 'expense' && e.date === '2026-02-01'), -15)
  assert.equal(sum(entries, (e) => e.type === 'expense' && e.date === '2026-01-01'), 200)
})
