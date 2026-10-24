// Generates src/data/seed.sample.json: made-up numbers in the same shape and categories as
// the real data, so the repo (which is public) never carries real finances.
// Real data lives in src/data/seed.local.json, which is gitignored.
import { writeFileSync } from 'node:fs'
import type { Account, Category, Entry, EntryType, FinanceData, Plan, Snapshot, Subscription } from '../src/types.ts'

let s = 42
const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const between = (a: number, b: number): number => Math.round((a + rand() * (b - a)) * 100) / 100
const pad = (n: number): string => String(n).padStart(2, '0')

const categories: Category[] = [
  { id: 'inc-wages', type: 'income', name: 'Wages', subcategories: ['Paycheck', 'Other'] },
  { id: 'inc-other', type: 'income', name: 'Other', subcategories: ['Gifts', 'Refunds', 'Other'] },
  { id: 'exp-entertainment', type: 'expense', name: 'Entertainment', essential: false, subcategories: ['Entertainment', 'Hobby/Toys'] },
  { id: 'exp-everyday', type: 'expense', name: 'Everyday', essential: false, subcategories: ['Personal supplies', 'Clothes', 'Other'] },
  { id: 'exp-food', type: 'expense', name: 'Food', essential: false, subcategories: ['Groceries', 'Restaurants', 'Other'] },
  { id: 'exp-gifts', type: 'expense', name: 'Gifts', essential: false, subcategories: ['Gifts', 'Other'] },
  { id: 'exp-health-medical', type: 'expense', name: 'Health/medical', essential: false, subcategories: ['Doctors/dental/vision', 'Specialty care', 'Pharmacy', 'Emergency', 'Other'] },
  { id: 'exp-home', type: 'expense', name: 'Home', essential: false, subcategories: ['Furnishings', 'Lawn/garden', 'Supplies', 'Maintenance', 'Projects', 'Other'] },
  { id: 'exp-insurance-taxes', type: 'expense', name: 'Insurance/Taxes', essential: false, subcategories: ['Car', 'Health', 'Home', 'Life', 'Taxes'] },
  { id: 'exp-pets', type: 'expense', name: 'Pets', essential: false, subcategories: ['Food', 'Vet/medical', 'Toys', 'Supplies', 'Other'] },
  { id: 'exp-vehicle', type: 'expense', name: 'Vehicle', essential: false, subcategories: ['Fuel', 'SunPass', 'Repairs', 'Registration/license', 'Other'] },
  { id: 'exp-travel', type: 'expense', name: 'Travel', essential: false, subcategories: ['Airfare', 'Hotels', 'Food', 'Transportation', 'Entertainment', 'Other'] },
  { id: 'exp-utilities', type: 'expense', name: 'Utilities', essential: true, subcategories: ['Phone', 'Internet', 'Electricity', 'Water'] },
  { id: 'exp-rent-mortgage', type: 'expense', name: 'Rent/Mortgage', essential: true, subcategories: ['Rent/Mortgage'] },
  { id: 'exp-subscriptions', type: 'expense', name: 'Subscriptions', essential: false, subcategories: ['TV', 'Gym', 'Music', 'Amazon', 'Games'] }
]

// [category, subcategory, description pool, min, max, times per month]
const SPEND: [category: string, subcategory: string, descriptions: string[], min: number, max: number, perMonth: number][] = [
  ['Food', 'Groceries', ['Grocery store', 'Farmers market', 'Warehouse club'], 40, 140, 4],
  ['Food', 'Restaurants', ['Taco place', 'Coffee shop', 'Pizza', 'Burger joint', 'Sushi'], 12, 70, 6],
  ['Entertainment', 'Entertainment', ['Movie tickets', 'Concert', 'Mini golf'], 15, 90, 1],
  ['Entertainment', 'Hobby/Toys', ['Board game', 'Video game', 'Books'], 10, 120, 2],
  ['Everyday', 'Personal supplies', ['Toiletries', 'Pharmacy run'], 8, 40, 1],
  ['Everyday', 'Clothes', ['Shoes', 'Jacket', 'Shirts'], 20, 110, 1],
  ['Everyday', 'Other', ['Haircut'], 30, 45, 1],
  ['Home', 'Supplies', ['Cleaning supplies', 'Paper towels'], 10, 45, 1],
  ['Pets', 'Food', ['Dog food'], 60, 95, 1],
  ['Pets', 'Supplies', ['Leash', 'Treats', 'Shampoo'], 8, 40, 1],
  ['Vehicle', 'Fuel', ['Gas station'], 30, 55, 3],
  ['Gifts', 'Gifts', ['Birthday gift', 'Thank-you gift'], 20, 80, 1]
]

const entries: Entry[] = []
let id = 0
const add = (date: string, type: EntryType, category: string, subcategory: string, description: string, amount: number) =>
  entries.push({ id: `e${++id}`, date, type, category, subcategory, description, amount })

const YEAR = 2026
for (let m = 1; m <= 10; m++) {
  const ym = `${YEAR}-${pad(m)}`
  const day = (d: number) => `${ym}-${pad(d)}`
  add(day(1), 'income', 'Wages', 'Paycheck', 'Paycheck', 2600)
  add(day(15), 'income', 'Wages', 'Paycheck', 'Paycheck', 2600)
  if (m % 4 === 0) add(day(20), 'income', 'Other', 'Refunds', 'Store refund', between(20, 90))
  add(day(1), 'expense', 'Rent/Mortgage', 'Rent/Mortgage', 'Rent', 1350)
  add(day(4), 'expense', 'Utilities', 'Internet', 'Internet', 60)
  add(day(10), 'expense', 'Utilities', 'Electricity', 'Electric bill', between(90, 190))
  add(day(12), 'expense', 'Utilities', 'Water', 'Water bill', between(35, 60))
  add(day(18), 'expense', 'Subscriptions', 'Gym', 'Gym', 25)
  add(day(27), 'expense', 'Subscriptions', 'Music', 'Music streaming', 11)
  add(day(28), 'expense', 'Subscriptions', 'TV', 'TV streaming', 18)
  for (const [cat, sub, pool, lo, hi, n] of SPEND)
    for (let i = 0; i < n; i++) add(day(1 + Math.floor(rand() * 27)), 'expense', cat, sub, pool[Math.floor(rand() * pool.length)], between(lo, hi))
  if (m === 3) add(day(14), 'expense', 'Insurance/Taxes', 'Car', 'Car insurance', 420)
  if (m === 4) add(day(9), 'expense', 'Pets', 'Vet/medical', 'Vet visit', 260)
  if (m === 6) add(day(21), 'expense', 'Travel', 'Hotels', 'Beach hotel', 540)
  if (m === 6) add(day(20), 'expense', 'Travel', 'Airfare', 'Flights', 380)
  if (m === 8) add(day(17), 'expense', 'Home', 'Projects', 'Garden beds', 210)
}

const accounts: Account[] = [
  { id: 'checking', name: 'Checking', group: 'Cash' },
  { id: 'savings', name: 'Savings', group: 'Cash' },
  { id: 'hysa', name: 'HYSA', group: 'Cash' },
  { id: 'brokerage', name: 'Brokerage', group: 'Investments' },
  { id: 'roth-ira', name: 'Roth IRA', group: 'Investments' },
  { id: '401k', name: '401k', group: 'Investments' },
  { id: 'hsa', name: 'HSA', group: 'Investments' }
]
const snapshots: Snapshot[] = []
const start: Record<string, number> = { checking: 2500, savings: 4000, hysa: 8000, brokerage: 20000, 'roth-ira': 25000, '401k': 18000, hsa: 3000 }
for (let i = 0; i < 24; i++) {
  const y = 2024 + Math.floor((9 + i) / 12)
  const mo = ((9 + i) % 12) + 1
  const last = new Date(y, mo, 0).getDate()
  const growth = 1 + i * 0.012
  const values = Object.fromEntries(
    Object.entries(start).map(([k, v]) => [k, Math.round(v * (k === 'checking' ? 1 + (rand() - 0.5) * 0.6 : growth * (0.97 + rand() * 0.06)) * 100) / 100])
  )
  snapshots.push({ date: `${y}-${pad(mo)}-${pad(last)}`, values })
}

const subscriptions: Subscription[] = [
  { service: 'Music streaming', price: 11, category: 'Discretionary', frequency: 'Monthly', when: '27th', from: 'Credit Card' },
  { service: 'Gym', price: 25, category: 'Discretionary', frequency: 'Monthly', when: '18th', from: 'Credit Card' },
  { service: 'TV streaming', price: 18, category: 'Discretionary', frequency: 'Monthly', when: '28th', from: 'Credit Card' },
  { service: 'Car insurance', price: 420, category: 'Essential', frequency: 'Semiannual', when: 'Mar & Sep', from: 'Credit Card' }
]

const plan: Plan = {
  salary: 85000,
  payFrequency: 'biweekly',
  taxRate: 0.2,
  takeHome: null,
  k401: 0.08,
  match: 0.04,
  deductions: [{ id: 'p1', name: 'HSA', perPaycheck: 75 }],
  housing: [
    { id: 'p2', name: 'Rent', monthly: 2200, share: 0.5 },
    { id: 'p3', name: 'Water', monthly: 90, share: 0.5 },
    { id: 'p4', name: 'Electric', monthly: 160, share: 0.5 }
  ],
  loans: [{ id: 'p5', name: 'Car loan', amount: 24000, rate: 0.059, termYears: 5, start: '2024-06', extraMonthly: 0 }]
}

writeFileSync(
  new URL('../src/data/seed.sample.json', import.meta.url),
  JSON.stringify({ version: 2, sample: true, categories, entries, netWorth: { accounts, snapshots }, subscriptions, plan } satisfies FinanceData)
)
console.log(`sample seed: ${entries.length} entries, ${snapshots.length} snapshots`)
