// Which spending entries pay for the Rent and bills items and loans on the financial profile.
// The Overview plan check compares what was spent on exactly those against your share, so
// changing an item on the profile changes both sides of that row.
//
// Matching is by name, entry subcategory first ("Electric" ~ "Electricity", "Rent" ~
// "Rent/Mortgage"). Pure functions, no store imports, so they run under `node --test`.

export interface PlanItemName {
  id: string
  name: string
}

export interface EntryLike {
  type: string
  category: string
  subcategory: string
  amount: number
}

export const normName = (name: string | null | undefined): string => (name || '').toLowerCase().replace(/[^a-z]/g, '')
const norm = normName

// One name containing the other counts, but only when the shorter one has at least four
// letters, so "Car" (insurance) doesn't match "Car loan". Short names must match exactly.
const MIN_CONTAINED = 4
/** Two names (already passed through `normName`) that refer to the same thing. */
export function namesMatch(entryName: string, itemName: string): boolean {
  if (!entryName || !itemName) return false
  if (entryName === itemName) return true
  const shorter = entryName.length < itemName.length ? entryName : itemName
  if (shorter.length < MIN_CONTAINED) return false
  return entryName.includes(itemName) || itemName.includes(entryName)
}

/** The plan item an entry pays for, or null. Subcategory is tried before category. */
export function matchPlanItem<T extends PlanItemName>(entry: EntryLike, items: T[]): T | null {
  if (entry.type !== 'expense') return null
  for (const field of [entry.subcategory, entry.category]) {
    const entryName = norm(field)
    const item = items.find((candidate) => namesMatch(entryName, norm(candidate.name)))
    if (item) return item
  }
  return null
}

export interface PlanSpend {
  /** spent on any of the items */
  total: number
  /** spent per item id */
  byItem: Record<string, number>
  /** "Category / Subcategory" labels that were counted, for showing where the number comes from */
  counted: string[]
}

/** Spending on the given plan items across the entries. */
export function planItemSpend(entries: EntryLike[], items: PlanItemName[]): PlanSpend {
  const byItem: Record<string, number> = {}
  const counted = new Set<string>()
  let total = 0
  for (const entry of entries) {
    const item = matchPlanItem(entry, items)
    if (!item) continue
    byItem[item.id] = (byItem[item.id] || 0) + entry.amount
    total += entry.amount
    counted.add(entry.subcategory && entry.subcategory !== entry.category ? `${entry.category} / ${entry.subcategory}` : entry.category)
  }
  return { total, byItem, counted: [...counted].sort() }
}

/**
 * The plan items that belong to a category: matched on the category's own name or any of its
 * subcategories, with the same rule as the plan check. The Trends planned line sums these.
 */
export function planItemsForCategory<T extends PlanItemName>(category: string, subcategories: string[], items: T[]): T[] {
  const names = [category, ...subcategories].map(norm)
  return items.filter((item) => names.some((name) => namesMatch(name, norm(item.name))))
}
