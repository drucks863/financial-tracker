<script setup lang="ts">
import { computed, ref, type WritableComputedRef } from 'vue'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import SimulatorShell from '../components/SimulatorShell.vue'
import SimField from '../components/SimField.vue'
import BaseChart from '../components/BaseChart.vue'
import { useScenario } from '../lib/scenario'
import { retirement, project, budgetAt, estimateSocialSecurity, estimateWithdrawalTax, lifeAt, mortgagePayment, spouseSocialSecurity, type RetirementInputs } from '../lib/retirement'
import { realFigures } from '../store/real-figures'
import { money, moneyCompact, pct, shortDate, ymLabel } from '../lib/format'
import { series, ROLE } from '../lib/chart-colors'
import type { ChartBuilder } from '../lib/chart-types'

const emit = defineEmits<{ navigate: [id: string] }>()

// Assumptions that don't come from your data. Debatable on purpose; each one is an input below.
const DEFAULTS = {
  age: 30,
  targetAge: 65,
  planToAge: 95,
  returnRate: 0.07,
  inflation: 0.03,
  salaryGrowth: 0.03,
  volatility: 0.15,
  confidence: 0.9,
  // the goal: 1 = keep the nest egg (end with at least what you retired with), 0 = the money lasts.
  // Keeping it is Devin's goal (2026-11-02).
  keepNestEgg: 1,
  healthcareMonthly: 700,
  socialSecurityAge: 67,
  // Family and Home start left out (they're plans, not your numbers yet). Devin plans to marry, have
  // kids and buy a home within about 5 years (2026-11-02), so the ages default to the next few years.
  // The costs are US averages, each an input:
  spouseSalary: 62_000, // median full-time pay, BLS 2025 (~$1,200 a week)
  spouseSavingRate: 0.1,
  kids: 2,
  kidsApart: 2,
  childMonthly: 1_500, // USDA: ~$233,610 to 17 for a middle-income married couple (2015 $), ~$18,000 a year in 2026 $
  childcareMonthly: 1_100, // Child Care Aware 2024 national average, ~$13,000 a year, birth to 5
  homePrice: 410_000, // US median existing-home price, NAR 2025
  downPayment: 0.2,
  closingCosts: 0.03,
  mortgageRate: 0.065,
  mortgageYears: 30,
  ownershipRate: 0.025 // property tax ~1%, insurance ~0.5%, upkeep ~1% of the price a year
}

const thisYear = new Date().getFullYear()
const taxGuess = computed(() => estimateWithdrawalTax(realFigures.value.investmentAccounts))
const realLoanPayments = computed(() => realFigures.value.loans.reduce((total, loan) => total + loan.monthlyPayment, 0))

// The starting point: your real numbers (copied as plain numbers, so nothing here can write back).
function fromReal() {
  const real = realFigures.value
  const recent = real.recent
  const age = real.age ?? DEFAULTS.age
  return {
    // In retirement
    spendingMonthly: Math.round((recent.spending ?? real.takeHomeMonthly) / 10) * 10,
    loanPaymentsMonthly: Math.round(realLoanPayments.value),
    healthcareMonthly: DEFAULTS.healthcareMonthly,
    withdrawalTax: taxGuess.value.rate,
    socialSecurityMonthly: Math.round(estimateSocialSecurity(real.salary, DEFAULTS.targetAge, DEFAULTS.socialSecurityAge) / 12),
    socialSecurityAge: DEFAULTS.socialSecurityAge,
    // You
    age,
    targetAge: DEFAULTS.targetAge,
    planToAge: DEFAULTS.planToAge,
    // Saving
    startBalance: Math.round(real.netWorth?.Investments ?? 0),
    salary: real.salary,
    k401: real.k401,
    match: real.match,
    deductionsYearly: Math.round(real.deductionsYearly),
    // what's left over each month after spending, from Cash flow (take-home pay minus expenses)
    otherSavingMonthly: Math.max(0, Math.round((recent.leftOver ?? 0) / 10) * 10),
    salaryGrowth: DEFAULTS.salaryGrowth,
    // Markets
    returnRate: DEFAULTS.returnRate,
    inflation: DEFAULTS.inflation,
    volatility: DEFAULTS.volatility,
    confidence: DEFAULTS.confidence,
    // Goal (shown as a toggle, stored as a number like every scenario input)
    keepNestEgg: DEFAULTS.keepNestEgg,
    // Family (left out until switched on)
    includeFamily: 0,
    marriedAtAge: age + 2,
    spouseSalary: DEFAULTS.spouseSalary,
    spouseSavingRate: DEFAULTS.spouseSavingRate,
    // a couple spends about 1.5 times one person
    coupleSpendingMonthly: Math.round(((recent.spending ?? real.takeHomeMonthly) * 0.5) / 10) * 10,
    kids: DEFAULTS.kids,
    firstKidAtAge: age + 3,
    kidsApart: DEFAULTS.kidsApart,
    childMonthly: DEFAULTS.childMonthly,
    childcareMonthly: DEFAULTS.childcareMonthly,
    // Home (left out until switched on)
    includeHome: 0,
    homeAtAge: age + 4,
    homePrice: DEFAULTS.homePrice,
    downPayment: DEFAULTS.downPayment,
    closingCosts: DEFAULTS.closingCosts,
    mortgageRate: DEFAULTS.mortgageRate,
    mortgageYears: DEFAULTS.mortgageYears,
    ownershipRate: DEFAULTS.ownershipRate,
    rentMonthly: Math.round(real.rentMonthly)
  }
}
type Inputs = ReturnType<typeof fromReal>
type Key = keyof Inputs & string

const scenario = useScenario<Inputs>('retirement', fromReal)

// Social Security follows your salary and retirement age until you type your own figure.
const socialSecurityTyped = computed(() => scenario.changed('socialSecurityMonthly'))
const socialSecurityEstimate = computed(() =>
  Math.round(estimateSocialSecurity(scenario.inputs.value.salary, Math.min(scenario.inputs.value.targetAge, 90), scenario.inputs.value.socialSecurityAge) / 12)
)

function toEngine(values: Inputs, typedSocialSecurity: boolean): RetirementInputs {
  // loans keep their real payoff dates; a changed payment total scales them all
  const loanScale = realLoanPayments.value > 0 ? values.loanPaymentsMonthly / realLoanPayments.value : 0
  return {
    currentAge: values.age,
    startBalance: values.startBalance,
    yearlySaving: values.salary * (values.k401 + values.match) + values.deductionsYearly + values.otherSavingMonthly * 12,
    salaryGrowth: values.salaryGrowth,
    salary: values.salary,
    returnRate: values.returnRate,
    inflation: values.inflation,
    volatility: values.volatility,
    retirementSpending: values.spendingMonthly * 12,
    loans: realFigures.value.loans.map((loan) => ({
      monthlyPayment: loan.monthlyPayment * loanScale,
      endsAtAge: values.age + (+loan.payoff.slice(0, 4) - thisYear)
    })),
    healthcareBefore65: values.healthcareMonthly * 12,
    withdrawalTax: values.withdrawalTax,
    socialSecurity: typedSocialSecurity ? values.socialSecurityMonthly * 12 : null,
    socialSecurityAge: values.socialSecurityAge,
    targetAge: values.targetAge,
    planToAge: values.planToAge,
    keepNestEgg: values.keepNestEgg >= 0.5,
    family:
      values.includeFamily >= 0.5
        ? {
            fromAge: values.marriedAtAge,
            spouseSalary: values.spouseSalary,
            spouseSavingRate: values.spouseSavingRate,
            retiredSpending: values.coupleSpendingMonthly * 12,
            kidsAtAge: Array.from({ length: Math.max(0, Math.round(values.kids)) }, (_, index) => values.firstKidAtAge + index * values.kidsApart),
            childYearly: values.childMonthly * 12,
            childcareYearly: values.childcareMonthly * 12
          }
        : undefined,
    home:
      values.includeHome >= 0.5
        ? {
            atAge: values.homeAtAge,
            price: values.homePrice,
            downPayment: values.downPayment,
            closingCosts: values.closingCosts,
            mortgageRate: values.mortgageRate,
            mortgageYears: values.mortgageYears,
            ownershipRate: values.ownershipRate,
            rentYearly: values.rentMonthly * 12
          }
        : undefined
  }
}

const values = computed(() => scenario.inputs.value)
const engine = computed(() => toEngine(values.value, socialSecurityTyped.value))
const result = computed(() => retirement(engine.value, values.value.confidence))
const realEngine = computed(() => toEngine(scenario.real.value, false))
const realResult = computed(() => retirement(realEngine.value, scenario.real.value.confidence))
const changed = computed(() => scenario.changedCount.value > 0)
const target = computed(() => result.value.target)
const varied = computed(() => values.value.volatility > 0)
const keep = computed(() => values.value.keepNestEgg >= 0.5)

/* ---- the goal ---- */

const GOALS = [
  { label: 'Keep the nest egg', value: 1 },
  { label: 'Money lasts', value: 0 }
]
const goalField = scenario.field('keepNestEgg')
const goalModel = computed({ get: () => (keep.value ? 1 : 0), set: (value: number) => (goalField.value = value) })
const goalName = (value: number) => (value >= 0.5 ? 'Keep the nest egg' : 'Money lasts')
/** "you keep your nest egg to 95" / "the money lasts to 95", for sentences */
const goalPhrase = computed(() => (keep.value ? `you keep your nest egg through ${engine.value.planToAge}` : `the money lasts to ${engine.value.planToAge}`))

/* ---- today's or future dollars ---- */

const dollars = ref<'today' | 'future'>('today')
const DOLLARS = [
  { label: 'Today’s $', value: 'today' },
  { label: 'Future $', value: 'future' }
]
const yearAt = (age: number) => thisYear + Math.round(age - values.value.age)
/** today's dollars at `age` → the dollars of that year */
const inflate = (amount: number, age: number) => amount * Math.pow(1 + values.value.inflation, Math.max(0, age - values.value.age))
const shown = (amount: number, age: number) => (dollars.value === 'future' ? inflate(amount, age) : amount)
const dollarNote = computed(() => (dollars.value === 'future' ? 'dollars of each year' : 'today’s dollars'))

/* ---- results ---- */

const headline = computed(() => (varied.value ? result.value.earliestConfident : result.value.earliestAge))
const realHeadline = computed(() => (varied.value ? realResult.value.earliestConfident : realResult.value.earliestAge))
/** How the earliest age compares with your real numbers, once something has changed. */
const versusReal = computed(() => {
  const now = headline.value
  const before = realHeadline.value
  if (!changed.value || now === null || before === null || now === before) return null
  const years = Math.abs(now - before)
  return `${years} ${years === 1 ? 'year' : 'years'} ${now < before ? 'sooner' : 'later'} than your real numbers`
})
const onTrack = computed(() => result.value.chanceAtTarget >= values.value.confidence - 1e-9)
/** What average years do when retiring at the target age, in a few words. */
const averageOutcome = computed(() => {
  const plan = target.value
  if (plan.runsOutAt !== null) return `Runs out at ${plan.runsOutAt}`
  if (!keep.value) return `Lasts past ${engine.value.planToAge}`
  if (plan.works) return `Kept through ${engine.value.planToAge}`
  return plan.atEnd < plan.atRetirement ? `Ends ${pct(1 - plan.atEnd / plan.atRetirement)} lower` : 'Below it near the end'
})

// The retirement budget, monthly: the first year, and once Social Security starts if that's later.
const budgetColumns = computed(() => {
  const retireAge = target.value.retireAge
  const socialSecurity = result.value.socialSecurityAtTarget
  const ages = [retireAge]
  const later = Math.max(values.value.socialSecurityAge, 65)
  if (later > retireAge && later <= values.value.planToAge) ages.push(later)
  return ages.map((age) => ({ age, budget: budgetAt(engine.value, age, socialSecurity) }))
})
const budgetRows = computed(() => {
  const monthly = (amount: number, age: number) => shown(amount, age) / 12
  const columns = budgetColumns.value
  const any = (pick: (budget: (typeof columns)[number]['budget']) => number) => columns.some((column) => Math.abs(pick(column.budget)) > 0.5)
  return [
    { label: 'Spending target', pick: (b: (typeof columns)[number]['budget']) => b.target, show: true },
    { label: 'Loan payments gone or smaller', pick: (b: (typeof columns)[number]['budget']) => b.loanChange, show: any((b) => b.loanChange) },
    { label: engine.value.family ? 'Health insurance until 65, for two' : 'Health insurance until 65', pick: (b: (typeof columns)[number]['budget']) => b.healthcare, show: any((b) => b.healthcare) },
    { label: 'Kids and spending for two', pick: (b: (typeof columns)[number]['budget']) => b.family, show: any((b) => b.family) },
    { label: 'Owning instead of renting', pick: (b: (typeof columns)[number]['budget']) => b.home, show: any((b) => b.home) },
    { label: 'Social Security', pick: (b: (typeof columns)[number]['budget']) => -b.socialSecurity, show: any((b) => b.socialSecurity) },
    { label: 'Tax on withdrawals', pick: (b: (typeof columns)[number]['budget']) => b.tax, show: any((b) => b.tax) },
    { label: 'Taken from investments', pick: (b: (typeof columns)[number]['budget']) => b.withdrawal, show: true, total: true }
  ]
    .filter((row) => row.show)
    .map((row) => ({ label: row.label, total: !!row.total, cells: columns.map((column) => monthly(row.pick(column.budget), column.age)) }))
})
const signedMonthly = (amount: number) => (amount < -0.5 ? `−${money(-amount)}` : money(amount))

/* ---- inputs ---- */

type Kind = 'money' | 'percent' | 'age'
interface FieldSpec {
  key: Key
  label: string
  kind: Kind
  /** where the starting value comes from; leave out for plain assumptions */
  source?: () => string | undefined
  hint?: () => string | undefined
  min?: number
  max?: number
  hidden?: () => boolean
}

const net = computed(() => realFigures.value.netWorth)
const recent = computed(() => realFigures.value.recent)
const recentSource = () =>
  recent.value.months ? `Cash flow, ${recent.value.months}-month average${recent.value.from ? ` since ${ymLabel(recent.value.from)}` : ''}` : 'your take-home pay'
const futureMonthly = (key: 'spendingMonthly' | 'healthcareMonthly') =>
  `About ${money(inflate(values.value[key], target.value.retireAge))} a month in ${yearAt(target.value.retireAge)} dollars.`
const loanList = () =>
  realFigures.value.loans.map((loan) => `${loan.name} ends ${ymLabel(loan.payoff)} (age ${values.value.age + (+loan.payoff.slice(0, 4) - thisYear)})`).join(' · ')
const taxSource = () => (realFigures.value.investmentAccounts.length ? 'your Net worth account names' : undefined)
const taxHint = () => {
  const guess = taxGuess.value
  const parts = [
    guess.taxFree.length ? `tax-free: ${guess.taxFree.join(', ')}` : '',
    guess.taxable.length ? `gains only: ${guess.taxable.join(', ')}` : '',
    guess.preTax.length ? `pre-tax: ${guess.preTax.join(', ')}` : ''
  ].filter(Boolean)
  return parts.length ? `Guessed from ${parts.join('; ')}. A Roth 401k counts as tax-free.` : 'Roth and HSA money comes out tax-free; pre-tax 401k and IRA money is taxed.'
}

/* ---- family and home ---- */

const INCLUDE = [
  { label: 'Left out', value: 0 },
  { label: 'In the plan', value: 1 }
]
type ToggleKey = 'includeFamily' | 'includeHome'
const toggleModels = Object.fromEntries(
  (['includeFamily', 'includeHome'] as const).map((key) => {
    const raw = scenario.field(key)
    return [key, computed({ get: () => (raw.value >= 0.5 ? 1 : 0), set: (value: number) => (raw.value = value) })]
  })
) as Record<ToggleKey, WritableComputedRef<number>>
const included = (key: ToggleKey) => values.value[key] >= 0.5
const includeName = (value: number) => (value >= 0.5 ? 'In the plan' : 'Left out')

const kidsAges = computed(() => engine.value.family?.kidsAtAge ?? [])
/** The most the kids cost in a year, and from what age of yours. */
const kidsPeak = computed(() => {
  let peak = { amount: 0, age: 0 }
  for (const born of kidsAges.value)
    for (let age = born; age < born + 18; age++) {
      const amount = lifeAt(engine.value, age).kids
      if (amount > peak.amount + 0.5) peak = { amount, age }
    }
  return peak
})
const familySummary = () => {
  const family = engine.value.family
  if (!family) return ''
  const spouse = `Your spouse saves about ${money((family.spouseSalary * family.spouseSavingRate) / 12)} a month from ${family.fromAge}`
  const ss = `and adds about ${money(spouseSocialSecurity(engine.value, target.value.retireAge) / 12)} a month of Social Security`
  if (!kidsAges.value.length) return `${spouse} ${ss}.`
  const last = Math.max(...kidsAges.value) + 17
  return `${spouse} ${ss}. Kids cost up to ${money(kidsPeak.value.amount / 12)} a month (at ${kidsPeak.value.age}), until you're ${last}.`
}
const homeSummary = () => {
  const home = engine.value.home
  if (!home) return ''
  const payment = mortgagePayment(home.price * (1 - home.downPayment), home.mortgageRate, home.mortgageYears)
  const upfront = home.price * (home.downPayment + home.closingCosts)
  const owning = (home.price * home.ownershipRate) / 12
  return `${money(upfront)} down and closing at ${home.atAge}, from your investments. Then ${money(payment)} a month mortgage until ${home.atAge + home.mortgageYears} plus ${money(owning)} tax, insurance and upkeep, instead of ${money(home.rentYearly / 12)} rent.`
}

const GROUPS: { title: string; toggle?: ToggleKey; summary?: () => string; fields: FieldSpec[] }[] = [
  {
    title: 'You',
    fields: [
      {
        key: 'age',
        label: 'Age today',
        kind: 'age',
        min: 16,
        max: 90,
        source: () => (realFigures.value.age !== null ? 'your birth year on the profile' : undefined),
        hint: () => (realFigures.value.age === null ? 'Add your birth year on the profile to start from your real age.' : undefined)
      },
      { key: 'targetAge', label: 'Retire at', kind: 'age', min: 30, max: 90 },
      { key: 'planToAge', label: 'Money should last until', kind: 'age', min: 60, max: 110 }
    ]
  },
  {
    title: 'Saving',
    fields: [
      { key: 'startBalance', label: 'Invested today', kind: 'money', source: () => (net.value ? `Net worth Investments, ${shortDate(net.value.date)}` : undefined), hint: () => (net.value?.Cash ? `Cash (${money(net.value.Cash)}) and home equity aren't counted.` : undefined) },
      { key: 'salary', label: 'Gross salary, yearly', kind: 'money', source: () => 'profile' },
      { key: 'k401', label: 'Your 401k', kind: 'percent', max: 100, source: () => 'profile' },
      { key: 'match', label: 'Company 401k', kind: 'percent', max: 100, source: () => 'profile' },
      { key: 'deductionsYearly', label: 'Other paycheck saving (HSA...), yearly', kind: 'money', source: () => 'profile' },
      { key: 'otherSavingMonthly', label: 'Other saving a month (IRA, brokerage)', kind: 'money', source: recentSource, hint: () => 'What’s left after spending, invested.' },
      { key: 'salaryGrowth', label: 'Raise each year', kind: 'percent', min: -10, max: 20, hint: () => 'Saving grows with your pay.' }
    ]
  },
  {
    title: 'Family',
    toggle: 'includeFamily',
    summary: familySummary,
    fields: [
      { key: 'marriedAtAge', label: 'Married at', kind: 'age', min: 16, max: 90 },
      { key: 'spouseSalary', label: 'Spouse’s gross salary, yearly', kind: 'money', hint: () => 'Today’s dollars; gets the same raises as yours. US median full-time pay is about $62,000.' },
      { key: 'spouseSavingRate', label: 'Spouse saves', kind: 'percent', max: 100, hint: () => 'Share of their pay invested (their 401k, match, IRA).' },
      { key: 'coupleSpendingMonthly', label: 'Extra spending in retirement for two, a month', kind: 'money', hint: () => 'Added to your spending target once retired. A couple spends about 1.5 times one person. Health insurance before 65 doubles too.' },
      { key: 'kids', label: 'Kids', kind: 'age', min: 0, max: 8 },
      { key: 'firstKidAtAge', label: 'First child when you’re', kind: 'age', min: 16, max: 70, hidden: () => values.value.kids < 1 },
      { key: 'kidsApart', label: 'Years between kids', kind: 'age', min: 1, max: 10, hidden: () => values.value.kids < 2 },
      {
        key: 'childMonthly',
        label: 'Cost per child a month, to 18',
        kind: 'money',
        hidden: () => values.value.kids < 1,
        hint: () => 'US average for a middle-income married couple: about $18,000 a year (USDA estimate in today’s dollars). College isn’t included.'
      },
      {
        key: 'childcareMonthly',
        label: 'Child care per child a month, before school',
        kind: 'money',
        hidden: () => values.value.kids < 1,
        hint: () => 'On top, birth to 5, since you both work. US average is about $13,000 a year (Child Care Aware, 2024).'
      }
    ]
  },
  {
    title: 'Home',
    toggle: 'includeHome',
    summary: homeSummary,
    fields: [
      { key: 'homeAtAge', label: 'Buy at', kind: 'age', min: 16, max: 90 },
      { key: 'homePrice', label: 'Home price, today’s dollars', kind: 'money', hint: () => 'The US median existing home sold for about $410,000 in 2025.' },
      { key: 'downPayment', label: 'Down payment', kind: 'percent', max: 100, hint: () => 'Comes out of your investments the year you buy, with the closing costs. 20% avoids mortgage insurance.' },
      { key: 'closingCosts', label: 'Closing costs', kind: 'percent', max: 10 },
      { key: 'mortgageRate', label: 'Mortgage rate', kind: 'percent', max: 15 },
      { key: 'mortgageYears', label: 'Mortgage length, years', kind: 'age', min: 5, max: 40, hint: () => 'A fixed payment: inflation shrinks it each year, and it stops at payoff.' },
      { key: 'ownershipRate', label: 'Tax, insurance and upkeep, yearly', kind: 'percent', max: 10, hint: () => 'Share of the price: property tax ~1%, insurance ~0.5%, upkeep ~1%.' },
      {
        key: 'rentMonthly',
        label: 'Rent that stops, a month',
        kind: 'money',
        source: () => (realFigures.value.rentMonthly ? 'your profile’s rent (your share)' : undefined),
        hint: () => 'It’s in your spending today, so it comes off once you own.'
      }
    ]
  },
  {
    title: 'Markets',
    fields: [
      { key: 'returnRate', label: 'Investment return, average year', kind: 'percent', min: -10, max: 20, hint: () => 'Before inflation. 7% is a common long-run guess for a stock-heavy mix.' },
      { key: 'inflation', label: 'Inflation, yearly', kind: 'percent', min: 0, max: 15 },
      { key: 'volatility', label: 'Ups and downs (volatility)', kind: 'percent', min: 0, max: 40, hint: () => 'How much a year swings. ~15% for mostly stocks, ~10% for a 60/40 mix. 0 turns it off.' },
      { key: 'confidence', label: 'Chance the plan should work', kind: 'percent', min: 50, max: 99, hint: () => `Chance ${goalPhrase.value}. The earliest age is the first one that clears this.` }
    ]
  },
  {
    title: 'In retirement',
    fields: [
      { key: 'spendingMonthly', label: 'Spending target a month, today’s dollars', kind: 'money', source: recentSource, hint: () => futureMonthly('spendingMonthly') },
      {
        key: 'loanPaymentsMonthly',
        label: 'Loan payments in that spending, a month',
        kind: 'money',
        source: () => 'your profile’s loans',
        hint: () => `They stop when paid off: ${loanList()}. Set 0 if your spending doesn’t include them.`,
        hidden: () => !realFigures.value.loans.length
      },
      { key: 'healthcareMonthly', label: 'Health insurance before 65, a month', kind: 'money', hint: () => `Only if you retire before Medicare. ${futureMonthly('healthcareMonthly')}` },
      { key: 'withdrawalTax', label: 'Tax on withdrawals', kind: 'percent', max: 50, source: taxSource, hint: taxHint },
      {
        key: 'socialSecurityMonthly',
        label: 'Social Security a month, today’s dollars',
        kind: 'money',
        hint: () =>
          socialSecurityTyped.value
            ? 'Your figure. Get yours at ssa.gov (my Social Security).'
            : `Rough estimate from your salary, working until ${target.value.retireAge}, claimed at ${values.value.socialSecurityAge}. Get yours at ssa.gov.`
      },
      { key: 'socialSecurityAge', label: 'Social Security starts at', kind: 'age', min: 62, max: 70, hint: () => 'Claiming at 62 pays 30% less than at 67; waiting to 70 pays 24% more.' }
    ]
  }
]

// Percents are stored 0–1 and edited as 0–100. Social Security shows the live estimate until you type your own.
const models = Object.fromEntries(
  GROUPS.flatMap((group) => group.fields).map((spec) => {
    const raw = scenario.field(spec.key)
    const model: WritableComputedRef<number | null> =
      spec.kind === 'percent'
        ? computed({ get: () => Math.round(raw.value * 10000) / 100, set: (value) => (raw.value = value === null ? NaN : value / 100) })
        : spec.key === 'socialSecurityMonthly'
          ? computed({
              get: () => (socialSecurityTyped.value ? raw.value : socialSecurityEstimate.value),
              set: (value) => (raw.value = value === null ? NaN : value)
            })
          : computed({ get: () => raw.value, set: (value) => (raw.value = value === null ? NaN : value) })
    return [spec.key, model]
  })
) as Record<Key, WritableComputedRef<number | null>>

const realText = (spec: FieldSpec) => {
  const value = spec.key === 'socialSecurityMonthly' ? socialSecurityEstimate.value : scenario.real.value[spec.key]
  return spec.kind === 'money' ? money(value) : spec.kind === 'percent' ? pct(value) : String(value)
}
const realSource = (spec: FieldSpec) => (spec.key === 'socialSecurityMonthly' ? 'the estimate' : spec.source?.())
const inputProps = (spec: FieldSpec) =>
  spec.kind === 'money'
    ? { mode: 'currency', currency: 'USD', locale: 'en-US', maxFractionDigits: 0, min: 0 }
    : spec.kind === 'percent'
      ? { suffix: '%', maxFractionDigits: 2, min: spec.min ?? 0, max: spec.max }
      : { useGrouping: false, min: spec.min, max: spec.max }

/* ---- chart ---- */

/** Rounds up to a tidy axis top (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten). */
function niceCeiling(value: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(value)))
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => step * power >= value) ?? 10) * power
}

const chart = computed<ChartBuilder>(() => {
  const mine = target.value.years
  const range = result.value.range
  const real = changed.value ? project(realEngine.value, realEngine.value.targetAge).years : null
  const retireIndex = mine.findIndex((year) => year.age === target.value.retireAge)
  const showRange = varied.value
  // The axis fits the average-years lines (yours and your real numbers), not the good-years band, which
  // compounds to huge numbers late in life; the band is cut off at the top instead.
  const averageTop = Math.max(...mine.map((year) => shown(year.balance, year.age)), ...(real ?? []).map((year) => shown(year.balance, year.age)), 1)
  const yMax = niceCeiling(averageTop * 1.05)
  return (dark, colors) => {
    const blue = series(ROLE.investments, dark)
    return {
      type: 'line',
      data: {
        labels: mine.map((year) => String(year.age)),
        datasets: [
          ...(showRange
            ? [
                {
                  label: 'Good years (1 in 10 do better)',
                  data: range.map((year) => shown(year.high, year.age)),
                  borderColor: 'transparent',
                  backgroundColor: blue + (dark ? '2e' : '1f'),
                  borderWidth: 0,
                  fill: '+1' as const,
                  tension: 0.25,
                  pointRadius: 0,
                  pointHoverRadius: 0
                },
                {
                  label: 'Bad years (1 in 10 do worse)',
                  data: range.map((year) => shown(year.low, year.age)),
                  borderColor: blue + '66',
                  backgroundColor: blue + '66',
                  borderWidth: 1,
                  fill: false,
                  tension: 0.25,
                  pointRadius: 0,
                  pointHoverRadius: 0
                }
              ]
            : []),
          {
            label: changed.value ? 'Average years, with your changes' : 'Average years',
            data: mine.map((year) => shown(year.balance, year.age)),
            borderColor: blue,
            backgroundColor: blue,
            borderWidth: 2,
            fill: false,
            tension: 0.25,
            pointRadius: mine.map((_, index) => (index === retireIndex ? 5 : 0)),
            pointHoverRadius: 5
          },
          ...(keep.value
            ? [
                {
                  label: 'Nest egg to keep',
                  // flat in today's dollars from the day you retire; in future dollars it rises with inflation
                  data: mine.map((year) => (year.age >= target.value.retireAge ? shown(target.value.atRetirement, year.age) : null)),
                  borderColor: colors.ink2,
                  backgroundColor: colors.ink2,
                  borderWidth: 1.5,
                  borderDash: [2, 3],
                  fill: false,
                  tension: 0,
                  pointRadius: 0,
                  pointHoverRadius: 4
                }
              ]
            : []),
          ...(real
            ? [
                {
                  label: 'Your real numbers',
                  data: mine.map((year) => {
                    const point = real.find((entry) => entry.age === year.age)
                    return point ? shown(point.balance, point.age) : null
                  }),
                  borderColor: colors.muted,
                  backgroundColor: colors.muted,
                  borderWidth: 1.5,
                  borderDash: [5, 4],
                  fill: false,
                  tension: 0.25,
                  pointRadius: 0,
                  pointHoverRadius: 4
                }
              ]
            : [])
        ]
      },
      options: {
        scales: { y: { beginAtZero: true, max: yMax }, x: { ticks: { maxTicksLimit: 9, autoSkip: true } } },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => {
                const age = Number(items[0]?.label)
                return `Age ${age} · ${yearAt(age)}${age === target.value.retireAge ? ' · retire' : ''}`
              }
            }
          }
        }
      }
    }
  }
})
</script>

<template>
  <SimulatorShell id="retirement" :changed-count="scenario.changedCount.value" @reset="scenario.reset()" @navigate="(id) => emit('navigate', id)">
    <!-- Phones: the answer stays in view while you scroll through the inputs -->
    <div class="sticky-answer" aria-hidden="true">
      <span>Earliest <strong class="num">{{ headline ?? '—' }}</strong></span>
      <span>At {{ target.retireAge }}: <strong class="num">{{ moneyCompact(shown(target.atRetirement, target.retireAge)) }}</strong></span>
      <span :class="onTrack ? 'pos' : 'neg'">{{ varied ? `${Math.floor(result.chanceAtTarget * 100 + 1e-9)}% ${keep ? 'kept' : 'lasts'}` : averageOutcome }}</span>
    </div>

    <div class="layout">
      <div class="results">
        <section class="panel hero" aria-live="polite">
          <div class="main-kpi">
            <p class="ink2">Earliest you could retire</p>
            <template v-if="headline !== null">
              <p class="hero-num num">{{ headline }}</p>
              <p class="muted small">
                in {{ yearAt(headline) }}<template v-if="headline === engine.currentAge"> (you already could)</template>
                <template v-if="varied"> · {{ pct(values.confidence) }} chance {{ goalPhrase }}</template>
                <template v-else-if="keep"> · keeping your nest egg through {{ engine.planToAge }}</template>
              </p>
              <p v-if="varied && result.earliestAge !== null && result.earliestAge !== headline" class="muted small">{{ result.earliestAge }} if every year is an average year</p>
              <p v-if="versusReal" class="ink2 small">{{ versusReal }}</p>
            </template>
            <template v-else>
              <p class="hero-num num">—</p>
              <p class="muted small">Not with a {{ pct(values.confidence) }} chance {{ goalPhrase }}. Try saving more, spending less<template v-if="varied">, or a lower chance</template>.</p>
              <p v-if="varied && result.earliestAge !== null" class="muted small">{{ result.earliestAge }} if every year is an average year</p>
            </template>
          </div>
          <dl class="kpis">
            <div>
              <dt>Retiring at {{ target.retireAge }}</dt>
              <dd :class="onTrack ? 'pos' : 'neg'">
                <template v-if="varied">{{ Math.floor(result.chanceAtTarget * 100 + 1e-9) }}% chance {{ keep ? 'it’s kept' : 'it lasts' }}</template>
                <template v-else>{{ averageOutcome }}</template>
              </dd>
              <dd class="sub muted">{{ varied && !target.works ? `average years: ${averageOutcome.toLowerCase()}` : `to age ${engine.planToAge}` }}</dd>
            </div>
            <div>
              <dt>Invested at {{ target.retireAge }}</dt>
              <dd class="num">{{ money(shown(target.atRetirement, target.retireAge)) }}</dd>
              <dd class="sub muted">{{ Number.isFinite(result.neededAtTarget) ? `needs about ${money(shown(result.neededAtTarget, target.retireAge))}` : 'can’t be kept at this return' }}</dd>
            </div>
            <div>
              <dt>Spending target</dt>
              <dd class="num">{{ money(values.spendingMonthly) }}/mo</dd>
              <dd class="sub muted">≈ {{ money(inflate(values.spendingMonthly, target.retireAge)) }}/mo in {{ yearAt(target.retireAge) }}</dd>
            </div>
            <div>
              <dt>Saving a year</dt>
              <dd class="num">{{ money(engine.yearlySaving) }}</dd>
              <dd class="sub muted">{{ values.salary ? `${pct(engine.yearlySaving / values.salary)} of gross pay` : '' }}</dd>
            </div>
          </dl>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Invested over time</h2>
            <SelectButton v-model="dollars" :options="DOLLARS" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Dollars" />
          </div>
          <BaseChart :build="chart" height="260px" :label="`Projected invested balance by age, retiring at ${target.retireAge}`" />
          <div class="legend">
            <span><i class="swatch line" :style="{ background: 'var(--nw-investments)' }"></i>Average years</span>
            <span v-if="varied"><i class="swatch band"></i>Bad to good years (8 in 10 runs)</span>
            <span v-if="keep"><i class="swatch line dotted"></i>Nest egg to keep</span>
            <span v-if="changed"><i class="swatch line dashed"></i>Your real numbers</span>
            <span><i class="swatch dot-swatch"></i>Retire at {{ target.retireAge }}</span>
          </div>
          <p class="muted small chart-note">{{ dollars === 'future' ? 'In the dollars of each year (inflation included).' : 'In today’s dollars.' }} {{ pct(result.realReturn) }} average return after inflation.</p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Your retirement budget</h2>
            <p class="muted">a month, {{ dollarNote }}</p>
          </div>
          <table class="budget">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Item</span></th>
                <th v-for="column in budgetColumns" :key="column.age" scope="col" class="r">At {{ column.age }}<span class="muted year"> · {{ yearAt(column.age) }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in budgetRows" :key="row.label" :class="{ total: row.total }">
                <th scope="row">{{ row.label }}</th>
                <td v-for="(cell, index) in row.cells" :key="index" class="num r">{{ signedMonthly(cell) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <details class="panel assumptions">
          <summary>How this is worked out</summary>
          <ul>
            <li>Everything runs in today’s dollars: growth is the return minus inflation, and saving grows with raises above inflation. “Future $” just adds inflation back for display.</li>
            <li>Until you retire, each year’s saving is added and the balance earns the return. After, saving stops and the budget above comes out each year.</li>
            <li>Loan payments are fixed, so inflation shrinks them each year, and they stop at payoff. Health insurance is added until Medicare at 65.</li>
            <li>Social Security, unless you type yours: today’s salary for each year from 22 until you retire (the best 35 count), through the 2026 benefit formula, adjusted for the age you claim. It assumes today’s rules; a shortfall in the trust fund could cut it about 20% from the 2030s.</li>
            <li>Tax on withdrawals is one flat rate on everything taken out. Roth and HSA money is tax-free; pre-tax 401k and IRA money is taxed like income.</li>
            <li>Ups and downs: the plan runs against {{ 500 }} sequences of yearly returns that average out to your return, with the volatility you set. Bad years early in retirement hurt most; that’s why the chance can be below 100% even when average years look fine.</li>
            <li>The goal. Money lasts: the balance never hits zero before the plan-to age. Keep the nest egg: in at least 3 of the last 5 years of the plan, you still have what you retired with, in today’s dollars (so it keeps up with inflation). Looking at 5 years means one crash in the final year doesn’t decide it. It can dip along the way; you live off the growth, not the savings. That takes a bigger balance, so the earliest age is later.</li>
            <li>Family (when in the plan): from the age you marry, your spouse’s saving is added while you work, health insurance before 65 is for two, retirement spending rises by the extra for two, and their Social Security (their own estimate, or half of yours if more) is added. Each child costs the monthly amount until 18, plus child care until 5; while working that comes out of what you save. You both retire at the same age.</li>
            <li>Home (when in the plan): the down payment and closing costs come out of your investments the year you buy. From then on the mortgage (fixed, so it shrinks with inflation and stops at payoff) plus tax, insurance and upkeep replace your rent. The home itself isn’t counted as money to retire on.</li>
            <li>Only invested money counts (Net worth’s Investments group). Cash, home equity and other assets aren’t drawn on. Contribution limits and required withdrawals aren’t modelled.</li>
          </ul>
        </details>
      </div>

      <div class="inputs">
        <section v-for="group in GROUPS" :key="group.title" class="panel sim-panel">
          <h2>{{ group.title }}</h2>
          <div v-if="group.toggle" class="grid toggle-row">
            <SimField
              :label="group.title === 'Family' ? 'A spouse and kids' : 'Buy a home'"
              :changed="scenario.changed(group.toggle)"
              :real-text="includeName(scenario.real.value[group.toggle])"
              @reset="scenario.reset(group.toggle)"
            >
              <SelectButton v-model="toggleModels[group.toggle].value" :options="INCLUDE" option-label="label" option-value="value" :allow-empty="false" size="small" :aria-label="group.title" />
            </SimField>
          </div>
          <p v-if="group.toggle && included(group.toggle)" class="ink2 small group-summary">{{ group.summary?.() }}</p>
          <div v-if="!group.toggle || included(group.toggle)" class="grid">
            <SimField
              v-if="group.title === 'You'"
              label="Goal"
              :changed="scenario.changed('keepNestEgg')"
              :real-text="goalName(scenario.real.value.keepNestEgg)"
              :hint="keep ? 'In most of your last 5 years, still have what you retired with, after inflation.' : 'Don’t run out before the age below.'"
              @reset="scenario.reset('keepNestEgg')"
            >
              <SelectButton v-model="goalModel" :options="GOALS" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Goal" />
            </SimField>
            <template v-for="spec in group.fields" :key="spec.key">
              <SimField
                v-if="!spec.hidden?.()"
                :label="spec.label"
                :changed="scenario.changed(spec.key)"
                :real-text="realText(spec)"
                :source="scenario.changed(spec.key) ? realSource(spec) : spec.source?.()"
                :hint="spec.hint?.()"
                @reset="scenario.reset(spec.key)"
              >
                <InputNumber
                  :model-value="models[spec.key].value"
                  v-bind="inputProps(spec)"
                  fluid
                  @update:model-value="(value: number | null) => (models[spec.key].value = value)"
                />
              </SimField>
            </template>
          </div>
        </section>
      </div>
    </div>
  </SimulatorShell>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 16px;
}
.results,
.inputs {
  display: grid;
  gap: 16px;
  align-content: start;
  min-width: 0;
}
@media (min-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr);
    align-items: start;
  }
}

.sticky-answer {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 0 -16px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--line);
  font-size: 0.8125rem;
  color: var(--ink-2);
  white-space: nowrap;
}
.sticky-answer strong {
  color: var(--ink);
}
@media (min-width: 960px) {
  .sticky-answer {
    display: none;
  }
}

.hero {
  display: grid;
  gap: 16px;
}
@media (min-width: 720px) {
  .hero {
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.6fr);
    align-items: center;
  }
}
.main-kpi {
  display: grid;
  gap: 2px;
}
.hero-num {
  font-size: clamp(2.5rem, 10vw, 3.5rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.05;
}
.small {
  font-size: 0.8125rem;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 12px;
  margin: 0;
}
.kpis div {
  display: grid;
  gap: 2px;
  align-content: start;
}
.kpis dt {
  font-size: 0.75rem;
  color: var(--muted);
}
.kpis dd {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 600;
}
.kpis dd.sub {
  font-size: 0.75rem;
  font-weight: 400;
}

.legend {
  margin-top: 10px;
}
.chart-note {
  margin-top: 6px;
}
.swatch.dashed {
  background: repeating-linear-gradient(90deg, var(--muted) 0 5px, transparent 5px 9px);
}
.swatch.dotted {
  background: repeating-linear-gradient(90deg, var(--ink-2) 0 2px, transparent 2px 5px);
}
.swatch.band {
  background: color-mix(in srgb, var(--nw-investments) 30%, transparent);
}
.dot-swatch {
  border-radius: 50%;
  background: var(--nw-investments);
}

.budget {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.budget th,
.budget td {
  padding: 7px 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-weight: 400;
}
.budget thead th {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 500;
}
.budget .r {
  text-align: right;
  padding-left: 12px;
  white-space: nowrap;
}
.budget tbody th {
  color: var(--ink-2);
}
.budget .total th,
.budget .total td {
  border-bottom: 0;
  font-weight: 600;
  color: var(--ink);
}
.year {
  font-weight: 400;
}
@media (max-width: 420px) {
  .year {
    display: none;
  }
}

/* Inputs on Plan pages get a dashed edge: scratch numbers, not your saved ones. */
.sim-panel {
  border-style: dashed;
}
.sim-panel h2 {
  margin-bottom: 12px;
}
.grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 520px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.toggle-row {
  margin-bottom: 12px;
}
.group-summary {
  margin: 0 0 12px;
}
.assumptions summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9375rem;
}
.assumptions ul {
  margin: 10px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--ink-2);
  font-size: 0.8125rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
