<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import AutoComplete, { type AutoCompleteCompleteEvent, type AutoCompleteOptionSelectEvent } from 'primevue/autocomplete'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { ui, selectedYm } from '../store/ui'
import { state, categoriesOf, findCategory, saveEntry, deleteEntry, addSubcategory, addCategory } from '../store/finance'
import CategoryIcon from './CategoryIcon.vue'
import { money2, localIso } from '../lib/format'
import { planned, normName as norm, sameName } from '../store/plan'
import type { Entry, EntryType } from '../types'

const toast = useToast()
const TYPES: { label: string; value: EntryType }[] = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' }
]

interface EntryForm {
  id: string | null
  type: EntryType
  date: Date | null
  category: string | null
  subcategory: string | null
  description: string
  amount: number | null
}
type Field = 'description' | 'date' | 'category' | 'subcategory' | 'amount'

const form = reactive<EntryForm>({ id: null, type: 'expense', date: null, category: null, subcategory: null, description: '', amount: null })
const errors = reactive<Partial<Record<Field, string>>>({})
const adding = ref<'category' | 'subcategory' | null>(null)
const newName = ref('')

const isMobile = () => window.matchMedia('(max-width: 640px)').matches

// New entries start at the description; edits start at the amount, the field most often changed.
// The dialog focuses whichever input has autofocus when it opens; this is for "Save and add another".
function focusFirst(): void {
  nextTick(() => document.getElementById(form.id ? 'entry-amount' : 'entry-description')?.focus())
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function defaultDate(): Date {
  const today = new Date()
  const ym = selectedYm.value
  if (localIso(today).startsWith(ym)) return today
  return toDate(`${ym}-01`)
}

watch(
  () => ui.entryDialog.open,
  (open) => {
    if (!open) return
    const e = ui.entryDialog.entry
    clearErrors()
    adding.value = null
    if (e) Object.assign(form, { ...e, date: toDate(e.date) })
    else Object.assign(form, { id: null, type: form.type || 'expense', date: defaultDate(), category: null, subcategory: null, description: '', amount: null })
  }
)

const categoryOptions = computed(() => categoriesOf(form.type).map((c) => c.name))

// Descriptions used before, newest first, each with the entry it last went on. Picking one fills
// in the type, category and subcategory from that entry, so a repeat purchase is one pick
// (new entries only; an edit keeps its category).
const lastByDescription = computed(() => {
  const latest = new Map<string, Entry>()
  for (const e of state.entries) {
    const key = e.description.trim().toLowerCase()
    if (!key) continue
    const seen = latest.get(key)
    if (!seen || e.date > seen.date) latest.set(key, e)
  }
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date))
})
const descriptionSuggestions = ref<string[]>([])
function suggestDescriptions(event: AutoCompleteCompleteEvent): void {
  const q = event.query.trim().toLowerCase()
  const starts = (e: Entry) => e.description.toLowerCase().startsWith(q)
  const ranked = [...lastByDescription.value.filter(starts), ...lastByDescription.value.filter((e) => !starts(e) && e.description.toLowerCase().includes(q))]
  descriptionSuggestions.value = q ? ranked.slice(0, 8).map((e) => e.description.trim()) : []
}
watch(
  () => form.description,
  (d) => d.trim() && delete errors.description
)
const suggestionEntry = (description: string) => lastByDescription.value.find((e) => e.description.trim() === description)
function useDescription(event: AutoCompleteOptionSelectEvent): void {
  delete errors.description
  const e = suggestionEntry(event.value as string)
  if (!e || form.id) return
  // the type and category watchers run after this and keep these, since they match each other
  Object.assign(form, { type: e.type, category: e.category, subcategory: e.subcategory })
  delete errors.category
  delete errors.subcategory
}
const subOptions = computed(() => findCategory(form.type, form.category)?.subcategories || [])

// Suggested amount from the financial profile for the picked category: paycheck take-home for wage income,
// your share for a rent or bill item, or a loan payment. Matched by name.
const suggestion = computed<{ amount: number; label: string } | null>(() => {
  const n = planned.value
  const sub = norm(form.subcategory)
  const cat = norm(form.category)
  if (form.type === 'income') {
    if ((sub.includes('paycheck') || cat.includes('wage')) && n.paycheck.takeHome > 0) return { amount: n.paycheck.takeHome, label: 'take-home per paycheck' }
    return null
  }
  for (const l of n.loans) {
    const name = norm(l.loan.name)
    if (l.balance > 0 && (sameName(sub, name) || (name.includes('mortgage') && cat.includes('mortgage') && sub.includes('mortgage')))) return { amount: l.payment, label: `${l.loan.name} payment` }
  }
  for (const h of n.housing) {
    if (sameName(sub, norm(h.name)) && h.mine > 0) return { amount: Math.round(h.mine * 100) / 100, label: `your share of ${h.name.toLowerCase()}` }
  }
  return null
})
const prefilled = ref(false)
watch(suggestion, (sg) => {
  if (form.id) return
  if (sg && (form.amount === null || prefilled.value)) {
    form.amount = sg.amount
    prefilled.value = true
  } else if (!sg && prefilled.value) {
    form.amount = null
    prefilled.value = false
  }
})
watch(
  () => ui.entryDialog.open,
  () => (prefilled.value = false)
)

watch(
  () => form.type,
  () => {
    if (form.category && !categoryOptions.value.includes(form.category)) form.category = null
  }
)
watch(
  () => form.category,
  () => {
    if (!form.subcategory || !subOptions.value.includes(form.subcategory)) form.subcategory = subOptions.value.length === 1 ? subOptions.value[0] : null
  }
)

function startAdd(kind: 'category' | 'subcategory'): void {
  adding.value = kind
  newName.value = ''
}
function confirmAdd() {
  const name = newName.value.trim()
  if (!name) return
  if (adding.value === 'category') {
    const cat = addCategory({ type: form.type, name })
    if (!cat) return toast.add({ severity: 'warn', summary: `“${name}” already exists`, life: 2500 })
    form.category = cat.name
    form.subcategory = cat.subcategories[0]
  } else {
    const cat = findCategory(form.type, form.category)
    if (!cat || !addSubcategory(cat, name)) return toast.add({ severity: 'warn', summary: `“${name}” already exists`, life: 2500 })
    form.subcategory = name
  }
  adding.value = null
}

function pickCategory(name: string): void {
  form.category = name
  delete errors.category
}
function pickSubcategory(name: string): void {
  form.subcategory = name
  delete errors.subcategory
}

function clearErrors(): void {
  for (const k of Object.keys(errors) as Field[]) delete errors[k]
}

function validate(): boolean {
  clearErrors()
  if (!form.description.trim()) errors.description = 'Enter a description'
  if (!form.date) errors.date = 'Pick a date'
  if (!form.category) errors.category = 'Pick a category'
  if (!form.subcategory) errors.subcategory = 'Pick a subcategory'
  if (form.amount == null || form.amount === 0) errors.amount = 'Enter an amount'
  return !Object.keys(errors).length
}

function save(another = false): void {
  if (!validate() || !form.description.trim() || !form.date || !form.category || !form.subcategory || form.amount === null) return
  const saved = saveEntry({
    id: form.id,
    type: form.type,
    date: localIso(form.date),
    category: form.category,
    subcategory: form.subcategory,
    description: form.description.trim(),
    amount: form.amount
  })
  toast.add({ severity: 'success', summary: form.id ? 'Entry updated' : 'Entry added', detail: `${saved.subcategory} · ${money2(saved.amount)}`, life: 2200 })
  // jump the month strip to where the entry landed
  ui.year = +saved.date.slice(0, 4)
  ui.month = +saved.date.slice(5, 7) - 1
  if (another) {
    Object.assign(form, { id: null, description: '', amount: null })
    focusFirst()
  } else ui.entryDialog.open = false
}

const confirmingDelete = ref(false)
watch(() => ui.entryDialog.open, () => (confirmingDelete.value = false))
function remove(): void {
  if (form.id) deleteEntry(form.id)
  toast.add({ severity: 'info', summary: 'Entry deleted', life: 2000 })
  ui.entryDialog.open = false
}
</script>

<template>
  <Dialog
    v-model:visible="ui.entryDialog.open"
    modal
    :header="form.id ? 'Edit entry' : 'Add entry'"
    :position="isMobile() ? 'bottom' : 'center'"
    :style="{ width: 'min(480px, 100vw)' }"
    :pt="{ root: { class: 'entry-dialog' } }"
    :draggable="false"
    dismissable-mask
  >
    <form class="entry-form" @submit.prevent="save(false)">
      <div class="field">
        <label for="entry-description">Description</label>
        <AutoComplete
          v-model="form.description"
          input-id="entry-description"
          :suggestions="descriptionSuggestions"
          :delay="0"
          :show-empty-message="false"
          placeholder="e.g. Publix, Shell, Paycheck"
          :invalid="!!errors.description"
          :pt="{ pcInputText: { root: { autofocus: !form.id } } }"
          fluid
          @complete="suggestDescriptions"
          @option-select="useDescription"
        >
          <template #option="{ option }">
            <span class="suggestion">
              <CategoryIcon v-if="suggestionEntry(option)" :name="suggestionEntry(option)!.category" :type="suggestionEntry(option)!.type" size="sm" />
              <span class="suggestion-text">{{ option }}</span>
              <small v-if="suggestionEntry(option)" class="muted">{{ suggestionEntry(option)!.category }} › {{ suggestionEntry(option)!.subcategory }}</small>
            </span>
          </template>
        </AutoComplete>
        <small v-if="errors.description" class="err">{{ errors.description }}</small>
      </div>

      <SelectButton v-model="form.type" :options="TYPES" option-label="label" option-value="value" :allow-empty="false" aria-label="Entry type" fluid />

      <div class="row-2">
        <label class="field">
          <span>Amount</span>
          <InputNumber
            v-model="form.amount"
            input-id="entry-amount"
            mode="currency"
            currency="USD"
            locale="en-US"
            :invalid="!!errors.amount"
            :autofocus="!!form.id"
            fluid
          />
          <small v-if="errors.amount" class="err">{{ errors.amount }}</small>
          <small v-else-if="prefilled && suggestion && form.amount === suggestion.amount" class="hint">From your profile: {{ suggestion.label }}</small>
          <button v-else-if="!form.id && suggestion && form.amount !== suggestion.amount" type="button" class="link hint-btn" @click="form.amount = suggestion.amount">
            Use {{ money2(suggestion.amount) }} ({{ suggestion.label }})
          </button>
          <small v-else-if="form.amount !== null && form.amount < 0" class="hint">
            {{ form.type === 'expense' ? 'A negative expense counts as a refund and adds back to the month.' : 'A negative income entry lowers the month’s income.' }}
          </small>
        </label>
        <label class="field">
          <span>Date</span>
          <DatePicker v-model="form.date" input-id="entry-date" date-format="M d, yy" :invalid="!!errors.date" fluid :touch-u-i="false" />
          <small v-if="errors.date" class="err">{{ errors.date }}</small>
        </label>
      </div>

      <div class="field" role="radiogroup" aria-labelledby="entry-category-label">
        <div class="field-label">
          <span id="entry-category-label">Category</span>
          <button type="button" class="link" @click="startAdd('category')">New category</button>
        </div>
        <div class="chips" :class="{ invalid: !!errors.category }">
          <button
            v-for="c in categoryOptions"
            :key="c"
            type="button"
            role="radio"
            class="chip"
            :aria-checked="form.category === c"
            @click="pickCategory(c)"
          >
            <CategoryIcon :name="c" :type="form.type" size="sm" />
            <span>{{ c }}</span>
          </button>
        </div>
        <small v-if="errors.category" class="err">{{ errors.category }}</small>
      </div>

      <div v-if="form.category" class="field" role="radiogroup" aria-labelledby="entry-subcategory-label">
        <div class="field-label">
          <span id="entry-subcategory-label">Subcategory</span>
          <button type="button" class="link" @click="startAdd('subcategory')">New subcategory</button>
        </div>
        <div class="chips" :class="{ invalid: !!errors.subcategory }">
          <button
            v-for="sub in subOptions"
            :key="sub"
            type="button"
            role="radio"
            class="chip plain"
            :aria-checked="form.subcategory === sub"
            @click="pickSubcategory(sub)"
          >
            {{ sub }}
          </button>
        </div>
        <small v-if="errors.subcategory" class="err">{{ errors.subcategory }}</small>
      </div>

      <div v-if="adding" class="add-inline">
        <InputText
          id="entry-new-name"
          v-model="newName"
          :placeholder="adding === 'category' ? `New ${form.type} category` : `New subcategory in ${form.category}`"
          fluid
          @keydown.enter.prevent="confirmAdd"
        />
        <Button type="button" label="Add" size="small" @click="confirmAdd" />
        <Button type="button" label="Cancel" size="small" text severity="secondary" @click="adding = null" />
      </div>

      <div class="actions">
        <template v-if="form.id && confirmingDelete">
          <span class="ink2 confirm-text">Delete this entry?</span>
          <Button type="button" label="Keep" text severity="secondary" @click="confirmingDelete = false" />
          <Button type="button" label="Delete" severity="danger" @click="remove" />
        </template>
        <template v-else>
          <Button v-if="form.id" type="button" icon="pi pi-trash" text severity="danger" aria-label="Delete entry" @click="confirmingDelete = true" />
          <span class="spacer"></span>
          <Button v-if="!form.id" type="button" label="Save and add another" text @click="save(true)" />
          <Button type="submit" :label="form.id ? 'Save changes' : 'Save entry'" />
        </template>
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.entry-form {
  display: grid;
  gap: 14px;
}
.row-2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.field > span,
.field > label,
.field-label > span {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink-2);
}
.field-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.link {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--accent);
  cursor: pointer;
}
/* Categories and subcategories are tap targets instead of dropdowns: one tap, and every
   category's icon is in view at once. */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px;
  border-radius: 10px;
}
.chips.invalid {
  outline: 1px solid var(--bad);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 10px 4px 5px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.chip.plain {
  padding: 4px 12px;
}
.chip:hover {
  background: var(--accent-soft);
}
.chip[aria-checked='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent);
  font-weight: 600;
}
.chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.suggestion {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 8px;
  align-items: center;
}
.suggestion small {
  grid-column: 2;
  font-size: 0.75rem;
}
.suggestion-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.add-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border-radius: 10px;
  background: var(--accent-soft);
}
.err {
  color: var(--bad);
}
.hint {
  color: var(--muted);
  font-size: 0.75rem;
}
.hint-btn {
  justify-self: start;
  font-size: 0.75rem;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 4px;
}
.spacer {
  flex: 1;
}
.confirm-text {
  flex: 1;
}
</style>

<style>
@media (max-width: 640px) {
  .entry-dialog.p-dialog {
    margin: 0 !important;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    max-height: 92vh;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
</style>
