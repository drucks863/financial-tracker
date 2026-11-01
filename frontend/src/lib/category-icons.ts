import type { EntryType } from '../types'

// A PrimeIcons icon for each category, picked from the words in its name so the sheet's categories
// and ones added later both get one. A word has to start with a rule's stem ("Refunds" doesn't
// match "fun"), and the first matching rule wins.
// Icons carry a category's identity on every screen; colors follow the charts (top five only).
const RULES: { icon: string; words: string[] }[] = [
  { icon: 'pi-key', words: ['rent', 'mortgage'] },
  { icon: 'pi-shield', words: ['insurance', 'tax'] },
  { icon: 'pi-plus-circle', words: ['health', 'medical', 'doctor', 'dental', 'pharmacy'] },
  { icon: 'pi-heart', words: ['pet', 'dog', 'cat', 'vet'] },
  { icon: 'pi-car', words: ['vehicle', 'cars', 'auto', 'fuel', 'gas', 'truck'] },
  { icon: 'pi-globe', words: ['travel', 'vacation', 'trip'] },
  { icon: 'pi-bolt', words: ['utilit', 'electric', 'power', 'water', 'internet', 'phone'] },
  { icon: 'pi-sync', words: ['subscription', 'membership', 'streaming'] },
  { icon: 'pi-shopping-cart', words: ['food', 'grocer', 'restaurant', 'dining', 'meal'] },
  { icon: 'pi-gift', words: ['gift', 'donation', 'charity'] },
  { icon: 'pi-ticket', words: ['entertain', 'fun', 'hobby', 'movie', 'game'] },
  { icon: 'pi-home', words: ['home', 'house', 'household', 'garden'] },
  { icon: 'pi-shopping-bag', words: ['everyday', 'personal', 'clothes', 'shopping'] },
  { icon: 'pi-graduation-cap', words: ['education', 'school', 'tuition', 'book'] },
  { icon: 'pi-wallet', words: ['wage', 'salary', 'paycheck', 'pay'] },
  { icon: 'pi-undo', words: ['refund', 'reimburse'] },
  { icon: 'pi-chart-line', words: ['invest', 'dividend', 'interest'] },
  { icon: 'pi-briefcase', words: ['business', 'work', 'freelance', 'side'] }
]

const FALLBACK: Record<EntryType, string> = { expense: 'pi-tag', income: 'pi-money-bill' }

export function categoryIcon(name: string, type: EntryType = 'expense'): string {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  return RULES.find((r) => r.words.some((stem) => words.some((word) => word.startsWith(stem))))?.icon ?? FALLBACK[type]
}
