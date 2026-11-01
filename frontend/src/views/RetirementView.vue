<script setup lang="ts">
import { computed, type WritableComputedRef } from 'vue'
import InputNumber from 'primevue/inputnumber'
import SimulatorShell from '../components/SimulatorShell.vue'
import SimField from '../components/SimField.vue'
import BaseChart from '../components/BaseChart.vue'
import { useScenario } from '../lib/scenario'
import { retirement, project, type RetirementInputs } from '../lib/retirement'
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
  socialSecurityMonthly: 0,
  socialSecurityAge: 67
}

// The starting point: your real numbers (copied as plain numbers, so nothing here can write back).
function fromReal() {
  const real = realFigures.value
  const recent = real.recent
  return {
    age: real.age ?? DEFAULTS.age,
    targetAge: DEFAULTS.targetAge,
    planToAge: DEFAULTS.planToAge,
    salary: real.salary,
    k401: real.k401,
    match: real.match,
    deductionsYearly: Math.round(real.deductionsYearly),
    // what's left over each month after spending, from Cash flow (take-home pay minus expenses)
    otherSavingMonthly: Math.max(0, Math.round((recent.leftOver ?? 0) / 10) * 10),
    salaryGrowth: DEFAULTS.salaryGrowth,
    startBalance: Math.round(real.netWorth?.Investments ?? 0),
    returnRate: DEFAULTS.returnRate,
    inflation: DEFAULTS.inflation,
    // today's spending carries into retirement; without entries, spending all of take-home pay
    spendingMonthly: Math.round((recent.spending ?? real.takeHomeMonthly) / 10) * 10,
    socialSecurityMonthly: DEFAULTS.socialSecurityMonthly,
    socialSecurityAge: DEFAULTS.socialSecurityAge
  }
}
type Inputs = ReturnType<typeof fromReal>
type Key = keyof Inputs & string

const scenario = useScenario<Inputs>('retirement', fromReal)

const toEngine = (values: Inputs): RetirementInputs => ({
  currentAge: values.age,
  startBalance: values.startBalance,
  yearlySaving: values.salary * (values.k401 + values.match) + values.deductionsYearly + values.otherSavingMonthly * 12,
  salaryGrowth: values.salaryGrowth,
  returnRate: values.returnRate,
  inflation: values.inflation,
  retirementSpending: values.spendingMonthly * 12,
  socialSecurity: values.socialSecurityMonthly * 12,
  socialSecurityAge: values.socialSecurityAge,
  targetAge: values.targetAge,
  planToAge: values.planToAge
})

const engine = computed(() => toEngine(scenario.inputs.value))
const result = computed(() => retirement(engine.value))
const realEngine = computed(() => toEngine(scenario.real.value))
const realResult = computed(() => retirement(realEngine.value))
const changed = computed(() => scenario.changedCount.value > 0)

const thisYear = new Date().getFullYear()
const yearAt = (age: number) => thisYear + Math.round(age - scenario.inputs.value.age)

/** How the earliest age compares with your real numbers, once something has changed. */
const versusReal = computed(() => {
  const now = result.value.earliestAge
  const before = realResult.value.earliestAge
  if (!changed.value || now === null || before === null || now === before) return null
  const years = Math.abs(now - before)
  return `${years} ${years === 1 ? 'year' : 'years'} ${now < before ? 'sooner' : 'later'} than your real numbers`
})
const target = computed(() => result.value.target)
const shortfall = computed(() => Math.max(0, result.value.neededAtTarget - target.value.atRetirement))

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
}

const net = computed(() => realFigures.value.netWorth)
const recent = computed(() => realFigures.value.recent)
const recentSource = () =>
  recent.value.months ? `Cash flow, ${recent.value.months}-month average${recent.value.from ? ` since ${ymLabel(recent.value.from)}` : ''}` : 'your take-home pay'

const GROUPS: { title: string; note?: string; fields: FieldSpec[] }[] = [
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
    title: 'Markets',
    fields: [
      { key: 'returnRate', label: 'Investment return, yearly', kind: 'percent', min: -10, max: 20, hint: () => 'Before inflation. 7% is a common long-run stock-heavy guess.' },
      { key: 'inflation', label: 'Inflation, yearly', kind: 'percent', min: 0, max: 15, hint: () => 'Results are shown in today’s dollars.' }
    ]
  },
  {
    title: 'In retirement',
    fields: [
      { key: 'spendingMonthly', label: 'Spending a month, today’s dollars', kind: 'money', source: recentSource, hint: () => 'Rent and loan payments included; lower it if they’ll be gone.' },
      { key: 'socialSecurityMonthly', label: 'Social Security a month', kind: 'money', hint: () => 'Left out by default. Your estimate is on ssa.gov.' },
      { key: 'socialSecurityAge', label: 'Social Security starts at', kind: 'age', min: 62, max: 70 }
    ]
  }
]

// Percents are stored 0–1 and edited as 0–100.
const models = Object.fromEntries(
  GROUPS.flatMap((group) => group.fields).map((spec) => {
    const raw = scenario.field(spec.key)
    const model: WritableComputedRef<number | null> =
      spec.kind === 'percent'
        ? computed({ get: () => Math.round(raw.value * 10000) / 100, set: (value) => (raw.value = value === null ? NaN : value / 100) })
        : computed({ get: () => raw.value, set: (value) => (raw.value = value === null ? NaN : value) })
    return [spec.key, model]
  })
) as Record<Key, WritableComputedRef<number | null>>

const realText = (spec: FieldSpec) => {
  const value = scenario.real.value[spec.key]
  return spec.kind === 'money' ? money(value) : spec.kind === 'percent' ? pct(value) : String(value)
}
const inputProps = (spec: FieldSpec) =>
  spec.kind === 'money'
    ? { mode: 'currency', currency: 'USD', locale: 'en-US', maxFractionDigits: 0, min: 0 }
    : spec.kind === 'percent'
      ? { suffix: '%', maxFractionDigits: 2, min: spec.min ?? 0, max: spec.max, step: 0.5, showButtons: false }
      : { useGrouping: false, min: spec.min, max: spec.max }

/* ---- chart ---- */

const chart = computed<ChartBuilder>(() => {
  const mine = target.value.years
  const real = changed.value ? project(realEngine.value, realEngine.value.targetAge).years : null
  const retireIndex = mine.findIndex((year) => year.age === target.value.retireAge)
  return (dark, colors) => ({
    type: 'line',
    data: {
      labels: mine.map((year) => String(year.age)),
      datasets: [
        {
          label: changed.value ? 'With your changes' : 'Invested',
          data: mine.map((year) => year.balance),
          borderColor: series(ROLE.investments, dark),
          backgroundColor: series(ROLE.investments, dark) + (dark ? '33' : '22'),
          borderWidth: 2,
          fill: 'origin' as const,
          tension: 0.25,
          pointRadius: mine.map((_, index) => (index === retireIndex ? 5 : 0)),
          pointHoverRadius: 5
        },
        ...(real
          ? [
              {
                label: 'Your real numbers',
                data: mine.map((year) => real.find((point) => point.age === year.age)?.balance ?? null),
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
      scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 9, autoSkip: true } } },
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
  })
})
</script>

<template>
  <SimulatorShell id="retirement" :changed-count="scenario.changedCount.value" @reset="scenario.reset()" @navigate="(id) => emit('navigate', id)">
    <!-- Phones: the answer stays in view while you scroll through the inputs -->
    <div class="sticky-answer" aria-hidden="true">
      <span>Earliest <strong class="num">{{ result.earliestAge ?? '—' }}</strong></span>
      <span>At {{ target.retireAge }}: <strong class="num">{{ moneyCompact(target.atRetirement) }}</strong></span>
      <span :class="target.runsOutAt ? 'neg' : 'pos'">{{ target.runsOutAt ? `Out at ${target.runsOutAt}` : `Lasts to ${engine.planToAge}` }}</span>
    </div>

    <div class="layout">
      <div class="results">
        <section class="panel hero" aria-live="polite">
          <div class="kpi main-kpi">
            <p class="ink2">Earliest you could retire</p>
            <template v-if="result.earliestAge !== null">
              <p class="hero-num num">{{ result.earliestAge }}</p>
              <p class="muted small">
                in {{ yearAt(result.earliestAge) }}<template v-if="result.earliestAge === engine.currentAge"> (you already could)</template>
                <template v-if="versusReal"> · <span class="ink2">{{ versusReal }}</span></template>
              </p>
            </template>
            <template v-else>
              <p class="hero-num num">—</p>
              <p class="muted small">Not with money lasting to {{ engine.planToAge }}. Try saving more or spending less.</p>
            </template>
          </div>
          <dl class="kpis">
            <div>
              <dt>Invested at {{ target.retireAge }}</dt>
              <dd class="num">{{ money(target.atRetirement) }}</dd>
              <dd class="sub muted">needs about {{ money(result.neededAtTarget) }}</dd>
            </div>
            <div>
              <dt>Retiring at {{ target.retireAge }}</dt>
              <dd :class="target.runsOutAt ? 'neg' : 'pos'">{{ target.runsOutAt ? `Runs out at ${target.runsOutAt}` : `Lasts past ${engine.planToAge}` }}</dd>
              <dd class="sub muted">{{ shortfall > 0 ? `${money(shortfall)} short` : 'on track' }}</dd>
            </div>
            <div>
              <dt>Saving a year</dt>
              <dd class="num">{{ money(engine.yearlySaving) }}</dd>
              <dd class="sub muted">{{ scenario.inputs.value.salary ? `${pct(engine.yearlySaving / scenario.inputs.value.salary)} of gross pay` : '' }}</dd>
            </div>
          </dl>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Invested over time</h2>
            <p class="muted">Today’s dollars · {{ pct(result.realReturn) }} return after inflation</p>
          </div>
          <BaseChart :build="chart" height="260px" :label="`Projected invested balance by age, retiring at ${target.retireAge}`" />
          <div class="legend">
            <span><i class="swatch line" :style="{ background: 'var(--nw-investments)' }"></i>{{ changed ? 'With your changes' : 'Invested' }}</span>
            <span v-if="changed"><i class="swatch line dashed"></i>Your real numbers</span>
            <span><i class="swatch dot-swatch"></i>Retire at {{ target.retireAge }}</span>
          </div>
        </section>

        <details class="panel assumptions">
          <summary>How this is worked out</summary>
          <ul>
            <li>Everything is in today’s dollars: growth uses the return minus inflation, and saving grows with raises above inflation.</li>
            <li>Until you retire, each year’s saving is added and the balance earns the return. After, saving stops and spending comes out, less Social Security once it starts.</li>
            <li>“Earliest” is the first age where retiring keeps the money from running out before {{ engine.planToAge }}.</li>
            <li>Only invested money counts (Net worth’s Investments group). Cash, home equity and other assets aren’t drawn on.</li>
            <li>Taxes in retirement aren’t modelled: spending is what you’d take out. Market ups and downs aren’t either; it’s a steady average.</li>
          </ul>
        </details>
      </div>

      <div class="inputs">
        <section v-for="group in GROUPS" :key="group.title" class="panel sim-panel">
          <h2>{{ group.title }}</h2>
          <div class="grid">
            <SimField
              v-for="spec in group.fields"
              :key="spec.key"
              :label="spec.label"
              :changed="scenario.changed(spec.key)"
              :real-text="realText(spec)"
              :source="spec.source?.()"
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
  .results {
    position: sticky;
    top: 24px;
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
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
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
.swatch.dashed {
  background: repeating-linear-gradient(90deg, var(--muted) 0 5px, transparent 5px 9px);
}
.dot-swatch {
  border-radius: 50%;
  background: var(--nw-investments);
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
</style>
