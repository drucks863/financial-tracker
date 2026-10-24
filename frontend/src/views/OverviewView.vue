<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import MonthStrip from '../components/MonthStrip.vue'
import BaseChart from '../components/BaseChart.vue'
import { ui, selectedYm, categoryColor, categoryRank } from '../store/ui'
import { state, monthTotals, avgNonZero, categoryTotals, netWorthSeries } from '../store/finance'
import { money, signedMoney, pct, MONTHS, monthLabel, shortDate } from '../lib/format'
import { series, ROLE } from '../lib/chart-colors'
import { isDark } from '../lib/theme-mode'
import type { ChartBuilder } from '../lib/chart-types'
import { useWidgetOrder } from '../lib/widget-order'

const emit = defineEmits<{ navigate: [view: string] }>()

const WIDGETS = ['summary', 'flow', 'spend', 'networth']
const WIDGET_NAMES: Record<string, string> = { summary: 'Month summary', flow: 'Income vs expenses', spend: 'Where it went', networth: 'Net worth' }
const layout = useWidgetOrder('financial-tracker.overview-order', WIDGETS)
const customOrder = computed(() => layout.order.value.join() !== WIDGETS.join())
const widget = (id: string) => ({
  'data-widget': id,
  class: { dragging: layout.dragging.value === id },
  style: { order: layout.pos(id) }
})

const year = computed(() => monthTotals(ui.year))
const m = computed(() => year.value[ui.month])
const avg = computed(() => ({
  income: avgNonZero(year.value.map((r) => r.income)),
  expense: avgNonZero(year.value.map((r) => r.expense)),
  net: avgNonZero(year.value.filter((r) => r.income).map((r) => r.net))
}))

const spend = computed(() => {
  const ym = selectedYm.value
  const totals = categoryTotals('expense', (e) => e.date.startsWith(ym))
  return Object.entries(totals)
    .map(([name, v]) => ({ name, total: v.total }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((c) => {
      const avg = catAvg.value[c.name] || 0
      return { ...c, avg, delta: avg ? c.total - avg : null }
    })
})

const catAvg = computed(() => {
  const out: Record<string, number> = {}
  const yr = String(ui.year)
  const totals: Record<string, number[]> = {}
  for (const e of state.entries) {
    if (e.type !== 'expense' || !e.date.startsWith(yr)) continue
    const k = e.category
    ;(totals[k] ??= Array<number>(12).fill(0))[+e.date.slice(5, 7) - 1] += e.amount
  }
  for (const [k, arr] of Object.entries(totals)) out[k] = avgNonZero(arr)
  return out
})


const nw = computed(() => netWorthSeries())
const nwLast = computed(() => nw.value.at(-1))
const nwPrev = computed(() => nw.value.at(-2))

const flowChart = computed<ChartBuilder>(() => {
  const rows = year.value
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
        {
          label: 'Income',
          data: rows.map((r) => r.income),
          backgroundColor: series(ROLE.income, dark),
          borderRadius: 4,
          borderSkipped: 'start',
          categoryPercentage: 0.7,
          barPercentage: 0.9,
          order: 1
        },
        {
          label: 'Expenses',
          data: rows.map((r) => r.expense),
          backgroundColor: series(ROLE.expense, dark),
          borderRadius: 4,
          borderSkipped: 'start',
          categoryPercentage: 0.7,
          barPercentage: 0.9,
          order: 1
        }
      ]
    },
    options: {
      onClick: (_, els) => {
        if (els.length) ui.month = els[0].index
      }
    }
  })
})

const donut = computed<ChartBuilder>(() => {
  const items = spend.value
  void categoryRank.value // recolor when the ranking changes
  return (dark, c) => ({
    type: 'doughnut',
    data: {
      labels: items.map((i) => i.name),
      datasets: [
        {
          label: 'Spent',
          data: items.map((i) => i.total),
          backgroundColor: items.map((i) => categoryColor(i.name, dark)),
          borderColor: c.surface,
          borderWidth: 2,
          hoverOffset: 4
        }
      ]
    },
    options: {
      cutout: '68%',
      interaction: { mode: 'nearest', intersect: true },
      plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${money(Number(ctx.parsed))}` } } }
    }
  })
})

const nwSpark = computed<ChartBuilder>(() => {
  const s = nw.value
  return (dark) => ({
    type: 'line',
    data: {
      labels: s.map((p) => shortDate(p.date)),
      datasets: [
        {
          label: 'Net worth',
          data: s.map((p) => p.total),
          borderColor: dark ? '#d4a443' : '#7f591d',
          backgroundColor: dark ? 'rgba(212,164,67,.14)' : 'rgba(127,89,29,.08)',
          fill: true,
          borderWidth: 2,
          pointRadius: s.map((_, i) => (i === s.length - 1 ? 4 : 0)),
          pointBackgroundColor: dark ? '#d4a443' : '#7f591d',
          tension: 0.3
        }
      ]
    },
    options: {
      scales: { x: { display: false }, y: { display: false } },
      layout: { padding: { top: 6, bottom: 2, left: 2, right: 6 } }
    }
  })
})
</script>

<template>
  <div class="stack">
    <header class="page-head">
      <div>
        <h1>{{ monthLabel(selectedYm) }}</h1>
        <p class="muted">Cash flow for the month, against your {{ ui.year }} averages</p>
      </div>
      <Button v-if="customOrder" label="Reset layout" icon="pi pi-undo" text size="small" @click="layout.reset()" />
    </header>

    <MonthStrip />

    <div class="grid-2 widgets" :class="{ 'is-dragging': layout.dragging.value }">
    <section class="panel hero span-2" aria-label="Month summary" v-bind="widget('summary')">
      <button type="button" class="grip" :aria-label="`Move ${WIDGET_NAMES['summary']}. Drag, or use the arrow keys`" title="Drag to move" @pointerdown="layout.onHandleDown('summary', $event)" @keydown="layout.onHandleKey('summary', $event)"><span aria-hidden="true"></span></button>
      <div class="hero-main">
        <p class="ink2">Net cash flow</p>
        <p class="hero-num num" :class="m.net >= 0 ? 'pos' : 'neg'">{{ m.count ? signedMoney(m.net) : '—' }}</p>
        <p class="muted small" v-if="m.count">
          Monthly average {{ signedMoney(avg.net) }} · savings rate {{ pct(m.savingsRate) }}
        </p>
        <p class="muted small" v-else>No entries for this month yet. Use Add entry to start it.</p>
      </div>
      <dl class="hero-stats">
        <div>
          <dt><span class="swatch" :style="{ background: 'var(--series-income)' }"></span>Income</dt>
          <dd class="num">{{ money(m.income) }}</dd>
          <dd class="sub muted num">avg {{ money(avg.income) }}</dd>
        </div>
        <div>
          <dt><span class="swatch" :style="{ background: 'var(--series-expense)' }"></span>Expenses</dt>
          <dd class="num">{{ money(m.expense) }}</dd>
          <dd class="sub muted num">avg {{ money(avg.expense) }}</dd>
        </div>
        <div>
          <dt>Essentials</dt>
          <dd class="num">{{ money(m.essential) }}</dd>
          <dd class="sub muted num">rent + utilities</dd>
        </div>
        <div>
          <dt>Discretionary</dt>
          <dd class="num">{{ money(m.discretionary) }}</dd>
          <dd class="sub muted num">everything else</dd>
        </div>
      </dl>
    </section>

      <section class="panel span-2" v-bind="widget('flow')">
        <button type="button" class="grip" :aria-label="`Move ${WIDGET_NAMES['flow']}. Drag, or use the arrow keys`" title="Drag to move" @pointerdown="layout.onHandleDown('flow', $event)" @keydown="layout.onHandleKey('flow', $event)"><span aria-hidden="true"></span></button>
        <div class="panel-head">
          <div>
            <h2>Income vs expenses, {{ ui.year }}</h2>
            <p class="muted">Tap a month to open it</p>
          </div>
          <div class="legend">
            <span><i class="swatch" style="background: var(--series-income)"></i>Income</span>
            <span><i class="swatch" style="background: var(--series-expense)"></i>Expenses</span>
            <span><i class="swatch line" style="background: var(--ink)"></i>Net</span>
          </div>
        </div>
        <BaseChart :build="flowChart" height="260px" :label="`Monthly income and expenses for ${ui.year}`" />
      </section>

      <section class="panel" v-bind="widget('spend')">
        <button type="button" class="grip" :aria-label="`Move ${WIDGET_NAMES['spend']}. Drag, or use the arrow keys`" title="Drag to move" @pointerdown="layout.onHandleDown('spend', $event)" @keydown="layout.onHandleKey('spend', $event)"><span aria-hidden="true"></span></button>
        <div class="panel-head">
          <div>
            <h2>Where it went</h2>
            <p class="muted">{{ money(m.expense) }} across {{ spend.length }} categories</p>
          </div>
          <Button label="See entries" text size="small" @click="emit('navigate', 'cashflow')" />
        </div>
        <div v-if="spend.length" class="where">
          <div class="donut-wrap">
            <BaseChart :build="donut" height="180px" label="Spending by category this month" />
            <div class="donut-center" aria-hidden="true">
              <span class="num">{{ money(m.expense) }}</span>
              <small class="muted">spent</small>
            </div>
          </div>
          <ul class="cat-list">
            <li v-for="c in spend" :key="c.name">
              <span class="swatch" :style="{ background: categoryColor(c.name, isDark) }" :data-cat="c.name"></span>
              <span class="cat-name">{{ c.name }}</span>
              <span class="num amt">{{ money(c.total) }}</span>
              <span v-if="c.delta !== null" class="delta num" :title="`Monthly average ${money(c.avg)}`">
                <i class="pi" :class="c.delta >= 0 ? 'pi-arrow-up' : 'pi-arrow-down'" aria-hidden="true"></i>
                {{ money(Math.abs(c.delta)) }}
                <span class="sr-only">{{ c.delta >= 0 ? 'above' : 'below' }} average</span>
              </span>
            </li>
          </ul>
        </div>
        <p v-else class="empty">Nothing spent yet this month.</p>
      </section>

        <section class="panel nw-card" v-bind="widget('networth')">
          <button type="button" class="grip" :aria-label="`Move ${WIDGET_NAMES['networth']}. Drag, or use the arrow keys`" title="Drag to move" @pointerdown="layout.onHandleDown('networth', $event)" @keydown="layout.onHandleKey('networth', $event)"><span aria-hidden="true"></span></button>
          <div class="panel-head">
            <div>
              <h2>Net worth</h2>
              <p class="muted" v-if="nwLast">as of {{ shortDate(nwLast.date) }}</p>
            </div>
            <Button label="Open" text size="small" @click="emit('navigate', 'networth')" />
          </div>
          <div v-if="nwLast" class="nw-row">
            <div>
              <p class="nw-num num">{{ money(nwLast.total) }}</p>
              <span v-if="nwPrev" class="delta num">
                <i class="pi" :class="nwLast.total >= nwPrev.total ? 'pi-arrow-up' : 'pi-arrow-down'" aria-hidden="true"></i>
                {{ money(Math.abs(nwLast.total - nwPrev.total)) }} vs prior month
              </span>
            </div>
            <BaseChart :build="nwSpark" height="160px" label="Net worth trend" class="spark" />
          </div>
        </section>
    </div>
  </div>
</template>

<style scoped>
.widgets > .panel {
  position: relative;
  transition: box-shadow 0.15s, opacity 0.15s;
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
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
}
.small {
  font-size: 0.8125rem;
}
.hero {
  display: grid;
  gap: 18px;
}
.hero-num {
  font-size: clamp(2.5rem, 9vw, 3.5rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin: 2px 0 6px;
}
.hero-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  margin: 0;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.hero-stats dt {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--ink-2);
}
.hero-stats dd {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}
.hero-stats dd.sub {
  font-size: 0.75rem;
  font-weight: 400;
}
@media (min-width: 720px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    align-items: center;
  }
  .hero-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-top: 0;
    border-left: 1px solid var(--line);
    padding: 0 0 0 20px;
  }
}
.where {
  display: grid;
  gap: 16px;
}
@media (min-width: 520px) {
  .where {
    grid-template-columns: 180px minmax(0, 1fr);
    align-items: center;
  }
}
.donut-wrap {
  position: relative;
  max-width: 200px;
  justify-self: center;
  width: 100%;
}
.donut-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  pointer-events: none;
}
.donut-center span {
  font-weight: 600;
  font-size: 1.05rem;
}
.cat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.cat-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--line);
}
.cat-list li:last-child {
  border-bottom: 0;
}
.cat-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amt {
  font-weight: 500;
}
.nw-row {
  display: grid;
  gap: 16px;
}
.nw-num {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
