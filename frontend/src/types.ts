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

/** A recurring monthly amount on the My numbers page (a bill or a contribution). */
export interface PlanLine {
  id: string
  name: string
  monthly: number
  /** contributions only: taken out of the paycheck before take-home (HSA, Roth 401k...) */
  fromPaycheck?: boolean
}

/**
 * The person's current, steady-state numbers: pay, contributions, taxes, housing.
 * One source of truth that other screens can read (see store/plan.ts for the derived figures).
 */
export interface Plan {
  /** gross yearly salary */
  salary: number
  /** effective tax rate, 0–1, used to estimate take-home */
  taxRate: number
  /** actual monthly take-home pay; when null the estimate is used */
  takeHome: number | null
  /** 401k contribution as a share of salary, 0–1 */
  k401: number
  /** company 401k contribution as a share of salary, 0–1 */
  match: number
  /** other monthly contributions (HSA, Roth IRA, brokerage...) */
  contributions: PlanLine[]
  housing: {
    rent: number
    /** false = living solo, pay all of it */
    split: boolean
    /** my share of rent when split, 0–1 */
    rentShare: number
    /** shared monthly bills (water, electric...) */
    bills: PlanLine[]
    /** my share of the bills when split, 0–1 */
    billsShare: number
  }
  /** other monthly spending; when useAverage, the average from entries (excluding essentials) is used */
  living: { useAverage: boolean; monthly: number }
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
