<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import {
  state,
  categoriesOf,
  addCategory,
  renameCategory,
  addSubcategory,
  renameSubcategory,
  removeSubcategory,
  removeCategory,
  entriesUsing,
  ensureCategory,
  uid,
  resetToSheetData
} from '../store/finance'
import { saveFile, entriesCsv, workbookBytes, netWorthCsv, parseEntriesFile, parseCashFlowWorkbook, parseNetWorthWorkbook } from '../lib/io'
import { money, money2, shortDate } from '../lib/format'
import type { ParsedEntries, ParsedNetWorth, SaveError } from '../lib/io'
import type { Category, EntryType } from '../types'

const toast = useToast()

/* ---------- export ---------- */
type ExportKind = 'csv' | 'xlsx' | 'nw'
const exporting = ref<ExportKind | null>(null)
const stamp = () => new Date().toISOString().slice(0, 10)
async function doExport(kind: ExportKind): Promise<void> {
  exporting.value = kind
  try {
    if (kind === 'csv') await saveFile(`entries-${stamp()}.csv`, entriesCsv())
    if (kind === 'xlsx') await saveFile(`financial-tracker-${stamp()}.xlsx`, new Blob([workbookBytes()]))
    if (kind === 'nw') await saveFile(`net-worth-${stamp()}.csv`, netWorthCsv())
    toast.add({ severity: 'success', summary: 'Export ready', detail: 'Check your downloads.', life: 2500 })
  } catch (err) {
    const e = err as Partial<SaveError>
    if (e?.code !== 'declined') toast.add({ severity: 'warn', summary: 'Export not saved', detail: e?.message || 'Saving files is not available here.', life: 4000 })
  } finally {
    exporting.value = null
  }
}

/* ---------- import ---------- */
type ImportKind = 'entries' | 'cashflow' | 'networth'
type ImportResult = { kind: 'entries'; data: ParsedEntries } | { kind: 'networth'; data: ParsedNetWorth }

const KINDS: { label: string; value: ImportKind }[] = [
  { label: 'Entries file', value: 'entries' },
  { label: 'Cash Flow workbook', value: 'cashflow' },
  { label: 'Net worth tracker', value: 'networth' }
]
const imp = reactive({
  kind: 'entries' as ImportKind,
  year: new Date().getFullYear() - 1,
  file: null as File | null,
  result: null as ImportResult | null,
  replace: true,
  busy: false,
  error: null as string | null
})
const fileInput = ref<HTMLInputElement | null>(null)

function pick() {
  fileInput.value?.click()
}
async function onFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  imp.file = f
  await parse()
}
async function parse() {
  if (!imp.file) return
  imp.busy = true
  imp.error = null
  imp.result = null
  try {
    if (imp.kind === 'entries') imp.result = { kind: 'entries', data: await parseEntriesFile(imp.file) }
    else if (imp.kind === 'cashflow') imp.result = { kind: 'entries', data: await parseCashFlowWorkbook(imp.file, imp.year) }
    else imp.result = { kind: 'networth', data: await parseNetWorthWorkbook(imp.file) }
  } catch (e) {
    imp.error = `Could not read ${imp.file.name}. Use a .csv or .xlsx file. (${e instanceof Error ? e.message : String(e)})`
  } finally {
    imp.busy = false
  }
}

const preview = computed(() => {
  if (!imp.result) return null
  if (imp.result.kind === 'networth') {
    const r = imp.result.data
    return { networth: true as const, accounts: r.accounts, dates: r.dates, problems: r.problems }
  }
  const r = imp.result.data
  const months = [...new Set(r.entries.map((e) => e.date.slice(0, 7)))].sort()
  const newCats = new Set<string>()
  for (const e of r.entries) {
    const cat = state.categories.find((c) => c.type === e.type && c.name === e.category)
    if (!cat) newCats.add(`${e.category}`)
    else if (!cat.subcategories.includes(e.subcategory)) newCats.add(`${e.category} › ${e.subcategory}`)
  }
  const existing = state.entries.filter((e) => months.includes(e.date.slice(0, 7))).length
  const sum = (t: EntryType) => r.entries.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0)
  return {
    networth: false as const,
    count: r.entries.length,
    months,
    newCats: [...newCats],
    existing,
    income: sum('income'),
    expense: sum('expense'),
    sample: r.entries.slice(0, 6),
    problems: r.problems
  }
})

function commitImport(): void {
  if (!imp.result) return
  if (imp.result.kind === 'networth') {
    const r = imp.result.data
    const accts = state.netWorth.accounts
    for (const a of r.accounts) {
      let acct = accts.find((x) => x.name.toLowerCase() === a.name.toLowerCase())
      if (!acct) {
        acct = { id: uid('a'), name: a.name, group: a.group }
        accts.push(acct)
      }
      for (const [date, v] of Object.entries(a.values)) {
        let snap = state.netWorth.snapshots.find((s) => s.date === date)
        if (!snap) state.netWorth.snapshots.push((snap = { date, values: {} }))
        snap.values[acct.id] = v
      }
    }
    toast.add({ severity: 'success', summary: 'Net worth imported', detail: `${r.accounts.length} accounts, ${r.dates.length} months`, life: 3000 })
  } else {
    const r = imp.result.data
    if (r.categories) for (const c of r.categories) for (const s of c.subcategories) ensureCategory(c.type, c.name, s)
    const months = new Set(r.entries.map((e) => e.date.slice(0, 7)))
    if (imp.replace) state.entries = state.entries.filter((e) => !months.has(e.date.slice(0, 7)))
    for (const e of r.entries) {
      ensureCategory(e.type, e.category, e.subcategory)
      state.entries.push({ ...e, id: uid() })
    }
    toast.add({ severity: 'success', summary: 'Entries imported', detail: `${r.entries.length} entries across ${months.size} months`, life: 3000 })
  }
  imp.result = null
  imp.file = null
}

/* ---------- categories ---------- */
const catType = ref<EntryType>('expense')
const CAT_TYPES: { label: string; value: EntryType }[] = [
  { label: 'Expenses', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Savings', value: 'savings' }
]
const cats = computed(() => categoriesOf(catType.value))
const newCat = ref('')
const newSub = reactive<Record<string, string>>({})
const editing = reactive({ key: null as string | null, value: '' })
const openCats = reactive<Record<string, boolean>>({})

function createCategory() {
  const c = addCategory({ type: catType.value, name: newCat.value })
  if (!c) return toast.add({ severity: 'warn', summary: newCat.value.trim() ? 'That category already exists' : 'Type a name first', life: 2500 })
  openCats[c.id] = true
  newCat.value = ''
}
function createSub(cat: Category): void {
  if (!addSubcategory(cat, newSub[cat.id] || '')) return toast.add({ severity: 'warn', summary: 'Type a new subcategory name', life: 2500 })
  newSub[cat.id] = ''
}
function startEdit(key: string, value: string): void {
  editing.key = key
  editing.value = value
}
function commitEdit(cat: Category, sub?: string): void {
  const ok = sub ? renameSubcategory(cat, sub, editing.value) : renameCategory(cat, editing.value)
  if (!ok && editing.value.trim() !== (sub || cat.name)) toast.add({ severity: 'warn', summary: 'That name is empty or already used', life: 2500 })
  editing.key = null
}
function tryRemoveSub(cat: Category, sub: string): void {
  if (!removeSubcategory(cat, sub)) toast.add({ severity: 'warn', summary: `${sub} still has ${entriesUsing(cat, sub)} entries`, detail: 'Move or delete them first.', life: 3500 })
}
function tryRemoveCat(cat: Category): void {
  if (!removeCategory(cat)) toast.add({ severity: 'warn', summary: `${cat.name} still has ${entriesUsing(cat)} entries`, detail: 'Move or delete them first.', life: 3500 })
}

/* ---------- subscriptions ---------- */
const subsMonthly = computed(() =>
  state.subscriptions.reduce((a, s) => {
    const p = typeof s.price === 'number' ? s.price : 0
    const f = (s.frequency || '').toLowerCase()
    return a + (f.startsWith('year') ? p / 12 : f.startsWith('semi') ? p / 6 : p)
  }, 0)
)

/* ---------- reset ---------- */
const confirmReset = ref(false)
function reset() {
  resetToSheetData()
  confirmReset.value = false
  toast.add({ severity: 'info', summary: 'Data reset to your sheet values', life: 2500 })
}
</script>

<template>
  <div class="stack">
    <header>
      <h1>Data</h1>
      <p class="muted">Import past years, export everything, and manage your categories</p>
    </header>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Export</h2>
            <p class="muted">{{ state.entries.length }} entries · {{ state.netWorth.snapshots.length }} net worth snapshots</p>
          </div>
        </div>
        <div class="export-list">
          <button type="button" class="export" :disabled="!!exporting" @click="doExport('xlsx')">
            <i class="pi pi-file-excel" aria-hidden="true"></i>
            <span>
              <strong>Everything as Excel</strong>
              <small class="muted">Entries, monthly summary, Expenses and Income grids per year, net worth, categories</small>
            </span>
            <i class="pi" :class="exporting === 'xlsx' ? 'pi-spin pi-spinner' : 'pi-download'" aria-hidden="true"></i>
          </button>
          <button type="button" class="export" :disabled="!!exporting" @click="doExport('csv')">
            <i class="pi pi-file" aria-hidden="true"></i>
            <span>
              <strong>Entries as CSV</strong>
              <small class="muted">One row per entry. Re-imports cleanly.</small>
            </span>
            <i class="pi" :class="exporting === 'csv' ? 'pi-spin pi-spinner' : 'pi-download'" aria-hidden="true"></i>
          </button>
          <button type="button" class="export" :disabled="!!exporting" @click="doExport('nw')">
            <i class="pi pi-chart-line" aria-hidden="true"></i>
            <span>
              <strong>Net worth as CSV</strong>
              <small class="muted">Accounts by month-end date</small>
            </span>
            <i class="pi" :class="exporting === 'nw' ? 'pi-spin pi-spinner' : 'pi-download'" aria-hidden="true"></i>
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Import</h2>
            <p class="muted">CSV or Excel. Download a Google Sheet with File › Download › Microsoft Excel.</p>
          </div>
        </div>
        <div class="imp">
          <SelectButton v-model="imp.kind" :options="KINDS" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Import type" @change="parse" />
          <p class="ink2 small" v-if="imp.kind === 'entries'">
            Columns: <strong>Date, Type, Category, Subcategory, Description, Amount</strong>. Type is Income, Expense or Savings. New categories are created for you.
          </p>
          <div v-else-if="imp.kind === 'cashflow'" class="cf-year">
            <p class="ink2 small">Reads a Cash Flow workbook laid out like your ’26 sheet: the Expenses and Income tabs plus each month tab’s itemized lines.</p>
            <label class="year-field">
              <span class="small ink2">Year this workbook covers</span>
              <InputNumber v-model="imp.year" input-id="import-year" :use-grouping="false" :min="2000" :max="2100" show-buttons size="small" @update:model-value="parse" />
            </label>
          </div>
          <p class="ink2 small" v-else>Reads the “Net Worth Tracker” tab: month-end dates across the top, accounts under Cash, Investment Accounts, Other Assets and Debt.</p>

          <input ref="fileInput" type="file" accept=".csv,.xlsx,.xls,text/csv" class="hidden-input" @change="onFile" />
          <Button :label="imp.file ? `Choose a different file` : 'Choose file'" icon="pi pi-upload" outlined :loading="imp.busy" @click="pick" />
          <p v-if="imp.file" class="small muted">{{ imp.file.name }}</p>

          <Message v-if="imp.error" severity="error" size="small">{{ imp.error }}</Message>

          <div v-if="preview" class="preview">
            <template v-if="preview.networth">
              <p>
                <strong>{{ preview.accounts.length }} accounts</strong> across <strong>{{ preview.dates.length }} months</strong>
                <span v-if="preview.dates.length" class="muted"> ({{ shortDate(preview.dates[0]) }} to {{ shortDate(preview.dates[preview.dates.length - 1]) }})</span>
              </p>
              <ul class="small ink2 plain">
                <li v-for="a in preview.accounts" :key="a.name">{{ a.name }} <span class="muted">· {{ a.group }}</span></li>
              </ul>
              <p class="small muted">Matching months are updated; other months are kept.</p>
            </template>
            <template v-else>
              <p>
                <strong>{{ preview.count }} entries</strong> across <strong>{{ preview.months.length }} months</strong>:
                <span class="num">{{ money(preview.income) }}</span> income, <span class="num">{{ money(preview.expense) }}</span> expenses
              </p>
              <p v-if="preview.newCats.length" class="small ink2">Adds {{ preview.newCats.length }} new: {{ preview.newCats.slice(0, 6).join(', ') }}{{ preview.newCats.length > 6 ? '…' : '' }}</p>
              <div class="table-scroll">
                <table class="sample">
                  <tbody>
                    <tr v-for="(e, i) in preview.sample" :key="i">
                      <td>{{ e.date }}</td>
                      <td>{{ e.category }} › {{ e.subcategory }}</td>
                      <td>{{ e.description }}</td>
                      <td class="num r">{{ money2(e.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <label v-if="preview.existing" class="replace">
                <Checkbox v-model="imp.replace" binary input-id="import-replace" />
                <span class="small">Replace the {{ preview.existing }} entries already in those months</span>
              </label>
            </template>
            <ul v-if="preview.problems?.length" class="small muted plain">
              <li v-for="p in preview.problems.slice(0, 5)" :key="p">{{ p }}</li>
            </ul>
            <div class="row-actions">
              <Button label="Cancel" text severity="secondary" @click="(imp.result = null), (imp.file = null)" />
              <Button :label="preview.networth ? 'Import net worth' : `Import ${preview.count} entries`" :disabled="preview.networth ? !preview.accounts.length : !preview.count" @click="commitImport" />
            </div>
          </div>
        </div>
      </section>

      <section class="panel span-2">
        <div class="panel-head">
          <div>
            <h2>Categories</h2>
            <p class="muted">Start from your sheet’s categories. Add, rename, or remove; renames carry over to existing entries.</p>
          </div>
          <SelectButton v-model="catType" :options="CAT_TYPES" option-label="label" option-value="value" :allow-empty="false" size="small" aria-label="Category type" />
        </div>

        <form class="add-row" @submit.prevent="createCategory">
          <InputText id="new-category" v-model="newCat" :placeholder="`New ${catType} category`" fluid />
          <Button type="submit" label="Add category" icon="pi pi-plus" outlined />
        </form>

        <ul class="cats">
          <li v-for="cat in cats" :key="cat.id" class="cat">
            <div class="cat-line">
              <button type="button" class="chev" :aria-expanded="!!openCats[cat.id]" :aria-label="`Show subcategories of ${cat.name}`" @click="openCats[cat.id] = !openCats[cat.id]">
                <i class="pi" :class="openCats[cat.id] ? 'pi-chevron-down' : 'pi-chevron-right'" aria-hidden="true"></i>
              </button>
              <InputText
                v-if="editing.key === cat.id"
                :id="`rename-${cat.id}`"
                v-model="editing.value"
                size="small"
                autofocus
                @keydown.enter.prevent="commitEdit(cat)"
                @keydown.esc="editing.key = null"
                @blur="commitEdit(cat)"
              />
              <button v-else type="button" class="name" @click="openCats[cat.id] = !openCats[cat.id]">
                {{ cat.name }} <small class="muted">{{ cat.subcategories.length }} sub · {{ entriesUsing(cat) }} entries</small>
              </button>
              <label v-if="cat.type === 'expense'" class="flag">
                <ToggleSwitch v-model="cat.essential" :input-id="`ess-${cat.id}`" />
                <span class="small ink2">Essential</span>
              </label>
              <label v-if="cat.type === 'savings'" class="flag">
                <ToggleSwitch v-model="cat.fromPaycheck" :input-id="`pay-${cat.id}`" />
                <span class="small ink2">From paycheck</span>
              </label>
              <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" :aria-label="`Rename ${cat.name}`" @click="startEdit(cat.id, cat.name)" />
              <Button icon="pi pi-trash" text rounded size="small" severity="secondary" :aria-label="`Remove ${cat.name}`" @click="tryRemoveCat(cat)" />
            </div>
            <div v-if="openCats[cat.id]" class="subs">
              <div v-for="sub in cat.subcategories" :key="sub" class="sub-line">
                <InputText
                  v-if="editing.key === cat.id + '/' + sub"
                  :id="`rename-${cat.id}-${sub}`"
                  v-model="editing.value"
                  size="small"
                  autofocus
                  @keydown.enter.prevent="commitEdit(cat, sub)"
                  @keydown.esc="editing.key = null"
                  @blur="commitEdit(cat, sub)"
                />
                <span v-else class="sub-name">{{ sub }} <small class="muted">{{ entriesUsing(cat, sub) }}</small></span>
                <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" :aria-label="`Rename ${sub}`" @click="startEdit(cat.id + '/' + sub, sub)" />
                <Button icon="pi pi-times" text rounded size="small" severity="secondary" :aria-label="`Remove ${sub}`" @click="tryRemoveSub(cat, sub)" />
              </div>
              <form class="add-row small-row" @submit.prevent="createSub(cat)">
                <InputText :id="`new-sub-${cat.id}`" v-model="newSub[cat.id]" placeholder="New subcategory" size="small" fluid />
                <Button type="submit" label="Add" size="small" outlined />
              </form>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Subscriptions</h2>
            <p class="muted num">About {{ money(subsMonthly) }} a month, from your Subscriptions tab</p>
          </div>
        </div>
        <table class="subs-t">
          <tbody>
            <tr v-for="s in state.subscriptions" :key="s.service">
              <td>
                {{ s.service }}
                <small class="muted">{{ s.frequency }} · {{ s.when }} · {{ s.from }}</small>
              </td>
              <td><span class="tag">{{ s.category }}</span></td>
              <td class="num r">{{ typeof s.price === 'number' ? money2(s.price) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Prototype data</h2>
            <p class="muted">Changes are saved in this browser only. The real app will save to your account.</p>
          </div>
        </div>
        <div class="row-actions start">
          <template v-if="confirmReset">
            <span class="ink2 small">Replace everything here with your sheet’s values?</span>
            <Button label="Keep my changes" text severity="secondary" @click="confirmReset = false" />
            <Button label="Reset" severity="danger" @click="reset" />
          </template>
          <Button v-else label="Reset to sheet data" icon="pi pi-refresh" outlined severity="secondary" @click="confirmReset = true" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.small {
  font-size: 0.8125rem;
}
.r {
  text-align: right;
}
.export-list {
  display: grid;
  gap: 8px;
}
.export {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: none;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.export:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.export > .pi:first-child {
  font-size: 1.15rem;
  color: var(--accent);
}
.export span {
  display: grid;
  gap: 2px;
}
.export small {
  font-size: 0.75rem;
}
.imp {
  display: grid;
  gap: 12px;
  justify-items: start;
}
.imp > * {
  max-width: 100%;
}
.cf-year {
  display: grid;
  gap: 10px;
}
.year-field {
  display: grid;
  gap: 4px;
}
.hidden-input {
  display: none;
}
.preview {
  width: 100%;
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--accent-soft);
}
.plain {
  margin: 0;
  padding-left: 18px;
}
.sample {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  white-space: nowrap;
}
.sample td {
  padding: 4px 8px 4px 0;
  border-top: 1px solid var(--line);
}
.replace {
  display: flex;
  gap: 8px;
  align-items: center;
}
.row-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
  align-items: center;
}
.row-actions.start {
  justify-content: flex-start;
}
.add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-bottom: 12px;
}
.small-row {
  margin: 4px 0 0;
}
.cats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
@media (min-width: 960px) {
  .cats {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 24px;
  }
}
.cat {
  border-top: 1px solid var(--line);
  padding: 4px 0;
}
.cat-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
}
.chev {
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  padding: 6px;
}
.name {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  padding: 6px 0;
}
.name small {
  font-weight: 400;
  margin-left: 4px;
}
.flag {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
}
.subs {
  padding: 0 0 10px 34px;
  display: grid;
  gap: 2px;
}
.sub-line {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.875rem;
}
.sub-name {
  flex: 1;
}
.subs-t {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.subs-t td {
  padding: 7px 0;
  border-top: 1px solid var(--line);
  vertical-align: top;
}
.subs-t td small {
  display: block;
  font-size: 0.75rem;
}
.subs-t td + td {
  padding-left: 8px;
}
.tag {
  font-size: 0.6875rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 6px;
  color: var(--ink-2);
  white-space: nowrap;
}
</style>
