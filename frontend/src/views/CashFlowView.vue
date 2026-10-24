<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import MonthStrip from '../components/MonthStrip.vue'
import { ui, selectedYm, openEntry, categoryColor } from '../store/ui'
import { state, categoriesOf, monthTotals } from '../store/finance'
import { money, money2, monthLabel, MONTHS } from '../lib/format'
import { isDark } from '../lib/theme-mode'
import type { Entry, EntryType } from '../types'

interface SubGroup {
  name: string
  total: number
  entries: Entry[]
}
interface CatGroup {
  name: string
  total: number
  subs: Record<string, SubGroup>
}

const type = ref<EntryType>('expense')
const query = ref('')
const collapsed = reactive<Record<string, boolean>>({})

const totals = computed(() => monthTotals(ui.year)[ui.month])
const TYPES = computed<{ label: string; value: EntryType; total: number }[]>(() => [
  { label: 'Expenses', value: 'expense', total: totals.value.expense },
  { label: 'Income', value: 'income', total: totals.value.income }
])

// Category → subcategory → entries, in the category order from the sheet.
const groups = computed(() => {
  const ym = selectedYm.value
  const q = query.value.trim().toLowerCase()
  const list = state.entries.filter(
    (e) =>
      e.type === type.value &&
      e.date.startsWith(ym) &&
      (!q || `${e.description} ${e.category} ${e.subcategory}`.toLowerCase().includes(q))
  )
  const order = categoriesOf(type.value).map((c) => c.name)
  const byCat: Record<string, CatGroup> = {}
  for (const e of list) {
    const c = (byCat[e.category] ??= { name: e.category, total: 0, subs: {} })
    c.total += e.amount
    const s = (c.subs[e.subcategory] ??= { name: e.subcategory, total: 0, entries: [] })
    s.total += e.amount
    s.entries.push(e)
  }
  const cats = Object.values(byCat).sort((a, b) => {
    const ia = order.indexOf(a.name)
    const ib = order.indexOf(b.name)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const catDef = (name: string) => categoriesOf(type.value).find((c) => c.name === name)
  return cats.map((c) => {
    const subOrder = catDef(c.name)?.subcategories || []
    return {
      ...c,
      essential: !!catDef(c.name)?.essential,
      subs: Object.values(c.subs)
        .sort((a, b) => subOrder.indexOf(a.name) - subOrder.indexOf(b.name))
        .map((s) => ({ ...s, entries: s.entries.sort((a, b) => b.amount - a.amount) }))
    }
  })
})

const shownTotal = computed(() => groups.value.reduce((a, g) => a + g.total, 0))
const dayLabel = (iso: string): string => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`
const swatch = (name: string): string => (type.value === 'expense' ? categoryColor(name, isDark.value) : 'var(--series-income)')
</script>

<template>
  <div class="stack">
    <header class="head">
      <div>
        <h1>Cash flow</h1>
        <p class="muted">Every entry for {{ monthLabel(selectedYm) }}, grouped the way your sheet groups them</p>
      </div>
      <Button class="add-top" label="Add entry" icon="pi pi-plus" @click="openEntry()" />
    </header>

    <MonthStrip />

    <div class="toolbar">
      <SelectButton v-model="type" :options="TYPES" option-value="value" :allow-empty="false" aria-label="Entry type" class="type-switch">
        <template #option="{ option }">
          <span class="opt">
            <span>{{ option.label }}</span>
            <small class="num">{{ money(option.total) }}</small>
          </span>
        </template>
      </SelectButton>
      <IconField class="search">
        <InputIcon class="pi pi-search" />
        <InputText id="cashflow-search" v-model="query" placeholder="Search this month" fluid />
      </IconField>
    </div>

    <section v-if="groups.length" class="panel list-panel">
      <div class="list-head">
        <span class="muted">{{ groups.length }} categories</span>
        <span class="num"><span class="muted">Total</span> {{ money2(shownTotal) }}</span>
      </div>
      <div v-for="g in groups" :key="g.name" class="cat">
        <button type="button" class="cat-row" :aria-expanded="!collapsed[g.name]" @click="collapsed[g.name] = !collapsed[g.name]">
          <span class="swatch" :style="{ background: swatch(g.name) }"></span>
          <span class="cat-name">
            {{ g.name }}
            <small v-if="g.essential" class="tag">Essential</small>
          </span>
          <span class="num cat-total">{{ money2(g.total) }}</span>
          <i class="pi" :class="collapsed[g.name] ? 'pi-chevron-down' : 'pi-chevron-up'" aria-hidden="true"></i>
        </button>
        <div v-if="!collapsed[g.name]" class="subs">
          <div v-for="s in g.subs" :key="s.name" class="sub">
            <div class="sub-row">
              <span>{{ s.name }}</span>
              <span class="num ink2">{{ money2(s.total) }}</span>
            </div>
            <ul class="entries">
              <li v-for="e in s.entries" :key="e.id">
                <button type="button" class="entry" @click="openEntry(e)">
                  <span class="desc">{{ e.description || s.name }}</span>
                  <span class="date muted">{{ dayLabel(e.date) }}</span>
                  <span class="num amt">{{ money2(e.amount) }}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="panel empty-state">
      <h2>{{ query ? 'No matches' : `No ${type === 'expense' ? 'expenses' : type} for ${monthLabel(selectedYm)}` }}</h2>
      <p class="muted">{{ query ? 'Try a different search, or clear it.' : 'Add the first one and it will show up here.' }}</p>
      <Button v-if="!query" label="Add entry" icon="pi pi-plus" @click="openEntry()" />
      <Button v-else label="Clear search" text @click="query = ''" />
    </section>
    <Button class="fab" icon="pi pi-plus" rounded aria-label="Add entry" @click="openEntry()" />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.add-top {
  display: none !important;
  flex: none;
}
.fab {
  position: fixed;
  right: calc(16px + env(safe-area-inset-right, 0px));
  bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px));
  z-index: 21;
  width: 56px !important;
  height: 56px !important;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent);
}
/* room so the last entry can scroll above the button */
.stack {
  padding-bottom: 72px;
}
@media (min-width: 960px) {
  .add-top {
    display: inline-flex !important;
  }
  .fab {
    display: none !important;
  }
  .stack {
    padding-bottom: 0;
  }
}
.toolbar {
  display: grid;
  gap: 10px;
}
@media (min-width: 720px) {
  .toolbar {
    grid-template-columns: auto minmax(0, 320px);
    justify-content: space-between;
    align-items: center;
  }
}
.type-switch {
  display: flex;
  width: 100%;
}
.type-switch :deep(.p-togglebutton) {
  flex: 1;
}
.opt {
  display: grid;
  line-height: 1.15;
  text-align: center;
}
.opt small {
  font-size: 0.7rem;
  opacity: 0.75;
}
.list-panel {
  padding: 0;
  overflow: hidden;
}
.list-head {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 0.8125rem;
  border-bottom: 1px solid var(--line);
}
/* Each category is its own bordered card, so categories read as the top level and
   subcategories as labels inside them. */
.list-panel {
  display: grid;
  gap: 10px;
  padding: 0;
  border: 0;
  background: none;
}
.list-head {
  padding: 0 4px;
  border-bottom: 0;
}
.cat {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  overflow: hidden;
}
.cat-row[aria-expanded='true'] {
  border-bottom: 1px solid var(--line);
  margin-bottom: 10px;
}
.cat-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 0;
  background: var(--panel-2);
  font: inherit;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}
.cat-row:hover {
  background: var(--accent-soft);
}
.cat-name {
  font-size: 1.0625rem;
  font-weight: 650;
}
.tag {
  margin-left: 6px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 6px;
}
.cat-total {
  font-size: 1.0625rem;
  font-weight: 650;
}
.cat-row .pi {
  font-size: 0.75rem;
  color: var(--muted);
}
.subs {
  padding: 0 16px 12px 28px;
  display: grid;
  gap: 14px;
}
.sub-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-2);
  padding: 4px 0 5px;
  border-bottom: 1px solid var(--line);
}
.sub-row .num {
  letter-spacing: 0;
  font-size: 0.8125rem;
}
/* Entries sit indented under their subcategory with a guide line, so the two never read as peers. */
.entries {
  list-style: none;
  margin: 4px 0 0 10px;
  padding: 0 0 0 10px;
  border-left: 1px solid var(--line);
}
.entry {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: baseline;
  padding: 7px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}
.entry:hover {
  background: var(--accent-soft);
}
.desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.date {
  font-size: 0.75rem;
}
.empty-state {
  display: grid;
  gap: 8px;
  justify-items: start;
  padding: 24px 16px;
}
</style>
