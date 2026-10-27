<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import BaseChart from '../components/BaseChart.vue'
import { ui, categoryRank, categoryColor } from '../store/ui'
import { monthTotals, avgNonZero, yearGrid, yearsAvailable, categoriesOf, findCategory } from '../store/finance'
import { planned, normName as norm, sameName } from '../store/plan'
import { money, signedMoney, pct, MONTHS } from '../lib/format'
import { series, otherColor, ROLE, categorySeries, CATEGORY_COLOR_COUNT } from '../lib/chart-colors'
import { isDark } from '../lib/theme-mode'
import type { ChartBuilder } from '../lib/chart-types'
import type { EntryType } from '../types'

const years = computed(() => yearsAvailable().map((y) => ({ label: String(y), value: y })))
const rows = computed(() => monthTotals(ui.year))
const active = computed(() => rows.value.filter((r) => r.income || r.expense))

const stats = computed(() => {
  const r = rows.value
  const income = r.reduce((a, x) => a + x.income, 0)
  const expense = r.reduce((a, x) => a + x.expense, 0)
  return {
    avgIncome: avgNonZero(r.map((x) => x.income)),
    avgExpense: avgNonZero(r.map((x) => x.expense)),
    avgDiscretionary: avgNonZero(r.map((x) => x.discretionary)),
    avgNet: avgNonZero(r.filter((x) => x.income).map((x) => x.net)),
    income,
    expense,
    net: income - expense,
    rate: income ? (income - expense) / income : null,
    months: active.value.length
  }
})

/* ---- planned amounts from the financial profile ---- */
const planTakeHome = computed(() => planned.value.monthly.takeHome)
/** Planned monthly amount for one category, when the financial profile has one (wages, rent, bills, loans). */
function planFor(type: EntryType, name: string): number {
  const n = planned.value
  if (type === 'income') return norm(name).includes('wage') ? n.monthly.takeHome : 0
  const subs = [name, ...(findCategory('expense', name)?.subcategories ?? [])].map(norm)
  const housing = n.housing.filter((h) => subs.some((s) => sameName(s, norm(h.name)))).reduce((a, h) => a + h.mine, 0)
  const loans = n.loans.filter((l) => l.balance > 0 && subs.some((s) => sameName(s, norm(l.loan.name)))).reduce((a, l) => a + l.payment, 0)
  return housing + loans
}

/* ---- stacked spending by category ---- */
const stacked = computed<ChartBuilder>(() => {
  const grid = yearGrid('expense', ui.year)
  const top = categoryRank.value.slice(0, CATEGORY_COLOR_COUNT)
  const rest = Object.keys(grid).filter((n) => !top.includes(n))
  return (dark, c) => ({
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        ...top.map((name, i) => ({
          label: name,
          data: grid[name]?.months || Array(12).fill(0),
          backgroundColor: categorySeries(i, dark),
          borderColor: c.surface,
          borderWidth: { top: 2 },
          borderSkipped: 'start' as const
        })),
        ...(planTakeHome.value > 0
          ? [
              {
                type: 'line' as const,
                label: 'Take-home pay',
                data: MONTHS.map(() => planTakeHome.value),
                borderColor: c.ink,
                borderDash: [5, 4],
                borderWidth: 1.5,
                pointRadius: 0,
                stack: 'plan'
              }
            ]
          : []),
        {
          label: top.includes('Other') ? 'Everything else' : 'Other',
          data: MONTHS.map((_, m) => rest.reduce((a, n) => a + grid[n].months[m], 0)),
          backgroundColor: otherColor(dark),
          borderColor: c.surface,
          borderWidth: { top: 2 },
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start' as const
        }
      ]
    },
    options: {
      scales: { x: { stacked: true }, y: { stacked: true } },
      datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9 } },
      plugins: { tooltip: { filter: (item) => item.parsed.y > 0, itemSort: (a, b) => b.parsed.y - a.parsed.y } }
    }
  })
})
const stackedLegend = computed(() => {
  const topCategories = categoryRank.value.slice(0, CATEGORY_COLOR_COUNT)
  return [
    ...topCategories.map((name, rankIndex) => ({ name, rankIndex })),
    { name: topCategories.includes('Other') ? 'Everything else' : 'Other', rankIndex: -1 }
  ]
})
const otherNames = computed(() => categoryRank.value.slice(CATEGORY_COLOR_COUNT).join(', '))

/* ---- one category over time ---- */
const trendType = ref<EntryType>('expense')
const trendCat = ref<string | null>(null)
const trendOptions = computed(() => categoriesOf(trendType.value).map((c) => c.name))
const trendName = computed<string>(() => (trendCat.value && trendOptions.value.includes(trendCat.value) ? trendCat.value : (trendOptions.value[0] ?? '')))
const trend = computed(() => {
  const grid = yearGrid(trendType.value, ui.year)
  const name = trendName.value
  const data = grid[name]?.months || Array(12).fill(0)
  const average = avgNonZero(data)
  const color = trendType.value === 'expense' ? null : ROLE.income
  const plan = planFor(trendType.value, name)
  return {
    average,
    plan,
    total: data.reduce((a, b) => a + b, 0),
    build: ((dark, c) => ({
      type: 'bar',
      data: {
        labels: MONTHS,
        datasets: [
          {
            type: 'line',
            label: 'Monthly average',
            data: MONTHS.map(() => average),
            borderColor: c.ink2,
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            order: 0
          },
          ...(plan > 0
            ? [
                {
                  type: 'line' as const,
                  label: 'Planned',
                  data: MONTHS.map(() => plan),
                  borderColor: c.ink,
                  borderWidth: 1.5,
                  pointRadius: 0,
                  order: 0
                }
              ]
            : []),
          {
            label: name,
            data,
            backgroundColor: color === null ? categoryColor(name, dark) : series(color, dark),
            borderRadius: 4,
            borderSkipped: 'start',
            categoryPercentage: 0.7,
            barPercentage: 0.9,
            order: 1
          }
        ]
      }
    })) satisfies ChartBuilder
  }
})

/* ---- sheet-style year grid ---- */
const gridType = ref<EntryType>('expense')
const expanded = reactive<Record<string, boolean>>({})
const grid = computed(() => {
  const g = yearGrid(gridType.value, ui.year)
  const order = categoriesOf(gridType.value).map((c) => c.name)
  const names = Object.keys(g).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const row = (label: string, months: number[]) => ({ label, months, total: months.reduce((a, b) => a + b, 0), avg: avgNonZero(months) })
  const cats = names.map((n) => ({
    ...row(n, g[n].months),
    subs: Object.entries(g[n].subs).map(([s, months]) => row(s, months))
  }))
  const totalMonths = MONTHS.map((_, m) => cats.reduce((a, c) => a + c.months[m], 0))
  return { cats, total: row('Monthly totals', totalMonths) }
})
const cell = (v: number): string => (Math.abs(v) < 0.005 ? '' : money(v))
const allExpanded = computed(() => grid.value.cats.every((c) => expanded[c.label]))
function toggleAll() {
  const to = !allExpanded.value
  grid.value.cats.forEach((c) => (expanded[c.label] = to))
}

/* ---- year over year ---- */
const yoy = computed(() => {
  const ys = yearsAvailable().sort((a, b) => a - b)
  const data = ys.map((y) => {
    const r = monthTotals(y)
    return { y, income: avgNonZero(r.map((x) => x.income)), expense: avgNonZero(r.map((x) => x.expense)) }
  })
  return {
    count: ys.length,
    build: ((dark) => ({
      type: 'bar',
      data: {
        labels: data.map((d) => String(d.y)),
        datasets: [
          { label: 'Avg monthly income', data: data.map((d) => d.income), backgroundColor: series(ROLE.income, dark), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 48 },
          { label: 'Avg monthly expenses', data: data.map((d) => d.expense), backgroundColor: series(ROLE.expense, dark), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 48 }
        ]
      }
    })) satisfies ChartBuilder
  }
})
</script>

<template>
  <div class="stack">
    <header class="page-head">
      <div>
        <h1>Trends</h1>
        <p class="muted">Monthly and yearly averages. Averages skip months with nothing entered, like the sheet does.</p>
      </div>
      <Select v-model="ui.year" :options="years" option-label="label" option-value="value" aria-label="Year" />
    </header>

    <section class="panel">
      <dl class="tiles">
        <div>
          <dt>Avg monthly income</dt>
          <dd class="num">{{ money(stats.avgIncome) }}</dd>
        </div>
        <div>
          <dt>Avg monthly expenses</dt>
          <dd class="num">{{ money(stats.avgExpense) }}</dd>
        </div>
        <div>
          <dt>Avg discretionary</dt>
          <dd class="num">{{ money(stats.avgDiscretionary) }}</dd>
        </div>
        <div>
          <dt>Avg monthly net</dt>
          <dd class="num" :class="stats.avgNet >= 0 ? 'pos' : 'neg'">{{ signedMoney(stats.avgNet) }}</dd>
        </div>
        <div>
          <dt>{{ ui.year }} net so far</dt>
          <dd class="num" :class="stats.net >= 0 ? 'pos' : 'neg'">{{ signedMoney(stats.net) }}</dd>
          <dd class="sub muted">{{ money(stats.income) }} in, {{ money(stats.expense) }} out</dd>
        </div>
        <div>
          <dt>Savings rate</dt>
          <dd class="num">{{ pct(stats.rate) }}</dd>
          <dd class="sub muted">over {{ stats.months }} months</dd>
        </div>
      </dl>
    </section>

    <div class="grid-2">
      <section class="panel span-2">
        <div class="panel-head">
          <div>
            <h2>Spending by category, {{ ui.year }}</h2>
            <p class="muted">Your five biggest categories; the rest are grouped as Other</p>
          </div>
        </div>
        <div class="legend legend-top">
          <span v-for="legendItem in stackedLegend" :key="legendItem.name" :title="legendItem.rankIndex < 0 ? otherNames : ''">
            <i class="swatch" :style="{ background: legendItem.rankIndex < 0 ? otherColor(isDark) : categorySeries(legendItem.rankIndex, isDark) }"></i>{{ legendItem.name }}
          </span>
          <span v-if="planTakeHome > 0"><i class="swatch line" style="background: var(--ink)"></i>Take-home pay</span>
        </div>
        <BaseChart :build="stacked" height="280px" :label="`Monthly spending by category for ${ui.year}`" />
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>One category over time</h2>
            <p class="muted num">{{ money(trend.total) }} this year · {{ money(trend.average) }} a month on average</p>
          </div>
        </div>
        <div class="trend-controls">
          <SelectButton
            v-model="trendType"
            :options="[
              { label: 'Expense', value: 'expense' },
              { label: 'Income', value: 'income' }
            ]"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            aria-label="Category type"
          />
          <Select :model-value="trendName" :options="trendOptions" aria-label="Category" size="small" class="trend-select" @update:model-value="trendCat = $event" />
        </div>
        <BaseChart :build="trend.build" height="220px" :label="`${trendName} by month`" />
        <div class="legend">
          <span><i class="swatch" :style="{ background: trendType === 'expense' ? categoryColor(trendName, isDark) : 'var(--series-income)' }"></i>{{ trendName }}</span>
          <span><i class="swatch line" style="background: var(--ink-2)"></i>Monthly average</span>
          <span v-if="trend.plan > 0"><i class="swatch line" style="background: var(--ink)"></i>Planned {{ money(trend.plan) }} (your profile)</span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Year over year</h2>
            <p class="muted">Average month in each year you have data for</p>
          </div>
        </div>
        <BaseChart :build="yoy.build" height="220px" label="Average monthly income and expenses by year" />
        <div class="legend">
          <span><i class="swatch" style="background: var(--series-income)"></i>Avg monthly income</span>
          <span><i class="swatch" style="background: var(--series-expense)"></i>Avg monthly expenses</span>
        </div>
        <p v-if="yoy.count < 2" class="hint muted">Only {{ ui.year }} is loaded. Import your Cash Flow ’22 to ’25 workbooks from your profile’s Import &amp; export tab to compare years.</p>
      </section>

      <section class="panel span-2">
        <div class="panel-head">
          <div>
            <h2>{{ gridType === 'expense' ? 'Expenses' : 'Income' }} by month, {{ ui.year }}</h2>
            <p class="muted">Same layout as the sheet’s {{ gridType === 'expense' ? 'Expenses' : 'Income' }} tab. Tap a category to see its subcategories.</p>
          </div>
          <div class="grid-controls">
            <SelectButton
              v-model="gridType"
              :options="[
                { label: 'Expenses', value: 'expense' },
                { label: 'Income', value: 'income' }
              ]"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              size="small"
              aria-label="Grid type"
            />
            <button type="button" class="link" @click="toggleAll">{{ allExpanded ? 'Collapse all' : 'Expand all' }}</button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="sheet">
            <thead>
              <tr>
                <th scope="col" class="sticky">Category</th>
                <th v-for="mn in MONTHS" :key="mn" scope="col">{{ mn }}</th>
                <th scope="col">Total</th>
                <th scope="col">Average</th>
              </tr>
            </thead>
            <tbody v-for="c in grid.cats" :key="c.label">
              <tr class="cat-row" @click="expanded[c.label] = !expanded[c.label]">
                <th scope="row" class="sticky">
                  <i class="pi" :class="expanded[c.label] ? 'pi-chevron-down' : 'pi-chevron-right'" aria-hidden="true"></i>
                  {{ c.label }}
                </th>
                <td v-for="(v, i) in c.months" :key="i" class="num">{{ cell(v) }}</td>
                <td class="num strong">{{ money(c.total) }}</td>
                <td class="num strong">{{ money(c.avg) }}</td>
              </tr>
              <template v-if="expanded[c.label]">
                <tr v-for="s in c.subs" :key="s.label" class="sub-row">
                  <th scope="row" class="sticky">{{ s.label }}</th>
                  <td v-for="(v, i) in s.months" :key="i" class="num">{{ cell(v) }}</td>
                  <td class="num">{{ money(s.total) }}</td>
                  <td class="num">{{ money(s.avg) }}</td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" class="sticky">Monthly totals</th>
                <td v-for="(v, i) in grid.total.months" :key="i" class="num">{{ cell(v) }}</td>
                <td class="num">{{ money(grid.total.total) }}</td>
                <td class="num">{{ money(grid.total.avg) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.page-head p {
  max-width: 60ch;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
}
@media (min-width: 720px) {
  .tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1100px) {
  .tiles {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
.tiles dt {
  font-size: 0.8125rem;
  color: var(--ink-2);
}
.tiles dd {
  margin: 2px 0 0;
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.tiles dd.sub {
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0;
}
.legend-top {
  margin-bottom: 10px;
}
.trend-controls,
.grid-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.trend-select {
  min-width: 0;
  flex: 1;
  max-width: 240px;
}
.legend {
  margin-top: 8px;
}
.hint {
  font-size: 0.8125rem;
  margin-top: 10px;
}
.link {
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--accent);
  cursor: pointer;
}
.sheet {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 0.8125rem;
  white-space: nowrap;
}
.sheet th,
.sheet td {
  padding: 7px 10px;
  text-align: right;
  border-bottom: 1px solid var(--line);
}
.sheet thead th {
  font-weight: 500;
  color: var(--muted);
  font-size: 0.75rem;
}
.sheet .sticky {
  position: sticky;
  left: 0;
  text-align: left;
  background: var(--panel);
  z-index: 1;
  min-width: 150px;
}
.cat-row {
  cursor: pointer;
}
.cat-row th {
  font-weight: 600;
}
.cat-row .pi {
  font-size: 0.65rem;
  color: var(--muted);
  margin-right: 4px;
}
.cat-row:hover th,
.cat-row:hover td {
  background: var(--accent-soft);
}
.cat-row:hover .sticky {
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
}
.sub-row th {
  font-weight: 400;
  padding-left: 28px;
  color: var(--ink-2);
}
.sub-row td {
  color: var(--ink-2);
}
.strong {
  font-weight: 600;
}
.sheet tfoot th,
.sheet tfoot td {
  font-weight: 600;
  border-bottom: 0;
  border-top: 2px solid var(--line);
}
</style>
