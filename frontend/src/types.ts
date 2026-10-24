// Domain types. These mirror the planned DynamoDB items so the API swap is mechanical.

export type EntryType = 'income' | 'expense'

export interface Category {
  id: string
  type: EntryType
  name: string
  subcategories: string[]
  /** expenses only: counts toward essentials (rent, utilities) instead of discretionary */
  essential?: boolean
}

export interface Entry {
  id: string
  /** YYYY-MM-DD */
  date: string
  type: EntryType
  category: string
  subcategory: string
  description: string
  amount: number
}

/** An entry before it has been saved */
export type EntryDraft = Omit<Entry, 'id'> & { id?: string | null }

export type AccountGroup = 'Cash' | 'Investments' | 'Other assets' | 'Debt'

export interface Account {
  id: string
  name: string
  group: AccountGroup
}

export interface Snapshot {
  /** month-end date, YYYY-MM-DD */
  date: string
  values: Record<string, number>
}

export interface Subscription {
  service: string
  price: number | null
  category: string
  frequency: string
  when: string
  from: string
}

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

/** Something taken out of each paycheck (HSA, Roth 401k...), as an amount per paycheck. */
export interface PayDeduction {
  id: string
  name: string
  perPaycheck: number
}

/** A housing cost (rent, water, electric...) and the share of it I pay. */
export interface SharedCost {
  id: string
  name: string
  /** full monthly cost */
  monthly: number
  /** my share, 0–1 (1 when living solo) */
  share: number
}

/**
 * The person's current, steady-state numbers: pay, contributions, taxes, housing.
 * One source of truth that other screens can read (see store/plan.ts for the derived figures).
 */
export interface Plan {
  /** gross yearly salary */
  salary: number
  payFrequency: PayFrequency
  /** effective tax rate, 0–1, used to estimate take-home */
  taxRate: number
  /** actual take-home per paycheck; when null the estimate is used */
  takeHome: number | null
  /** my 401k contribution, share of salary 0–1 */
  k401: number
  /** company 401k contribution, share of salary 0–1 */
  match: number
  /** other paycheck deductions (HSA...) */
  deductions: PayDeduction[]
  /** rent and bills with my share of each */
  housing: SharedCost[]
}

export interface FinanceData {
  version: number
  /** true when the data is generated sample data rather than real figures */
  sample?: boolean
  categories: Category[]
  entries: Entry[]
  netWorth: { accounts: Account[]; snapshots: Snapshot[] }
  subscriptions: Subscription[]
  /** optional so older saved data still loads; filled with defaults by the store */
  plan?: Plan
}

export interface MonthTotals {
  month: number
  ym: string
  income: number
  expense: number
  essential: number
  discretionary: number
  count: number
  net: number
  savingsRate: number | null
}

export interface NetWorthPoint {
  date: string
  byGroup: Record<AccountGroup, number>
  assets: number
  debt: number
  total: number
  values: Record<string, number>
}
