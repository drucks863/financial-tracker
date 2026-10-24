<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { useToast } from 'primevue/usetoast'
import BaseChart from '../components/BaseChart.vue'
import { state, netWorthSeries, saveSnapshot, deleteSnapshot, addAccount, NW_GROUPS } from '../store/finance'
import { money, signedMoney, pct, shortDate } from '../lib/format'
import { series, ROLE } from '../lib/chart-colors'
import type { ChartBuilder } from '../lib/chart-types'
import { loanSummary, currentYm } from '../lib/loan'
import { planned } from '../store/plan'
import type { AccountGroup, NetWorthPoint } from '../types'

const toast = useToast()
const all = computed(() => netWorthSeries())
const last = computed(() => all.value.at(-1))
const prev = computed(() => all.value.at(-2))
const yearAgo = computed(() => {
  if (!last.value) return null
  const target = `${+last.value.date.slice(0, 4) - 1}${last.value.date.slice(4, 7)}`
  return all.value.find((p) => p.date.startsWith(target)) || null
})
const first = computed(() => all.value[0])
// Percent change only makes sense against a positive starting value.
// Expected monthly growth from the financial profile: contributions (yours, company, paycheck deductions)
// plus loan principal paid down. Market moves come on top of this.
const expected = computed(() => {
  const m = planned.value.monthly
  const ym = last.value?.date.slice(0, 7) ?? currentYm()
  const principal = (state.plan?.loans ?? []).reduce((a, l) => a + (loanSummary(l).rows.find((r) => r.ym === ym)?.principal ?? 0), 0)
  return { contributions: m.saved, principal, total: m.saved + principal }
})
const rel = (now: number, then: number) => (then > 0 ? pct((now - then) / then) : '')

const range = ref<number | 'all'>('all')
const RANGES: { label: string; value: number | 'all' }[] = [
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
  { label: 'All', value: 'all' }
]
const shown = computed(() => {
  const r = range.value
  return r === 'all' ? all.value : all.value.slice(-(r + 1))
})

const GROUP_COLOR: Record<AccountGroup, number> = { Cash: ROLE.cash, Investments: ROLE.investments, 'Other assets': ROLE.other, Debt: ROLE.debt }
const groupsInUse = computed(() =>
  NW_GROUPS.filter(
    (g) =>
      state.netWorth.accounts.some((a) => a.group === g) ||
      (g === 'Other assets' && all.value.some((p) => Object.keys(p.properties).length)) ||
      (g === 'Debt' && all.value.some((p) => Object.keys(p.loans).length))
  )
)

// Groups are drawn as stacked areas (pre-summed so the net worth line stays unstacked);
// tooltips report each group's own balance.
const chart = computed<ChartBuilder>(() => {
  const pts = shown.value
  const groups = groupsInUse.value.filter((g) => g !== 'Debt')
  let running = pts.map(() => 0)
  const layers = groups.map((g) => {
    const raw = pts.map((p) => p.byGroup[g])
    running = running.map((v, i) => v + raw[i])
    return { g, raw, top: running }
  })
  const hasDebt = pts.some((p) => p.debt > 0)
  const offset = hasDebt ? 2 : 1 // datasets before the group layers
  return (dark, c) => ({
    type: 'line',
    data: {
      labels: pts.map((p) => shortDate(p.date)),
      datasets: [
        {
          label: 'Net worth',
          data: pts.map((p) => p.total),
          borderColor: c.ink,
          backgroundColor: c.ink,
          borderWidth: 2,
          pointRadius: pts.map((_, i) => (i === pts.length - 1 ? 4 : 0)),
          pointHoverRadius: 5,
          tension: 0.25,
          fill: false
        },
        ...(hasDebt
          ? [
              {
                label: 'Debt',
                data: pts.map((p) => -p.debt),
                borderColor: series(ROLE.debt, dark),
                backgroundColor: series(ROLE.debt, dark) + (dark ? '66' : '33'),
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.25,
                fill: 'origin' as const
              }
            ]
          : []),
        ...layers.map(({ g, top }, i) => ({
          label: g,
          data: top,
          borderColor: series(GROUP_COLOR[g], dark),
          backgroundColor: series(GROUP_COLOR[g], dark) + (dark ? '8c' : '40'),
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.25,
          fill: i === 0 ? ('origin' as const) : ('-1' as const)
        }))
      ]
    },
    options: {
      scales: { y: { beginAtZero: true } },
      plugins: {
        tooltip: {
          // dataset 0 is the net worth line, then debt (drawn below zero), then the pre-summed group layers
          callbacks: {
            label: (ctx) => {
              const i = ctx.datasetIndex
              const v = i >= offset ? layers[i - offset].raw[ctx.dataIndex] : ctx.parsed.y
              return ` ${ctx.dataset.label}: ${money(v)}`
            }
          }
        }
      }
    }
  })
})

const accountRows = computed(() => {
  const l = last.value
  const p = prev.value
  if (!l) return []
  return state.netWorth.accounts
    .map((a) => {
      const debt = a.group === 'Debt'
      const val = (pt: NetWorthPoint) => (debt ? Math.abs(pt.values[a.id] || 0) : pt.values[a.id] || 0)
      const value = val(l)
      // For debt, "change" is how much was paid down, so positive is good either way.
      const change = p ? (debt ? val(p) - value : value - val(p)) : null
      const note = debt ? (l.debt ? `${pct(value / l.debt)} of debt` : 'debt') : l.assets ? `${pct(value / l.assets)} of assets` : ''
      return { ...a, debt, value, change, note }
    })
    .concat(
      // Loans from the financial profile appear as debt rows; their balances are worked out, not entered.
      (state.plan?.loans ?? [])
        .filter((ln) => (l.loans[ln.id] || 0) > 0)
        .map((ln) => {
          const value = l.loans[ln.id] || 0
          const before = p ? p.loans[ln.id] ?? ln.amount : null
          return {
            id: ln.id,
            name: ln.name || 'Loan',
            group: 'Debt' as AccountGroup,
            debt: true,
            value,
            change: before === null ? null : before - value,
            note: 'from your profile'
          }
        }),
      // ...and the property each loan bought, at its conservative value.
      (state.plan?.loans ?? [])
        .filter((ln) => (l.properties[ln.id] || 0) > 0)
        .map((ln) => {
          const value = l.properties[ln.id] || 0
          const before = p ? p.properties[ln.id] ?? null : null
          return {
            id: `${ln.id}-property`,
            name: ln.property?.name || 'Property',
            group: 'Other assets' as AccountGroup,
            debt: false,
            value,
            change: before === null ? null : value - before,
            note: `${l.assets ? pct(value / l.assets) : ''} of assets · conservative value`
          }
        })
    )
    .sort((a, b) => NW_GROUPS.indexOf(a.group) - NW_GROUPS.indexOf(b.group) || b.value - a.value)
})

/* ---- loans: principal vs interest ---- */
const loans = computed(() => (state.plan?.loans ?? []).filter((l) => l.amount > 0).map((l) => ({ loan: l, ...loanSummary(l) })))
const loanPick = ref<string | null>(null)
const loan = computed(() => loans.value.find((x) => x.loan.id === loanPick.value) ?? loans.value[0])
const loanChart = computed<ChartBuilder>(() => {
  const L = loan.value
  const years: Record<string, { p: number; i: number }> = {}
  for (const r of L?.rows ?? []) {
    const y = r.ym.slice(0, 4)
    const t = (years[y] ??= { p: 0, i: 0 })
    t.p += r.principal
    t.i += r.interest
  }
  const labels = Object.keys(years)
  const now = currentYm().slice(0, 4)
  const dim = (color: string, i: number) => (labels[i] < now ? color + '8c' : color)
  return (dark, c) => ({
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Principal',
          data: labels.map((y) => years[y].p),
          backgroundColor: labels.map((_, i) => dim(series(ROLE.cash, dark), i)),
          borderColor: c.surface,
          borderWidth: { top: 1 },
          borderSkipped: false as const
        },
        {
          label: 'Interest',
          data: labels.map((y) => years[y].i),
          backgroundColor: labels.map((_, i) => dim(series(ROLE.debt, dark), i)),
          borderColor: c.surface,
          borderWidth: { top: 1 },
          borderSkipped: false as const
        }
      ]
    },
    options: {
      scales: { x: { stacked: true, ticks: { maxTicksLimit: 10, autoSkip: true } }, y: { stacked: true } },
      interaction: { mode: 'index', intersect: false }
    }
  })
})
const ymLabel = (ym: string | null) => (ym ? new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—')

/* ---- snapshot dialog ---- */
const dlg = reactive({ open: false, date: null as Date | null, values: {} as Record<string, number>, editing: false })
const newAcct = reactive<{ name: string; group: AccountGroup }>({ name: '', group: 'Investments' })

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function openSnapshot(point: NetWorthPoint | null = null): void {
  if (point) {
    const [y, m, d] = point.date.split('-').map(Number)
    Object.assign(dlg, { open: true, date: new Date(y, m - 1, d), values: { ...point.values }, editing: true })
  } else {
    const base = last.value ? new Date(+last.value.date.slice(0, 4), +last.value.date.slice(5, 7), 1) : new Date()
    Object.assign(dlg, { open: true, date: endOfMonth(base), values: { ...(last.value?.values || {}) }, editing: false })
  }
}
const dlgTotal = computed(() =>
  state.netWorth.accounts.reduce((a, acc) => (acc.group === 'Debt' ? a - Math.abs(dlg.values[acc.id] || 0) : a + (dlg.values[acc.id] || 0)), 0)
)
function addAcct() {
  const a = addAccount(newAcct.name, newAcct.group)
  if (!a) return
  dlg.values[a.id] = 0
  newAcct.name = ''
}
function saveDlg() {
  if (!dlg.date) return
  saveSnapshot(iso(dlg.date), dlg.values)
  dlg.open = false
  toast.add({ severity: 'success', summary: 'Snapshot saved', detail: `${shortDate(iso(dlg.date))} · ${money(dlgTotal.value)}`, life: 2200 })
}
const confirmDelete = ref(false)
function removeDlg() {
  if (dlg.date) deleteSnapshot(iso(dlg.date))
  dlg.open = false
  confirmDelete.value = false
  toast.add({ severity: 'info', summary: 'Snapshot deleted', life: 2000 })
}
const history = computed(() => [...all.value].reverse())
const isMobile = () => window.matchMedia('(max-width: 640px)').matches
</script>

<template>
  <div class="stack">
    <header class="page-head">
      <div>
        <h1>Net worth</h1>
        <p class="muted">Month-end balances from your net worth tracker</p>
      </div>
      <Button label="Add snapshot" icon="pi pi-plus" outlined @click="openSnapshot()" />
    </header>

    <section v-if="last" class="panel hero">
      <div>
        <p class="ink2">Net worth on {{ shortDate(last.date) }}</p>
        <p class="hero-num num">{{ money(last.total) }}</p>
        <p v-if="last.debt" class="muted small num">{{ money(last.assets) }} assets · −{{ money(last.debt) }} debt</p>
      </div>
      <dl class="changes">
        <div v-if="prev">
          <dt>vs prior month</dt>
          <dd class="num" :class="last.total >= prev.total ? 'pos' : 'neg'">{{ signedMoney(last.total - prev.total) }}</dd>
          <dd class="sub muted">
            {{ rel(last.total, prev.total) }}
            <template v-if="expected.total > 0">
              · <span :class="last.total - prev.total >= expected.total ? 'pos' : 'neg'">{{ last.total - prev.total >= expected.total ? 'ahead of' : 'behind' }} plan</span>
            </template>
          </dd>
        </div>
        <div v-if="expected.total > 0">
          <dt>Expected each month</dt>
          <dd class="num">{{ signedMoney(expected.total) }}</dd>
          <dd class="sub muted">{{ money(expected.contributions) }} contributions<template v-if="expected.principal"> + {{ money(expected.principal) }} loan principal</template></dd>
        </div>
        <div v-if="yearAgo">
          <dt>vs a year ago</dt>
          <dd class="num" :class="last.total >= yearAgo.total ? 'pos' : 'neg'">{{ signedMoney(last.total - yearAgo.total) }}</dd>
          <dd class="sub muted">{{ rel(last.total, yearAgo.total) }}</dd>
        </div>
        <div v-if="first && first !== last">
          <dt>since {{ shortDate(first.date) }}</dt>
          <dd class="num" :class="last.total >= first.total ? 'pos' : 'neg'">{{ signedMoney(last.total - first.total) }}</dd>
          <dd class="sub muted">{{ rel(last.total, first.total) }}</dd>
        </div>
      </dl>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Over time</h2>
          <p class="muted">Assets stacked above zero, debt below; the line is net worth</p>
        </div>
        <SelectButton v-model="range" :options="RANGES" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Range" />
      </div>
      <BaseChart :build="chart" height="300px" label="Net worth over time by account group" />
      <div class="legend">
        <span><i class="swatch line" style="background: var(--ink)"></i>Net worth</span>
        <span v-for="g in groupsInUse.filter((g) => g !== 'Debt')" :key="g">
          <i class="swatch" :style="{ background: `var(--nw-${g.replace(' ', '-').toLowerCase()})` }"></i>{{ g }}
        </span>
        <span v-if="last && last.debt > 0"><i class="swatch" style="background: var(--nw-debt)"></i>Debt (below zero)</span>
      </div>
    </section>

    <section v-if="loan" class="panel">
      <div class="panel-head">
        <div>
          <h2>{{ loan.loan.name || 'Loan' }}: principal vs interest</h2>
          <p class="muted num">
            Owe {{ money(loan.balance) }} · paid {{ money(loan.principalPaid) }} principal and {{ money(loan.interestPaid) }} interest so far · paid off {{ ymLabel(loan.payoff) }}
          </p>
          <p v-if="loan.equity !== null" class="num equity">
            Equity <strong :class="loan.equity >= 0 ? 'pos' : 'neg'">{{ money(loan.equity) }}</strong>&nbsp;
            <span class="muted">· {{ loan.loan.property?.name || 'Property' }} worth {{ money(loan.value) }} (conservative) − {{ money(loan.balance) }} owed</span>
          </p>
        </div>
        <Select
          v-if="loans.length > 1"
          v-model="loanPick"
          :options="loans.map((x) => ({ label: x.loan.name || 'Loan', value: x.loan.id }))"
          option-label="label"
          option-value="value"
          :placeholder="loan.loan.name || 'Loan'"
          size="small"
          aria-label="Loan"
        />
      </div>
      <BaseChart :build="loanChart" height="240px" :label="`Principal and interest paid each year on ${loan.loan.name || 'the loan'}`" />
      <div class="legend">
        <span><i class="swatch" style="background: var(--nw-cash)"></i>Principal</span>
        <span><i class="swatch" style="background: var(--nw-debt)"></i>Interest</span>
        <span class="muted">Faded bars are past years · {{ money(loan.interestTotal) }} interest over the whole loan · edit it in your profile</span>
      </div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head">
          <h2>Accounts</h2>
          <p class="muted" v-if="last">as of {{ shortDate(last.date) }}</p>
        </div>
        <table class="t">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col" class="r">Balance</th>
              <th scope="col" class="r">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in accountRows" :key="a.id">
              <td>
                <span class="acct">{{ a.name }}</span>
                <small class="muted">{{ a.group }} · {{ a.note }}</small>
              </td>
              <td class="r num" :class="{ neg: a.debt && a.value }">{{ a.debt && a.value ? `−${money(a.value)}` : money(a.value) }}</td>
              <td class="r num" :class="a.change === null || a.change === 0 ? 'muted' : a.change > 0 ? 'pos' : 'neg'">
                {{ a.change === null ? '—' : signedMoney(a.change) }}
                <small v-if="a.debt && a.change" class="muted paid">{{ a.change > 0 ? 'paid down' : 'added' }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Snapshots</h2>
          <p class="muted">{{ all.length }} months · tap one to edit</p>
        </div>
        <ul class="snaps">
          <li v-for="(p, i) in history" :key="p.date">
            <button type="button" @click="openSnapshot(p)">
              <span>{{ shortDate(p.date) }}</span>
              <span class="num">{{ money(p.total) }}</span>
              <span v-if="history[i + 1]" class="num small" :class="p.total >= history[i + 1].total ? 'pos' : 'neg'">
                {{ signedMoney(p.total - history[i + 1].total) }}
              </span>
              <span v-else class="small muted">first</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <Dialog
      v-model:visible="dlg.open"
      modal
      :header="dlg.editing ? 'Edit snapshot' : 'Add snapshot'"
      :position="isMobile() ? 'bottom' : 'center'"
      :style="{ width: 'min(520px, 100vw)' }"
      :pt="{ root: { class: 'entry-dialog' } }"
      :draggable="false"
      dismissable-mask
    >
      <form class="snap-form" @submit.prevent="saveDlg">
        <label class="field">
          <span>Month-end date</span>
          <DatePicker v-model="dlg.date" input-id="snap-date" date-format="M d, yy" fluid :disabled="dlg.editing" />
        </label>
        <p class="muted small">Balances start from your last snapshot. For debts, enter what you still owe; it's subtracted. Loans set up in your financial profile are added for you.</p>
        <div v-for="g in NW_GROUPS" :key="g" class="grp">
          <template v-if="state.netWorth.accounts.some((a) => a.group === g)">
            <h3>{{ g }}</h3>
            <label v-for="a in state.netWorth.accounts.filter((x) => x.group === g)" :key="a.id" class="acct-row">
              <span>{{ a.name }}<small v-if="g === 'Debt'" class="muted"> owed</small></span>
              <InputNumber v-model="dlg.values[a.id]" :input-id="`snap-${a.id}`" mode="currency" currency="USD" locale="en-US" fluid />
            </label>
          </template>
        </div>
        <div class="add-acct">
          <InputText id="snap-new-account" v-model="newAcct.name" placeholder="New account, e.g. Car loan" />
          <Select v-model="newAcct.group" :options="NW_GROUPS" aria-label="Account group" />
          <Button type="button" label="Add" size="small" outlined @click="addAcct" />
        </div>
        <div class="dlg-total">
          <span class="ink2">Net worth</span>
          <span class="num">{{ money(dlgTotal) }}</span>
        </div>
        <div class="actions">
          <template v-if="dlg.editing && confirmDelete">
            <span class="ink2 grow">Delete this snapshot?</span>
            <Button type="button" label="Keep" text severity="secondary" @click="confirmDelete = false" />
            <Button type="button" label="Delete" severity="danger" @click="removeDlg" />
          </template>
          <template v-else>
            <Button v-if="dlg.editing" type="button" icon="pi pi-trash" text severity="danger" aria-label="Delete snapshot" @click="confirmDelete = true" />
            <span class="grow"></span>
            <Button type="button" label="Cancel" text severity="secondary" @click="dlg.open = false" />
            <Button type="submit" label="Save snapshot" />
          </template>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.equity {
  margin: 6px 0 0;
  font-size: 0.875rem;
}
.paid {
  display: block;
  font-size: 0.6875rem;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.hero {
  display: grid;
  gap: 16px;
}
@media (min-width: 720px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    align-items: center;
  }
}
.hero-num {
  font-size: clamp(2.25rem, 8vw, 3.25rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.changes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin: 0;
}
.changes dt {
  font-size: 0.75rem;
  color: var(--ink-2);
}
.changes dd {
  margin: 0;
  font-weight: 600;
  font-size: 1.05rem;
}
.changes dd.sub {
  font-size: 0.75rem;
  font-weight: 400;
}
.legend {
  margin-top: 10px;
}
.t {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.t th {
  font-weight: 500;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: left;
  padding-bottom: 6px;
}
.t td {
  padding: 8px 0;
  border-top: 1px solid var(--line);
  vertical-align: top;
}
.acct {
  display: block;
  font-weight: 500;
}
.r {
  text-align: right !important;
}
.small {
  font-size: 0.75rem;
}
.snaps {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
}
.snaps button {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 80px;
  gap: 12px;
  padding: 8px 4px;
  border: 0;
  border-top: 1px solid var(--line);
  background: none;
  font: inherit;
  font-size: 0.875rem;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.snaps li:first-child button {
  border-top: 0;
}
.snaps button > :nth-child(n + 2) {
  text-align: right;
}
.snaps button:hover {
  background: var(--accent-soft);
}
.snap-form {
  display: grid;
  gap: 12px;
}
.field {
  display: grid;
  gap: 6px;
}
.field > span {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink-2);
}
.grp {
  display: grid;
  gap: 8px;
}
.grp:empty {
  display: none;
}
.grp h3 {
  font-size: 0.8125rem;
  color: var(--muted);
  font-weight: 500;
}
.acct-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 180px);
  gap: 12px;
  align-items: center;
  font-size: 0.875rem;
}
.add-acct {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--line);
}
.dlg-total {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  font-size: 1.05rem;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.grow {
  flex: 1;
}
</style>
