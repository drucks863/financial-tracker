<script setup lang="ts">
import { computed, type WritableComputedRef } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Checkbox from 'primevue/checkbox'
import { state } from '../store/finance'
import { planned, newLine } from '../store/plan'
import { money, money2, pct } from '../lib/format'
import type { Plan, PlanLine } from '../types'

const p = computed<Plan>(() => state.plan!)
const n = planned

// Percent fields are stored as 0–1 but edited as 0–100.
function percent<T extends object>(target: () => T, key: keyof T): WritableComputedRef<number | null> {
  return computed({
    get: () => Math.round(Number(target()[key]) * 10000) / 100,
    set: (v) => ((target() as Record<keyof T, unknown>)[key] = (v ?? 0) / 100)
  })
}
const taxPct = percent(() => p.value, 'taxRate')
const k401Pct = percent(() => p.value, 'k401')
const matchPct = percent(() => p.value, 'match')
const rentSharePct = percent(() => p.value.housing, 'rentShare')
const billsSharePct = percent(() => p.value.housing, 'billsShare')

// Rent can be entered either as a share or as my dollar amount; both stay in sync.
const rentMine = computed<number | null>({
  get: () => Math.round(p.value.housing.rent * p.value.housing.rentShare * 100) / 100,
  set: (v) => {
    const rent = p.value.housing.rent
    if (rent > 0) p.value.housing.rentShare = Math.min(1, Math.max(0, (v ?? 0) / rent))
  }
})

const HOUSING_MODES = [
  { label: 'Solo', value: false },
  { label: 'Split', value: true }
]

const takeHomeActual = computed<boolean>({
  get: () => p.value.takeHome !== null,
  set: (on) => (p.value.takeHome = on ? Math.round(n.value.estTakeHome) : null)
})

function addLine(list: PlanLine[], name = ''): void {
  list.push(newLine(name))
}
function removeLine(list: PlanLine[], id: string): void {
  const i = list.findIndex((l) => l.id === id)
  if (i >= 0) list.splice(i, 1)
}

const summary = computed(() => [
  { label: 'Take-home pay', value: n.value.takeHome, sign: 1 },
  { label: 'Contributions from take-home', value: n.value.takeHomeContrib, sign: -1 },
  { label: p.value.housing.split ? 'Housing (your share)' : 'Housing', value: n.value.housing, sign: -1 },
  { label: 'Living costs', value: n.value.living, sign: -1 }
])
</script>

<template>
  <div class="stack">
    <header class="page-head">
      <div>
        <h1>My numbers</h1>
        <p class="muted">Your current pay, contributions, taxes and rent in one place. Other screens use these figures.</p>
      </div>
    </header>

    <div class="layout">
      <!-- Summary: first on phones, sticky on the right on desktop -->
      <aside class="panel summary" aria-label="Monthly summary">
        <h2>Each month</h2>
        <dl class="lines">
          <div v-for="s in summary" :key="s.label">
            <dt>{{ s.label }}</dt>
            <dd class="num">{{ s.sign < 0 && s.value ? '−' : '' }}{{ money(s.value) }}</dd>
          </div>
          <div class="total">
            <dt>Left over</dt>
            <dd class="num" :class="n.left >= 0 ? 'pos' : 'neg'">{{ money(n.left) }}</dd>
          </div>
        </dl>
        <div class="saved">
          <div>
            <span class="muted small">Saved a month</span>
            <span class="big num">{{ money(n.savedMonthly) }}</span>
            <span class="muted small">401k {{ money(n.k401) }} · match {{ money(n.match) }} · other {{ money(n.otherContrib) }} · left over {{ money(Math.max(0, n.left)) }}</span>
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
          <h2>Pay and taxes</h2>
          <div class="grid">
            <label class="field">
              <span>Gross salary, yearly</span>
              <InputNumber v-model="p.salary" mode="currency" currency="USD" locale="en-US" :max-fraction-digits="0" fluid />
              <small class="muted">{{ money(n.grossMonthly) }} a month</small>
            </label>
            <label class="field">
              <span>Effective tax rate</span>
              <InputNumber v-model="taxPct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
              <small class="muted">about {{ money(n.taxesMonthly) }} a month</small>
            </label>
            <label class="field">
              <span>Your 401k contribution</span>
              <InputNumber v-model="k401Pct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
              <small class="muted">{{ money(n.k401) }} a month</small>
            </label>
            <label class="field">
              <span>Company 401k contribution</span>
              <InputNumber v-model="matchPct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
              <small class="muted">{{ money(n.match) }} a month</small>
            </label>
          </div>
          <div class="take-home">
            <label class="switch">
              <ToggleSwitch v-model="takeHomeActual" />
              <span>Use my actual take-home pay</span>
            </label>
            <InputNumber v-if="takeHomeActual" v-model="p.takeHome" mode="currency" currency="USD" locale="en-US" aria-label="Monthly take-home pay" class="th-input" />
            <span class="muted small">
              {{ takeHomeActual ? `Estimate would be ${money(n.estTakeHome)}` : `Estimated ${money(n.estTakeHome)} a month after paycheck contributions and taxes` }}
            </span>
          </div>
        </section>

        <!-- Contributions -->
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Other contributions</h2>
              <p class="muted">Monthly amounts like HSA or Roth IRA. Mark the ones taken out of your paycheck.</p>
            </div>
          </div>
          <ul class="line-list contrib">
            <li v-for="l in p.contributions" :key="l.id">
              <InputText v-model="l.name" placeholder="Name" aria-label="Contribution name" fluid />
              <InputNumber v-model="l.monthly" mode="currency" currency="USD" locale="en-US" aria-label="Monthly amount" fluid />
              <label class="paycheck" :title="l.fromPaycheck ? 'Taken out before take-home' : 'Paid from take-home'">
                <Checkbox v-model="l.fromPaycheck" binary />
                <span>Paycheck</span>
              </label>
              <Button icon="pi pi-trash" text rounded severity="secondary" :aria-label="`Remove ${l.name || 'contribution'}`" @click="removeLine(p.contributions, l.id)" />
            </li>
          </ul>
          <p v-if="!p.contributions.length" class="empty">None yet.</p>
          <Button label="Add contribution" icon="pi pi-plus" text size="small" @click="addLine(p.contributions)" />
        </section>

        <!-- Housing -->
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Rent and bills</h2>
              <p class="muted">{{ p.housing.split ? `You pay ${money2(n.housing)} of ${money2(n.rentTotal + n.billsTotal)}` : `You pay ${money2(n.housing)}` }} a month</p>
            </div>
            <SelectButton v-model="p.housing.split" :options="HOUSING_MODES" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Housing" />
          </div>
          <div class="grid">
            <label class="field">
              <span>{{ p.housing.split ? 'Total rent' : 'Rent' }}</span>
              <InputNumber v-model="p.housing.rent" mode="currency" currency="USD" locale="en-US" fluid />
            </label>
            <template v-if="p.housing.split">
              <label class="field">
                <span>Your share</span>
                <InputNumber v-model="rentSharePct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" fluid />
              </label>
              <label class="field">
                <span>Your rent</span>
                <InputNumber v-model="rentMine" mode="currency" currency="USD" locale="en-US" fluid />
                <small class="muted">set either one; the other follows</small>
              </label>
            </template>
          </div>

          <h3>{{ p.housing.split ? 'Shared bills' : 'Bills' }}</h3>
          <ul class="line-list">
            <li v-for="l in p.housing.bills" :key="l.id">
              <InputText v-model="l.name" placeholder="Name" aria-label="Bill name" fluid />
              <InputNumber v-model="l.monthly" mode="currency" currency="USD" locale="en-US" aria-label="Monthly amount" fluid />
              <Button icon="pi pi-trash" text rounded severity="secondary" :aria-label="`Remove ${l.name || 'bill'}`" @click="removeLine(p.housing.bills, l.id)" />
            </li>
          </ul>
          <div class="bills-foot">
            <Button label="Add bill" icon="pi pi-plus" text size="small" @click="addLine(p.housing.bills)" />
            <label v-if="p.housing.split" class="field inline">
              <span>Your share of bills</span>
              <InputNumber v-model="billsSharePct" suffix="%" :min="0" :max="100" :max-fraction-digits="2" class="pct-input" />
            </label>
            <span class="muted small">Total {{ money2(n.billsTotal) }}<template v-if="p.housing.split"> · yours {{ money2(n.billsMine) }}</template></span>
          </div>
        </section>

        <!-- Living -->
        <section class="panel">
          <h2>Everyday spending</h2>
          <p class="muted">Everything that isn't rent or bills</p>
          <div class="take-home">
            <label class="switch">
              <ToggleSwitch v-model="p.living.useAverage" />
              <span>Use my average from entries</span>
            </label>
            <InputNumber v-if="!p.living.useAverage" v-model="p.living.monthly" mode="currency" currency="USD" locale="en-US" aria-label="Monthly everyday spending" class="th-input" />
            <span v-else class="muted small">
              {{ n.livingAverageYear ? `${money(n.living)} a month, your ${n.livingAverageYear} discretionary average` : 'No entries yet' }}
            </span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 16px;
}
@media (min-width: 1100px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 340px;
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
  margin: 18px 0 8px;
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
.field.inline {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pct-input :deep(input) {
  width: 90px;
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
.line-list {
  list-style: none;
  margin: 12px 0 4px;
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
.contrib li {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
}
.paycheck {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--ink-2);
  cursor: pointer;
}
@media (max-width: 559px) {
  .contrib li {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }
  .contrib li > :first-child {
    grid-column: 1 / -1;
  }
}
.bills-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

/* summary */
.summary h2 {
  margin-bottom: 10px;
}
.lines {
  margin: 0;
  display: grid;
}
.lines > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--line);
}
.lines dt {
  color: var(--ink-2);
}
.lines dd {
  margin: 0;
  font-weight: 500;
}
.lines .total {
  border-bottom: 0;
  font-weight: 600;
  font-size: 1rem;
}
.lines .total dt {
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
</style>
