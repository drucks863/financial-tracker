// Applying a parsed Net Worth tracker to the stored net worth. Kept apart from the store so it can be tested.
import type { Account, AccountGroup, FinanceData, Loan, Snapshot } from '../types'
import type { ParsedNetWorth } from './sheet-import'
import { namesMatch, normName } from './plan-match.ts'

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

/**
 * The profile loan a net worth account repeats, or null. Loans on the financial profile already
 * count on Net worth (their balance as debt, the property they bought as an asset), so a Debt
 * account named like a loan, or an Other assets account named like a loan's property, would count
 * the same thing twice (Devin, 2026-11-01). Names match with the plan check's rule.
 */
export function profileCopyOf(account: { name: string; group: AccountGroup }, loans: Loan[]): Loan | null {
  const name = normName(account.name)
  if (account.group === 'Debt') return loans.find((loan) => loan.amount > 0 && namesMatch(name, normName(loan.name))) ?? null
  if (account.group === 'Other assets') return loans.find((loan) => !!loan.property?.value && namesMatch(name, normName(loan.property.name))) ?? null
  return null
}

/** The parsed file without rows the profile already counts; `skipped` names them for the preview. */
export function withoutProfileCopies(parsed: ParsedNetWorth, loans: Loan[]): { parsed: ParsedNetWorth; skipped: string[] } {
  const skipped = parsed.accounts.filter((account) => profileCopyOf(account, loans)).map((account) => account.name)
  return { parsed: { ...parsed, accounts: parsed.accounts.filter((account) => !skipped.includes(account.name)) }, skipped }
}
