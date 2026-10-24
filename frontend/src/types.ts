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

export interface FinanceData {
  version: number
  /** true when the data is generated sample data rather than real figures */
  sample?: boolean
  categories: Category[]
  entries: Entry[]
  netWorth: { accounts: Account[]; snapshots: Snapshot[] }
  subscriptions: Subscription[]
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
