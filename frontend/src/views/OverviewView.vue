<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Popover from 'primevue/popover'
import Menu from 'primevue/menu'
import BaseChart from '../components/BaseChart.vue'
import { ui, openEntry, categoryColor, categoryRank } from '../store/ui'
import { state, monthTotals, avgNonZero, categoryTotals, netWorthSeries, yearsAvailable, findCategory } from '../store/finance'
import { money, money2, moneyCompact, signedMoney, pct, MONTHS, MONTHS_LONG, shortDate, dayLabel as day } from '../lib/format'
import { series, otherColor, ROLE } from '../lib/chart-colors'
import { isDark } from '../lib/theme-mode'
import { useWidgetOrder } from '../lib/widget-order'
import { useExport } from '../lib/use-export'
import { planned } from '../store/plan'
import type { ChartBuilder } from '../lib/chart-types'
import type { Entry } from '../types'

const emit = defineEmits<{ navigate: [view: string] }>()

/* ---------- period: one month, or the whole year ---------- */
type Mode = 'month' | 'year'
const mode = ref<Mode>('month')
const MODES = [
  { label: 'Monthly', value: 'month' },
  { label: 'Yearly', value: 'year' }
]
const years = computed(() => {
  const ys = yearsAvailable()
  if (!ys.includes(ui.year)) ys.unshift(ui.year)
  return ys.map((y) => ({ label: String(y), value: y }))
})
const periodLabel = computed(() => (mode.value === 'month' ? `${MONTHS_LONG[ui.month]} ${ui.year}` : `${ui.year}`))
const periodPicker = ref<InstanceType<typeof Popover> | null>(null)
function pickMonth(i: number): void {
  ui.month = i
  periodPicker.value?.hide()
}
const prefix = computed(() => (mode.value === 'month' ? `${ui.year}-${String(ui.month + 1).padStart(2, '0')}` : String(ui.year)))
const inPeriod = (e: Entry) => e.date.startsWith(prefix.value)

/* ---------- KPIs ---------- */
const year = computed(() => monthTotals(ui.year))
const lastYear = computed(() => monthTotals(ui.year - 1))
const sum = (rows: { income: number; expense: number }[]) => rows.reduce((a, r) => ({ income: a.income + r.income, expense: a.expense + r.expense }), { income: 0, expense: 0 })

const current = computed(() => {
  if (mode.value === 'month') return year.value[ui.month]
  const t = sum(year.value)
  return { ...t, net: t.income - t.expense, count: year.value.reduce((a, r) => a + r.count, 0), savingsRate: t.income ? (t.income - t.expense) / t.income : null }
})

// Month mode compares against this year's monthly average (zero months skipped, like the sheet).
// Year mode compares against the same months of last year, so a partial year is fair.
const baseline = computed(() => {
  if (mode.value === 'month') {
    const ys = year.value
    return {
      income: avgNonZero(ys.map((r) => r.income)),
      expense: avgNonZero(ys.map((r) => r.expense)),
      net: avgNonZero(ys.filter((r) => r.income).map((r) => r.net)),
      label: 'vs monthly average'
    }
  }
  const months = year.value.map((r, i) => (r.count ? i : -1)).filter((i) => i >= 0)
  const prior = sum(lastYear.value.filter((_, i) => months.includes(i)))
  if (!prior.income && !prior.expense) return null
  return { ...prior, net: prior.income - prior.expense, label: `vs same months of ${ui.year - 1}` }
})

interface Badge {
  text: string
  tone: 'good' | 'bad' | 'flat'
}
function change(cur: number, base: number | undefined, upIsGood = true): Badge | null {
  if (!base) return null
  const d = (cur - base) / Math.abs(base)
  if (!isFinite(d)) return null
  const tone = Math.abs(d) < 0.005 ? 'flat' : d > 0 === upIsGood ? 'good' : 'bad'
  return { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${pct(Math.abs(d))}`, tone }
}

const nw = computed(() => netWorthSeries())
const nwLast = computed(() => nw.value.at(-1))
const nwPrev = computed(() => nw.value.at(-2))

interface Kpi {
  id: string
  label: string
  icon: string
  value: string
  tone?: string
  badge: Badge | null
  note: string
  hint?: string
  link?: string
}
const kpis = computed<Kpi[]>(() => {
  const c = current.value
  const b = baseline.value
  const basis = mode.value === 'month' ? 'avg' : String(ui.year - 1)
  return [
    {
      id: 'net',
      label: 'Net cash flow',
      icon: 'pi pi-arrow-right-arrow-left',
      value: c.count ? signedMoney(c.net) : '—',
      tone: c.net >= 0 ? 'pos' : 'neg',
      badge: c.count && b ? { text: signedMoney(c.net - b.net), tone: c.net >= b.net ? 'good' : 'bad' } : null,
      note: c.count ? `savings rate ${pct(c.savingsRate)}` : 'no entries yet',
      hint: b?.label
    },
    {
      id: 'income',
      label: 'Income',
      icon: 'pi pi-arrow-down-left',
      value: money(c.income),
      badge: c.count ? change(c.income, b?.income) : null,
      note: b ? `${basis} ${money(b.income)}` : '',
      hint: b?.label
    },
    {
      id: 'expense',
      label: 'Expenses',
      icon: 'pi pi-arrow-up-right',
      value: money(c.expense),
      badge: c.count ? change(c.expense, b?.expense, false) : null,
      note: b ? `${basis} ${money(b.expense)}` : '',
      hint: b?.label
    },
    {
      id: 'networth',
      label: 'Net worth',
      icon: 'pi pi-wallet',
      value: nwLast.value ? moneyCompact(nwLast.value.total) : '—',
      badge: nwLast.value && nwPrev.value ? change(nwLast.value.total, nwPrev.value.total) : null,
      note: nwLast.value ? `as of ${shortDate(nwLast.value.date)}` : 'no snapshots yet',
      hint: 'vs prior month',
      link: 'networth'
    }
  ]
})

/* ---------- main chart ---------- */
const chartKind = ref<'flow' | 'spend'>('flow')
const CHARTS = [
  { label: 'Income vs expenses', value: 'flow' },
  { label: 'Spending by category', value: 'spend' }
]

function openMonth(i: number): void {
  ui.month = i
  mode.value = 'month'
}

const flowChart = computed<ChartBuilder>(() => {
  const rows = year.value
  const sel = mode.value === 'month' ? ui.month : -1
  return (dark, c) => ({
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        {
          type: 'line',
          label: 'Net',
          data: rows.map((r) => (r.count ? r.net : null)),
          borderColor: c.ink,
          backgroundColor: c.ink,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.25,
          order: 0
        },
        ...(['income', 'expense'] as const).map((k) => ({
          label: k === 'income' ? 'Income' : 'Expenses',
          data: rows.map((r) => r[k]),
          // The selected month stays full strength; the rest step back a little.
          backgroundColor: rows.map((_, i) => series(ROLE[k], dark) + (sel < 0 || i === sel ? '' : '99')),
          borderRadius: 6,
          borderSkipped: 'start' as const,
          categoryPercentage: 0.7,
          barPercentage: 0.9,
          order: 1
        }))
      ]
    },
    options: {
      onClick: (_, els) => {
        if (els.length) openMonth(els[0].index)
      }
    }
  })
})

const topCats = computed(() => categoryRank.value.slice(0, 6))
const CATCH_ALL_KEY = '\u0000rest'
const catchAllLabel = computed(() => (topCats.value.includes('Other') ? 'Everything else' : 'Other'))
const spendChart = computed<ChartBuilder>(() => {
  const yr = String(ui.year)
  const top = topCats.value
  const grid: Record<string, number[]> = {}
  for (const e of state.entries) {
    if (e.type !== 'expense' || !e.date.startsWith(yr)) continue
    // The catch-all gets its own key so a real category called "Other" isn't merged into it.
    const bucketKey = top.includes(e.category) ? e.category : CATCH_ALL_KEY
    ;(grid[bucketKey] ??= Array<number>(12).fill(0))[+e.date.slice(5, 7) - 1] += e.amount
  }
  const names = [...top.filter((n) => grid[n]), ...(grid[CATCH_ALL_KEY] ? [CATCH_ALL_KEY] : [])]
  return (dark, c) => ({
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: names.map((n) => ({
        label: n === CATCH_ALL_KEY ? catchAllLabel.value : n,
        data: grid[n],
        backgroundColor: n === CATCH_ALL_KEY ? otherColor(dark) : categoryColor(n, dark),
        borderColor: c.surface,
        borderWidth: { top: 1 },
        borderSkipped: false as const,
        categoryPercentage: 0.7,
        barPercentage: 0.9
      }))
    },
    options: {
      scales: { x: { stacked: true }, y: { stacked: true } },
      interaction: { mode: 'index', intersect: false },
      onClick: (_, els) => {
        if (els.length) openMonth(els[0].index)
      }
    }
  })
})
const spendLegend = computed(() => [
  ...topCats.value.map((n) => ({ name: n, color: categoryColor(n, isDark.value) })),
  { name: catchAllLabel.value, color: otherColor(isDark.value) }
])

/* ---------- recent activity ---------- */
const periodEntries = computed(() => state.entries.filter(inPeriod).sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount))
const ACTIVITY_ROWS = 6

/* ---------- spending mix ---------- */
const catAvg = computed(() => {
  const out: Record<string, number> = {}
  const totals: Record<string, number[]> = {}
  for (const e of state.entries) {
    if (e.type !== 'expense' || !e.date.startsWith(String(ui.year))) continue
    ;(totals[e.category] ??= Array<number>(12).fill(0))[+e.date.slice(5, 7) - 1] += e.amount
  }
  for (const [k, arr] of Object.entries(totals)) out[k] = avgNonZero(arr)
  return out
})
const spend = computed(() =>
  Object.entries(categoryTotals('expense', inPeriod))
    .map(([name, v]) => ({ name, total: v.total, essential: !!findCategory('expense', name)?.essential }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((c) => {
      const avg = mode.value === 'month' ? catAvg.value[c.name] || 0 : 0
      return { ...c, avg, delta: avg ? c.total - avg : null }
    })
)
const spendTotal = computed(() => spend.value.reduce((a, c) => a + c.total, 0))
const MIX_TOP = 4
const mix = computed(() => {
  const top = spend.value.slice(0, MIX_TOP).map((c) => ({ name: c.name, total: c.total, color: categoryColor(c.name, isDark.value) }))
  const rest = spend.value.slice(MIX_TOP).reduce((a, c) => a + c.total, 0)
  return rest > 0 ? [...top, { name: `Other (${spend.value.length - MIX_TOP})`, total: rest, color: otherColor(isDark.value) }] : top
})
const essentials = computed(() => spend.value.filter((c) => c.essential).reduce((a, c) => a + c.total, 0))

/* ---------- plan check: this period against your profile ---------- */
// Year mode scales the monthly plan by the months that have entries, so a partial year compares fairly.
const planMonths = computed(() => (mode.value === 'month' ? 1 : year.value.filter((r) => r.count).length))
const planRows = computed(() => {
  const n = planned.value.monthly
  const k = planMonths.value
  const c = current.value
  const budget = Math.max(0, n.afterHousing) * k
  return [
    { id: 'income', label: 'Income', note: 'vs planned take-home', actual: c.income, plan: n.takeHome * k, upIsGood: true },
    { id: 'housing', label: 'Rent and utilities', note: 'vs your share', actual: essentials.value, plan: (n.housingMine + n.loanPayments) * k, upIsGood: false },
    { id: 'other', label: 'Everything else', note: 'vs what’s left after housing', actual: spendTotal.value - essentials.value, plan: budget, upIsGood: false }
  ]
    .filter((r) => r.plan > 0)
    .map((r) => {
      const ratio = r.plan ? r.actual / r.plan : 0
      const good = r.upIsGood ? r.actual >= r.plan : r.actual <= r.plan
      return { ...r, ratio, good, diff: r.actual - r.plan }
    })
})
const hasPlan = computed(() => planned.value.monthly.takeHome > 0 || planned.value.monthly.housingMine > 0)
const showAllCats = ref(false)
const mixMenu = ref<InstanceType<typeof Menu> | null>(null)
const mixItems = [
  { label: 'See entries', icon: 'pi pi-list', command: () => emit('navigate', 'cashflow') },
  { label: 'Category trends', icon: 'pi pi-chart-bar', command: () => emit('navigate', 'trends') }
]

/* ---------- page menus ---------- */
const { exporting, doExport } = useExport()
const exportMenu = ref<InstanceType<typeof Menu> | null>(null)
const exportItems = [
  { label: 'Excel workbook', icon: 'pi pi-file-excel', command: () => doExport('xlsx') },
  { label: 'Entries (CSV)', icon: 'pi pi-file', command: () => doExport('csv') },
  { label: 'Net worth (CSV)', icon: 'pi pi-file', command: () => doExport('nw') }
]

const WIDGETS = ['chart', 'activity', 'mix', 'plan']
const WIDGET_NAMES: Record<string, string> = { chart: 'chart', activity: 'Recent activity', mix: 'Spending mix', plan: 'Plan check' }
const layout = useWidgetOrder('financial-tracker.overview-order.v2', WIDGETS)
const customOrder = computed(() => layout.order.value.join() !== WIDGETS.join())
const widget = (id: string) => ({
  'data-widget': id,
  class: { dragging: layout.dragging.value === id },
  style: { order: layout.pos(id) }
})
const pageMenu = ref<InstanceType<typeof Menu> | null>(null)
const pageItems = computed(() => [
  { label: 'Import or manage data', icon: 'pi pi-sliders-h', command: () => emit('navigate', 'plan/files') },
  { separator: true },
  { label: 'Reset layout', icon: 'pi pi-undo', disabled: !customOrder.value, command: () => layout.reset() }
])
</script>

<template>
  <div class="stack">
    <!-- Toolbar: period on the left, actions on the right -->
    <header class="toolbar">
      <h1 class="page-title">Overview</h1>
      <div class="period-controls">
        <SelectButton v-model="mode" :options="MODES" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Period" />
        <button type="button" class="period" aria-haspopup="dialog" @click="periodPicker?.toggle($event)">
          <i class="pi pi-calendar" aria-hidden="true"></i>
          <span>{{ periodLabel }}</span>
          <i class="pi pi-chevron-down caret" aria-hidden="true"></i>
        </button>
      </div>
      <div class="toolbar-end">
        <Button
          :label="exporting ? 'Exporting' : 'Download'"
          :icon="exporting ? 'pi pi-spin pi-spinner' : 'pi pi-download'"
          icon-pos="right"
          size="small"
          aria-haspopup="true"
          @click="exportMenu?.toggle($event)"
        />
        <Button icon="pi pi-ellipsis-h" text rounded size="small" aria-label="More" aria-haspopup="true" @click="pageMenu?.toggle($event)" />
      </div>
      <Menu ref="exportMenu" :model="exportItems" popup />
      <Menu ref="pageMenu" :model="pageItems" popup />
    </header>

    <Popover ref="periodPicker">
      <div class="picker">
        <Select v-model="ui.year" :options="years" option-label="label" option-value="value" size="small" aria-label="Year" class="picker-year" />
        <div v-if="mode === 'month'" class="picker-months" role="group" aria-label="Month">
          <button
            v-for="(r, i) in year"
            :key="i"
            type="button"
            class="pm"
            :class="{ empty: !r.count }"
            :aria-pressed="ui.month === i"
            @click="pickMonth(i)"
          >
            <span>{{ MONTHS[i] }}</span>
            <small class="num" :class="r.count ? (r.net >= 0 ? 'pos' : 'neg') : 'muted'">{{ r.count ? signedMoney(r.net) : '—' }}</small>
          </button>
        </div>
      </div>
    </Popover>

    <!-- KPI row -->
    <section class="kpis" aria-label="Key figures">
      <component
        :is="k.link ? 'button' : 'div'"
        v-for="k in kpis"
        :key="k.id"
        :type="k.link ? 'button' : undefined"
        class="panel kpi"
        :class="{ link: k.link }"
        @click="k.link && emit('navigate', k.link)"
      >
        <div class="kpi-top">
          <span class="kpi-label">{{ k.label }}</span>
          <span class="kpi-icon" aria-hidden="true"><i :class="k.icon"></i></span>
        </div>
        <span class="kpi-value num" :class="k.tone">{{ k.value }}</span>
        <div class="kpi-foot">
          <span class="kpi-note muted">{{ k.note }}</span>
          <span v-if="k.badge" class="badge num" :class="k.badge.tone" :title="k.hint">{{ k.badge.text }}</span>
        </div>
      </component>
    </section>

    <div class="widgets" :class="{ 'is-dragging': layout.dragging.value }">
      <!-- Main chart -->
      <section class="panel span-2" aria-labelledby="chart-title" v-bind="widget('chart')">
        <button
          type="button"
          class="grip"
          :aria-label="`Move ${WIDGET_NAMES.chart}. Drag, or use the arrow keys`"
          title="Drag to move"
          @pointerdown="layout.onHandleDown('chart', $event)"
          @keydown="layout.onHandleKey('chart', $event)"
        >
          <span aria-hidden="true"></span>
        </button>
        <div class="panel-head">
          <div class="chart-title">
            <h2 id="chart-title" class="sr-only">{{ CHARTS.find((c) => c.value === chartKind)?.label }}, {{ ui.year }}</h2>
            <Select v-model="chartKind" :options="CHARTS" option-label="label" option-value="value" size="small" aria-label="Chart" />
            <span class="muted small">{{ ui.year }} · tap a month to open it</span>
          </div>
          <div v-if="chartKind === 'flow'" class="legend">
            <span><i class="swatch" style="background: var(--series-income)"></i>Income</span>
            <span><i class="swatch" style="background: var(--series-expense)"></i>Expenses</span>
            <span><i class="swatch line" style="background: var(--ink)"></i>Net</span>
          </div>
          <div v-else class="legend">
            <span v-for="l in spendLegend" :key="l.name"><i class="swatch" :style="{ background: l.color }"></i>{{ l.name }}</span>
          </div>
        </div>
        <BaseChart v-if="chartKind === 'flow'" :build="flowChart" height="280px" :label="`Monthly income and expenses for ${ui.year}`" />
        <BaseChart v-else :build="spendChart" height="280px" :label="`Monthly spending by category for ${ui.year}`" />
      </section>

      <!-- Recent activity -->
      <section class="panel activity" aria-labelledby="activity-title" v-bind="widget('activity')">
        <button
          type="button"
          class="grip"
          :aria-label="`Move ${WIDGET_NAMES.activity}. Drag, or use the arrow keys`"
          title="Drag to move"
          @pointerdown="layout.onHandleDown('activity', $event)"
          @keydown="layout.onHandleKey('activity', $event)"
        >
          <span aria-hidden="true"></span>
        </button>
        <div class="panel-head">
          <h2 id="activity-title">Recent activity</h2>
          <div class="head-end">
            <span class="pill num">{{ periodEntries.length }} entries</span>
            <Button label="All entries" text size="small" @click="emit('navigate', 'cashflow')" />
          </div>
        </div>
        <table v-if="periodEntries.length" class="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col" class="col-cat">Category</th>
              <th scope="col" class="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in periodEntries.slice(0, ACTIVITY_ROWS)" :key="e.id" tabindex="0" @click="openEntry(e)" @keydown.enter="openEntry(e)">
              <td class="muted nowrap">{{ day(e.date) }}</td>
              <td class="desc">
                <span>{{ e.description || e.subcategory }}</span>
                <small class="muted sub-cat">{{ e.category }}</small>
              </td>
              <td class="col-cat">
                <span class="tag"><i class="dot" :style="{ background: e.type === 'income' ? 'var(--series-income)' : categoryColor(e.category, isDark) }"></i>{{ e.category }}</span>
              </td>
              <td class="r num nowrap" :class="{ pos: e.type === 'income' }">{{ e.type === 'income' ? '+' : '' }}{{ money2(e.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">Nothing recorded for {{ periodLabel }}.</p>
        <Button
          v-if="periodEntries.length > ACTIVITY_ROWS"
          class="view-all"
          :label="`View all ${periodEntries.length}`"
          icon="pi pi-arrow-right"
          icon-pos="right"
          outlined
          size="small"
          @click="emit('navigate', 'cashflow')"
        />
      </section>

      <!-- Spending mix -->
      <section class="panel mix" aria-labelledby="mix-title" v-bind="widget('mix')">
        <button
          type="button"
          class="grip"
          :aria-label="`Move ${WIDGET_NAMES.mix}. Drag, or use the arrow keys`"
          title="Drag to move"
          @pointerdown="layout.onHandleDown('mix', $event)"
          @keydown="layout.onHandleKey('mix', $event)"
        >
          <span aria-hidden="true"></span>
        </button>
        <div class="panel-head">
          <h2 id="mix-title">Spending mix</h2>
          <div class="head-end">
            <Button icon="pi pi-ellipsis-h" text rounded size="small" aria-label="Spending options" aria-haspopup="true" @click="mixMenu?.toggle($event)" />
            <Menu ref="mixMenu" :model="mixItems" popup />
          </div>
        </div>
        <template v-if="spend.length">
          <div class="mix-total">
            <span class="mix-num num">{{ money(spendTotal) }}</span>
            <span v-if="kpis[2].badge" class="badge num" :class="kpis[2].badge.tone" :title="kpis[2].hint">{{ kpis[2].badge.text }}</span>
          </div>
          <div class="mix-bar" role="img" :aria-label="mix.map((s) => `${s.name} ${pct(s.total / spendTotal)}`).join(', ')">
            <span v-for="s in mix" :key="s.name" :style="{ flexGrow: s.total, background: s.color }"></span>
          </div>
          <ul class="mix-list">
            <li v-for="s in mix" :key="s.name">
              <i class="dot" :style="{ background: s.color }"></i>
              <span class="cat-name">{{ s.name }} <span class="muted">{{ pct(s.total / spendTotal) }}</span></span>
              <span class="num">{{ money(s.total) }}</span>
            </li>
          </ul>
          <dl class="split">
            <div>
              <dt class="muted">Essentials</dt>
              <dd class="num">{{ money(essentials) }}</dd>
            </div>
            <div>
              <dt class="muted">Discretionary</dt>
              <dd class="num">{{ money(spendTotal - essentials) }}</dd>
            </div>
          </dl>
          <Button
            class="view-all"
            :label="showAllCats ? 'Hide categories' : `All ${spend.length} categories`"
            :icon="showAllCats ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
            icon-pos="right"
            outlined
            size="small"
            :aria-expanded="showAllCats"
            @click="showAllCats = !showAllCats"
          />
          <ul v-if="showAllCats" class="cat-list">
            <li v-for="c in spend" :key="c.name">
              <i class="dot" :style="{ background: categoryColor(c.name, isDark) }"></i>
              <span class="cat-name">{{ c.name }}</span>
              <span class="num">{{ money(c.total) }}</span>
              <span v-if="c.delta !== null" class="delta num" :title="`Monthly average ${money(c.avg)}`">
                <i class="pi" :class="c.delta >= 0 ? 'pi-arrow-up' : 'pi-arrow-down'" aria-hidden="true"></i>
                {{ money(Math.abs(c.delta)) }}
                <span class="sr-only">{{ c.delta >= 0 ? 'above' : 'below' }} average</span>
              </span>
            </li>
          </ul>
        </template>
        <p v-else class="empty">Nothing spent in {{ periodLabel }}.</p>
      </section>

      <!-- Plan check -->
      <section class="panel plan" aria-labelledby="plan-title" v-bind="widget('plan')">
        <button
          type="button"
          class="grip"
          :aria-label="`Move ${WIDGET_NAMES.plan}. Drag, or use the arrow keys`"
          title="Drag to move"
          @pointerdown="layout.onHandleDown('plan', $event)"
          @keydown="layout.onHandleKey('plan', $event)"
        >
          <span aria-hidden="true"></span>
        </button>
        <div class="panel-head">
          <div>
            <h2 id="plan-title">Plan check</h2>
            <p class="muted small">{{ periodLabel }} against your profile{{ mode === 'year' ? ` (${planMonths} months)` : '' }}</p>
          </div>
          <Button label="Edit" text size="small" @click="emit('navigate', 'plan')" />
        </div>
        <ul v-if="hasPlan && current.count" class="plan-list">
          <li v-for="r in planRows" :key="r.id">
            <div class="plan-top">
              <span>{{ r.label }} <small class="muted">{{ r.note }}</small></span>
              <span class="num"><strong>{{ money(r.actual) }}</strong> <span class="muted">/ {{ money(r.plan) }}</span></span>
            </div>
            <div class="meter" role="img" :aria-label="`${pct(r.ratio)} of plan`">
              <span :class="r.good ? 'good' : 'bad'" :style="{ width: `${Math.min(100, r.ratio * 100)}%` }"></span>
            </div>
            <small class="num" :class="r.good ? 'pos' : 'neg'">
              {{ r.diff >= 0 ? `${money(r.diff)} over` : `${money(-r.diff)} under` }}
            </small>
          </li>
        </ul>
        <p v-else-if="!hasPlan" class="empty">Fill in your financial profile to compare each month to your plan.</p>
        <p v-else class="empty">Nothing recorded for {{ periodLabel }}.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ---------- toolbar ---------- */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}
.page-title {
  margin: 0;
  font-size: 1.375rem;
}
.period-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.period {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.period:hover {
  border-color: var(--muted);
}
.period .pi {
  font-size: 0.85rem;
  color: var(--muted);
}
.period .caret {
  font-size: 0.7rem;
}
.toolbar-end {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
/* Phones: title and actions on top, period controls on their own row. */
@media (max-width: 719px) {
  .period-controls {
    order: 1;
    width: 100%;
  }
  .period {
    flex: 1;
    justify-content: center;
  }
}
@media (min-width: 720px) {
  .page-title {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}
.picker {
  display: grid;
  gap: 10px;
  width: 280px;
}
.picker-year {
  width: 100%;
}
.picker-months {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}
.pm {
  display: grid;
  gap: 1px;
  padding: 8px 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.pm small {
  font-size: 0.6875rem;
}
.pm:hover {
  background: var(--panel-2);
}
.pm[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.pm.empty span {
  color: var(--muted);
}

/* ---------- KPI cards ---------- */
.kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (min-width: 1100px) {
  .kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
}
.kpi {
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 14px;
  text-align: left;
  font: inherit;
  color: inherit;
}
.kpi.link {
  cursor: pointer;
}
.kpi.link:hover {
  border-color: var(--muted);
}
.kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.kpi-label {
  font-size: 0.8125rem;
  color: var(--ink-2);
}
.kpi-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--panel-2);
  color: var(--ink-2);
  flex: none;
}
.kpi-icon .pi {
  font-size: 0.85rem;
}
.kpi-value {
  font-size: clamp(1.25rem, 5.4vw, 1.75rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.kpi-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 4px 8px;
  min-height: 22px;
}
.kpi-note {
  font-size: 0.75rem;
}
.badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--panel-2);
  color: var(--ink-2);
}
.badge.good {
  background: var(--good-soft);
  color: var(--good);
}
.badge.bad {
  background: var(--bad-soft);
  color: var(--bad);
}
@media (min-width: 720px) {
  .kpi {
    padding: 18px;
    gap: 8px;
  }
  .kpi-icon {
    width: 38px;
    height: 38px;
  }
}

/* ---------- widget grid ---------- */
.widgets {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 960px) {
  .widgets {
    grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
    align-items: start;
  }
  .widgets > .span-2 {
    grid-column: 1 / -1;
  }
}
.widgets > .panel {
  position: relative;
  transition: box-shadow 0.15s, opacity 0.15s;
}
@media (min-width: 720px) {
  .widgets > .panel {
    padding: 20px;
  }
}
/* Drag pill centred on each widget's top edge. Big hit area for thumbs; touch-action none so
   dragging doesn't scroll the page. */
.grip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 56px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0 0 8px 8px;
  background: none;
  cursor: grab;
  touch-action: none;
  z-index: 1;
}
.grip span {
  width: 28px;
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  transition: background 0.15s;
}
.grip:hover span,
.grip:focus-visible span,
.dragging .grip span {
  background: var(--accent);
}
.grip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.is-dragging,
.is-dragging .grip {
  cursor: grabbing;
  user-select: none;
}
.widgets > .panel.dragging {
  box-shadow: 0 0 0 2px var(--accent);
  opacity: 0.92;
}
.panel-head {
  align-items: center;
}
.head-end {
  display: flex;
  align-items: center;
  gap: 4px;
}
.chart-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}
.small {
  font-size: 0.8125rem;
}
.pill {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--panel-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-2);
}
.view-all {
  width: 100%;
  margin-top: 12px;
}

/* ---------- activity table ---------- */
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.table th {
  text-align: left;
  font-weight: 500;
  font-size: 0.75rem;
  color: var(--muted);
  padding: 6px 8px;
  border-bottom: 1px solid var(--line);
}
.table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
.table tbody tr {
  cursor: pointer;
}
.table tbody tr:hover,
.table tbody tr:focus-visible {
  background: var(--panel-2);
  outline: none;
}
.table tbody tr:last-child td {
  border-bottom: 0;
}
.table .r {
  text-align: right;
}
.nowrap {
  white-space: nowrap;
}
.desc {
  max-width: 0;
  width: 100%;
}
.desc span,
.desc small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--panel-2);
  font-size: 0.75rem;
  white-space: nowrap;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.col-cat {
  display: none;
}
@media (min-width: 640px) {
  .col-cat {
    display: table-cell;
  }
  .sub-cat {
    display: none !important;
  }
}

/* ---------- plan check ---------- */
.plan-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.plan-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 0.875rem;
  margin-bottom: 6px;
}
.plan-top small {
  font-size: 0.75rem;
}
.meter {
  height: 6px;
  border-radius: 3px;
  background: var(--panel-2);
  overflow: hidden;
  margin-bottom: 4px;
}
.meter span {
  display: block;
  height: 100%;
  border-radius: 3px;
}
.meter .good {
  background: var(--good);
}
.meter .bad {
  background: var(--bad);
}
.plan-list small.num {
  font-size: 0.75rem;
}

/* ---------- spending mix ---------- */
.mix-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 4px 0 12px;
}
.mix-num {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.mix-bar {
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 14px;
}
.mix-bar span {
  flex-basis: 0;
  min-width: 3px;
}
.mix-list,
.cat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.mix-list li,
.cat-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  font-size: 0.875rem;
}
.cat-list {
  margin-top: 10px;
}
.cat-list li {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  border-top: 1px solid var(--line);
}
.cat-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 10px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.split dt {
  font-size: 0.75rem;
}
.split dd {
  margin: 2px 0 0;
  font-weight: 600;
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
