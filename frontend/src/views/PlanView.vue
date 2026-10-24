<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type WritableComputedRef } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { state } from '../store/finance'
import { planned, newDeduction, newSharedCost, newLoan, PAY_FREQUENCIES } from '../store/plan'
import { money, money2, pct } from '../lib/format'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import SettingsView from './SettingsView.vue'
import { ui, PROFILE_TABS } from '../store/ui'
import type { Loan, Plan, SharedCost } from '../types'

const emit = defineEmits<{ navigate: [id: string] }>()
const tab = computed(() => PROFILE_TABS.find((t) => t.id === ui.profileTab) ?? PROFILE_TABS[0])
// On phones the tab row scrolls; keep the open tab in view.
const tabsEl = ref<HTMLElement | null>(null)
const revealTab = () =>
  nextTick(() => tabsEl.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
watch(() => ui.profileTab, revealTab)
onMounted(revealTab)

const p = computed<Plan>(() => state.plan!)
const n = planned

// Percent fields are stored as 0–1 but edited as 0–100.
const clampPct = (v: number | null) => Math.min(100, Math.max(0, v ?? 0)) / 100
const asPct = (v: number) => Math.round(v * 10000) / 100
function percent(key: 'taxRate' | 'k401' | 'match'): WritableComputedRef<number | null> {
  return computed({
    get: () => asPct(p.value[key]),
    set: (v) => (p.value[key] = clampPct(v))
  })
}
const taxPct = percent('taxRate')
const k401Pct = percent('k401')
const matchPct = percent('match')
const setShare = (h: SharedCost, v: number | null) => (h.share = clampPct(v))
const setRate = (l: Loan, v: number | null) => (l.rate = clampPct(v))
// Yearly change can be negative (a car loses value), so it isn't clamped to 0–100.
const setChange = (l: Loan, v: number | null) => l.property && (l.property.yearlyChange = (v ?? 0) / 100)
function toggleProperty(l: Loan, on: boolean): void {
  l.property = on ? { name: /car|auto|vehicle/i.test(l.name) ? 'Car' : 'Home', value: l.amount, valuedOn: new Date().toISOString().slice(0, 7), yearlyChange: 0 } : null
}
const loanInfo = (id: string) => n.value.loans.find((x) => x.loan.id === id)
const ymLabel = (ym: string | null) => (ym ? new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—')

const takeHomeActual = computed<boolean>({
  get: () => p.value.takeHome !== null,
  set: (on) => (p.value.takeHome = on ? Math.round(n.value.paycheck.estTakeHome * 100) / 100 : null)
})

const initials = computed(() =>
  (p.value.name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
)
const freqLabel = computed(() => PAY_FREQUENCIES.find((f) => f.value === p.value.payFrequency)?.label.toLowerCase())

function remove<T extends { id: string }>(list: T[], id: string): void {
  const i = list.findIndex((l) => l.id === id)
  if (i >= 0) list.splice(i, 1)
}

const payRows = computed(() => {
  const c = n.value.paycheck
  const m = n.value.monthly
  return [
    { label: 'Gross pay', check: c.gross, month: m.gross },
    { label: 'Your 401k', check: -c.k401, month: -m.k401 },
    { label: 'Other deductions', check: -c.deductions, month: -m.deductions },
    {
      label: takeHomeActual.value ? 'Taxes and other' : 'Taxes (estimated)',
      check: -(c.gross - c.k401 - c.deductions - c.takeHome),
      month: -(m.gross - m.k401 - m.deductions - m.takeHome)
    },
    { label: 'Take-home', check: c.takeHome, month: m.takeHome, total: true }
  ]
})
const signed = (v: number) => (v < -0.004 ? `−${money(-v)}` : money(v))
</script>

<template>
  <div class="stack">
    <header class="page-head">
      <h1 class="sr-only">Financial profile</h1>
      <div class="who">
        <span class="avatar-lg" aria-hidden="true">
          <template v-if="initials">{{ initials }}</template>
          <i v-else class="pi pi-user"></i>
        </span>
        <div class="who-text">
          <InputText v-model="p.name" placeholder="Your name" aria-label="Your name" class="name-input" />
          <small class="muted">Your Google name and photo will show here once sign-in is added.</small>
        </div>
      </div>
    </header>

    <div ref="tabsEl" class="tabs-wrap">
      <Tabs :value="ui.profileTab" scrollable @update:value="(t) => emit('navigate', `plan/${t}`)">
        <TabList>
          <Tab v-for="t in PROFILE_TABS" :key="t.id" :value="t.id">{{ t.label }}</Tab>
        </TabList>
      </Tabs>
      <p class="muted tab-note">{{ tab.note }}</p>
    </div>

    <SettingsView v-if="ui.profileTab !== 'plan'" :section="ui.profileTab" />

    <div v-else class="layout">
      <!-- Summary: first on phones, sticky on the right on desktop -->
      <aside class="panel summary" aria-label="Summary">
        <table class="sum-t">
          <thead>
            <tr>
              <th scope="col"><span class="sr-only">Item</span></th>
              <th scope="col" class="r">Per paycheck</th>
              <th scope="col" class="r">Monthly</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in payRows" :key="r.label" :class="{ total: r.total }">
              <th scope="row">{{ r.label }}</th>
              <td class="num r">{{ signed(r.check) }}</td>
              <td class="num r">{{ signed(r.month) }}</td>
            </tr>
            <tr>
              <th scope="row">Your rent and bills</th>
              <td class="r muted">—</td>
              <td class="num r">{{ signed(-n.monthly.housingMine) }}</td>
            </tr>
            <tr v-if="n.monthly.loanPayments">
              <th scope="row">Loan payments</th>
              <td class="r muted">—</td>
              <td class="num r">{{ signed(-n.monthly.loanPayments) }}</td>
            </tr>
            <tr class="total">
              <th scope="row">{{ n.monthly.loanPayments ? 'Left after housing and loans' : 'Left after rent and bills' }}</th>
              <td class="r muted">—</td>
              <td class="num r" :class="n.monthly.afterHousing >= 0 ? 'pos' : 'neg'">{{ signed(n.monthly.afterHousing) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="saved">
          <div>
            <span class="muted small">Saved a month</span>
            <span class="big num">{{ money(n.monthly.saved) }}</span>
            <span class="muted small">your 401k {{ money(n.monthly.k401) }} · company {{ money(n.monthly.match) }} · deductions {{ money(n.monthly.deductions) }}</span>
          </div>
          <div class="saved-row">
            <div>
              <span class="muted small">Saved a year</span>
              <span class="num strong">{{ money(n.savedYearly) }}</span>
            </div>
            <div>
              <span class="muted small">Of gross pay</span>
              <span class="num strong">{{ pct(n.savedRate) }}</span>
            </div>
          </div>
        </div>
      </aside>

      <div class="inputs">
        <!-- Pay -->
        <section class="panel">
          <h2>Pay</h2>
          <div class="grid">
            <label class="field">
              <span>Gross salary, yearly</span>
              <InputNumber v-model="p.salary" mode="currency" currency="USD" locale="en-US" :max-fraction-digits="0" fluid />
            </label>
            <label class="field">
              <span>Paid</span>
              <Select v-model="p.payFrequency" :options="PAY_FREQUENCIES" option-label="label" option-value="value" fluid />
              <small class="muted">{{ n.perYear }} paychecks a year · {{ money2(n.paycheck.gross) }} gross each</small>
            </label>
            <label class="field">
              <span>Effective tax rate</span>
              <InputNumber v-model="taxPct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
            </label>
          </div>
        </section>

        <!-- 401k + deductions -->
        <section class="panel">
          <h2>Contributions</h2>
          <div class="grid">
            <label class="field">
              <span>Your 401k</span>
              <InputNumber v-model="k401Pct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
              <small class="muted">{{ money2(n.paycheck.k401) }} a paycheck</small>
            </label>
            <label class="field">
              <span>Company 401k</span>
              <InputNumber v-model="matchPct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
              <small class="muted">{{ money2(n.paycheck.match) }} a paycheck, on top of your pay</small>
            </label>
          </div>

          <h3>Other paycheck deductions</h3>
          <ul class="line-list">
            <li v-for="d in p.deductions" :key="d.id">
              <InputText v-model="d.name" placeholder="Name, e.g. HSA" aria-label="Deduction name" fluid />
              <InputNumber v-model="d.perPaycheck" mode="currency" currency="USD" locale="en-US" aria-label="Amount per paycheck" fluid />
              <Button icon="pi pi-trash" text rounded severity="secondary" :aria-label="`Remove ${d.name || 'deduction'}`" @click="remove(p.deductions, d.id)" />
            </li>
          </ul>
          <div class="list-foot">
            <Button label="Add deduction" icon="pi pi-plus" text size="small" @click="p.deductions.push(newDeduction())" />
            <span class="muted small">Amounts are per paycheck</span>
          </div>

          <div class="take-home">
            <label class="switch">
              <ToggleSwitch v-model="takeHomeActual" />
              <span>Use my actual take-home</span>
            </label>
            <InputNumber v-if="takeHomeActual" v-model="p.takeHome" mode="currency" currency="USD" locale="en-US" aria-label="Take-home per paycheck" class="th-input" />
            <span class="muted small">
              {{ takeHomeActual ? `per paycheck · estimate would be ${money2(n.paycheck.estTakeHome)}` : `Estimated ${money2(n.paycheck.estTakeHome)} a paycheck, ${freqLabel}` }}
            </span>
          </div>
        </section>

        <!-- Housing -->
        <section class="panel">
          <h2>Rent and bills</h2>
          <p class="muted">Monthly cost and your share. Living alone? Use 100%.</p>
          <div class="house-head" aria-hidden="true">
            <span>Item</span><span>Monthly cost</span><span>Your share</span><span class="r">You pay</span><span></span>
          </div>
          <ul class="line-list house">
            <li v-for="h in p.housing" :key="h.id">
              <InputText v-model="h.name" class="h-name" placeholder="Name, e.g. Rent" aria-label="Item" fluid />
              <InputNumber v-model="h.monthly" class="h-cost" mode="currency" currency="USD" locale="en-US" aria-label="Monthly cost" fluid />
              <InputNumber
                :model-value="asPct(h.share)"
                class="h-share"
                suffix="%"
                :min="0"
                :max="100"
                :max-fraction-digits="2"
                aria-label="Your share"
                fluid
                @update:model-value="setShare(h, $event)"
              />
              <span class="num r mine">{{ money2((h.monthly || 0) * h.share) }}</span>
              <Button class="h-del" icon="pi pi-trash" text rounded severity="secondary" :aria-label="`Remove ${h.name || 'item'}`" @click="remove(p.housing, h.id)" />
            </li>
          </ul>
          <div class="list-foot">
            <Button label="Add item" icon="pi pi-plus" text size="small" @click="p.housing.push(newSharedCost())" />
            <span class="muted small num">Total {{ money2(n.monthly.housingTotal) }} · you pay {{ money2(n.monthly.housingMine) }}</span>
          </div>
        </section>

        <!-- Loans -->
        <section class="panel">
          <h2>Loans</h2>
          <p class="muted">Mortgage, car loan and so on. Net worth uses these to work out what you owe each month.</p>
          <div v-for="l in p.loans" :key="l.id" class="loan">
            <div class="loan-top">
              <InputText v-model="l.name" placeholder="Name, e.g. Mortgage" aria-label="Loan name" fluid />
              <Button icon="pi pi-trash" text rounded severity="secondary" :aria-label="`Remove ${l.name || 'loan'}`" @click="remove(p.loans, l.id)" />
            </div>
            <div class="loan-grid">
              <label class="field">
                <span>Amount borrowed</span>
                <InputNumber v-model="l.amount" mode="currency" currency="USD" locale="en-US" :max-fraction-digits="0" fluid />
              </label>
              <label class="field">
                <span>Interest rate</span>
                <InputNumber :model-value="asPct(l.rate)" suffix="%" :min="0" :max="100" :max-fraction-digits="3" fluid @update:model-value="setRate(l, $event)" />
              </label>
              <label class="field">
                <span>Term</span>
                <InputNumber v-model="l.termYears" suffix=" years" :min="1" :max="50" fluid />
              </label>
              <label class="field">
                <span>First payment</span>
                <InputText v-model="l.start" type="month" class="month-input" fluid />
              </label>
              <label class="field">
                <span>Extra each month</span>
                <InputNumber v-model="l.extraMonthly" mode="currency" currency="USD" locale="en-US" fluid />
              </label>
            </div>
            <label class="switch prop-switch">
              <ToggleSwitch :model-value="!!l.property" @update:model-value="toggleProperty(l, $event)" />
              <span>Count what it bought as an asset (home, car)</span>
            </label>
            <div v-if="l.property" class="loan-grid">
              <label class="field">
                <span>Asset name</span>
                <InputText v-model="l.property.name" fluid />
              </label>
              <label class="field">
                <span>Conservative market value</span>
                <InputNumber v-model="l.property.value" mode="currency" currency="USD" locale="en-US" :max-fraction-digits="0" fluid />
              </label>
              <label class="field">
                <span>Valued as of</span>
                <InputText v-model="l.property.valuedOn" type="month" class="month-input" fluid />
              </label>
              <label class="field">
                <span>Yearly change</span>
                <InputNumber
                  :model-value="Math.round(l.property.yearlyChange * 10000) / 100"
                  suffix="%"
                  :min="-50"
                  :max="50"
                  :max-fraction-digits="2"
                  fluid
                  @update:model-value="setChange(l, $event)"
                />
                <small class="muted">0% holds it flat; use a negative number for a car</small>
              </label>
            </div>
            <p v-if="loanInfo(l.id)" class="muted small loan-sum num">
              {{ money2(loanInfo(l.id)!.payment) }} a month · owe {{ money(loanInfo(l.id)!.balance) }} now · paid off {{ ymLabel(loanInfo(l.id)!.payoff) }} ·
              {{ money(loanInfo(l.id)!.interestTotal) }} interest over the loan
              <template v-if="loanInfo(l.id)!.equity !== null"> · equity {{ money(loanInfo(l.id)!.equity!) }}</template>
            </p>
          </div>
          <Button label="Add loan" icon="pi pi-plus" text size="small" @click="p.loans.push(newLoan())" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.tabs-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.tabs-wrap :deep(.p-tablist-tab-list) {
  background: transparent;
}
.tabs-wrap :deep(.p-tab) {
  padding: 14px 16px;
  font-size: 0.9rem;
  white-space: nowrap;
}
.tab-note {
  margin: 0;
  font-size: 0.875rem;
}
.page-head {
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}
.who {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding-bottom: 6px;
}
.who-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.who-text small {
  padding-left: 8px;
  font-size: 0.75rem;
}
.avatar-lg {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 50%;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--ink);
}
/* Reads as the account name; looks like an input only on hover or focus. */
.name-input {
  width: min(260px, 100%);
  padding-inline: 8px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  font-size: 1.125rem;
  font-weight: 650;
}
.name-input:hover,
.name-input:focus {
  border-color: var(--line);
  background: var(--panel);
}
.layout {
  display: grid;
  gap: 16px;
}
@media (min-width: 1100px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 360px;
    align-items: start;
  }
  .summary {
    order: 2;
    position: sticky;
    top: 24px;
  }
}
.inputs {
  display: grid;
  gap: 16px;
}
.panel h2 {
  margin-bottom: 4px;
}
h3 {
  margin: 20px 0 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ink-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px 16px;
  margin-top: 14px;
  align-items: start;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--ink-2);
}
.field small {
  font-size: 0.75rem;
}
.take-home {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.875rem;
  cursor: pointer;
}
.th-input :deep(input) {
  width: 140px;
}
.small {
  font-size: 0.8125rem;
}
.r {
  text-align: right;
}
.line-list {
  list-style: none;
  margin: 8px 0 4px;
  padding: 0;
  display: grid;
  gap: 8px;
}
.line-list li {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.house li,
.house-head {
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.8fr) 84px 40px;
}
.house-head {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  font-size: 0.75rem;
  color: var(--muted);
}
.mine {
  font-weight: 600;
}
@media (max-width: 639px) {
  .house-head {
    display: none;
  }
  .house li {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) auto;
    grid-template-areas: 'name name del' 'cost share share' 'mine mine mine';
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
  }
  .house .h-name {
    grid-area: name;
  }
  .house .h-cost {
    grid-area: cost;
  }
  .house .h-share {
    grid-area: share;
  }
  .house .h-del {
    grid-area: del;
  }
  .house li > .mine {
    grid-area: mine;
    text-align: left;
    font-size: 0.8125rem;
  }
  .house li > .mine::before {
    content: 'You pay ';
    font-weight: 400;
    color: var(--muted);
  }
}
.list-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.loan {
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.loan-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 6px;
}
.loan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px 14px;
  margin-top: 10px;
  align-items: start;
}
/* native month inputs have a wide intrinsic size; let the grid decide */
.month-input {
  min-width: 0;
  width: 100%;
}
.prop-switch {
  margin-top: 14px;
}
.loan-sum {
  margin: 10px 0 0;
}

/* summary */
.sum-t {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.sum-t thead th {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted);
  padding: 0 0 8px;
}
.sum-t tbody th {
  text-align: left;
  font-weight: 400;
  color: var(--ink-2);
}
.sum-t tbody th,
.sum-t td {
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.sum-t td {
  padding-left: 12px;
  white-space: nowrap;
}
.sum-t tr.total th,
.sum-t tr.total td {
  font-weight: 600;
  color: var(--ink);
}
.saved {
  display: grid;
  gap: 14px;
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.saved > div:first-child,
.saved-row > div {
  display: grid;
  gap: 2px;
}
.big {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.strong {
  font-weight: 600;
  font-size: 1.0625rem;
}
.saved-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
