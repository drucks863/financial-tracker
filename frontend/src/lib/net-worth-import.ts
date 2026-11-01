// Applying a parsed Net Worth tracker to the stored net worth. Kept apart from the store so it can be tested.
import type { Account, FinanceData, Snapshot } from '../types'
import type { ParsedNetWorth } from './sheet-import'

type NetWorthData = FinanceData['netWorth']

/** The accounts in the generated sample data (scripts/make-sample-seed.ts); a test keeps this in step. */
export const SAMPLE_ACCOUNT_IDS: ReadonlySet<string> = new Set(['checking', 'savings', 'hysa', 'brokerage', 'roth-ira', '401k', 'hsa'])

/**
 * Adds the file's accounts (matched by name) and their month-end balances; months the file doesn't
 * cover are kept. Accounts in `sampleAccountIds` are generated sample accounts: they are removed first,
 * with their balances, so a sample "Brokerage" doesn't linger next to the sheet's own accounts (it showed
 * as a $0 balance with a −$25k change, and its old balances inflated every earlier month).
 */
export function mergeNetWorth(netWorth: NetWorthData, parsed: ParsedNetWorth, newId: () => string, sampleAccountIds: ReadonlySet<string> = new Set()): NetWorthData {
  const accounts: Account[] = netWorth.accounts.filter((account) => !sampleAccountIds.has(account.id)).map((account) => ({ ...account }))
  const snapshots: Snapshot[] = netWorth.snapshots
    .map((snapshot) => ({ date: snapshot.date, values: Object.fromEntries(Object.entries(snapshot.values).filter(([id]) => !sampleAccountIds.has(id))) }))
    .filter((snapshot) => !sampleAccountIds.size || Object.keys(snapshot.values).length > 0)
  for (const parsedAccount of parsed.accounts) {
    let account = accounts.find((existing) => existing.name.toLowerCase() === parsedAccount.name.toLowerCase())
    if (!account) {
      account = { id: newId(), name: parsedAccount.name, group: parsedAccount.group }
      accounts.push(account)
    }
    for (const [date, value] of Object.entries(parsedAccount.values)) {
      let snapshot = snapshots.find((existing) => existing.date === date)
      if (!snapshot) snapshots.push((snapshot = { date, values: {} }))
      snapshot.values[account.id] = value
    }
  }
  return { accounts, snapshots }
}
