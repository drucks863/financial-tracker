<script setup>
import { computed, reactive, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { ui, selectedYm } from '../store/ui'
import { categoriesOf, findCategory, saveEntry, deleteEntry, addSubcategory, addCategory } from '../store/finance'
import { money2 } from '../lib/format'

const toast = useToast()
const TYPES = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Savings', value: 'savings' }
]

const form = reactive({ id: null, type: 'expense', date: null, category: null, subcategory: null, description: '', amount: null })
const errors = reactive({})
const adding = ref(null) // 'category' | 'subcategory' | null
const newName = ref('')

const isMobile = () => window.matchMedia('(max-width: 640px)').matches

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function defaultDate() {
  const today = new Date()
  const ym = selectedYm.value
  if (toIso(today).startsWith(ym)) return today
  return toDate(`${ym}-01`)
}

watch(
  () => ui.entryDialog.open,
  (open) => {
    if (!open) return
    const e = ui.entryDialog.entry
    Object.keys(errors).forEach((k) => delete errors[k])
    adding.value = null
    if (e) Object.assign(form, { ...e, date: toDate(e.date) })
    else Object.assign(form, { id: null, type: form.type || 'expense', date: defaultDate(), category: null, subcategory: null, description: '', amount: null })
  }
)

const categoryOptions = computed(() => categoriesOf(form.type).map((c) => c.name))
const subOptions = computed(() => findCategory(form.type, form.category)?.subcategories || [])

watch(
  () => form.type,
  () => {
    if (!categoryOptions.value.includes(form.category)) form.category = null
  }
)
watch(
  () => form.category,
  () => {
    if (!subOptions.value.includes(form.subcategory)) form.subcategory = subOptions.value.length === 1 ? subOptions.value[0] : null
  }
)

function startAdd(kind) {
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

function validate() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.date) errors.date = 'Pick a date'
  if (!form.category) errors.category = 'Pick a category'
  if (!form.subcategory) errors.subcategory = 'Pick a subcategory'
  if (form.amount == null || form.amount === 0) errors.amount = 'Enter an amount'
  return !Object.keys(errors).length
}

function save(another = false) {
  if (!validate()) return
  const saved = saveEntry({ ...form, date: toIso(form.date), description: form.description.trim() })
  toast.add({ severity: 'success', summary: form.id ? 'Entry updated' : 'Entry added', detail: `${saved.subcategory} · ${money2(saved.amount)}`, life: 2200 })
  // jump the month strip to where the entry landed
  ui.year = +saved.date.slice(0, 4)
  ui.month = +saved.date.slice(5, 7) - 1
  if (another) Object.assign(form, { id: null, description: '', amount: null })
  else ui.entryDialog.open = false
}

const confirmingDelete = ref(false)
watch(() => ui.entryDialog.open, () => (confirmingDelete.value = false))
function remove() {
  deleteEntry(form.id)
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
            fluid
            autofocus
          />
          <small v-if="errors.amount" class="err">{{ errors.amount }}</small>
        </label>
        <label class="field">
          <span>Date</span>
          <DatePicker v-model="form.date" input-id="entry-date" date-format="M d, yy" :invalid="!!errors.date" fluid :touch-u-i="false" />
          <small v-if="errors.date" class="err">{{ errors.date }}</small>
        </label>
      </div>

      <div class="field">
        <div class="field-label">
          <label for="entry-category">Category</label>
          <button type="button" class="link" @click="startAdd('category')">New category</button>
        </div>
        <Select v-model="form.category" input-id="entry-category" :options="categoryOptions" placeholder="Choose a category" :invalid="!!errors.category" fluid />
        <small v-if="errors.category" class="err">{{ errors.category }}</small>
      </div>

      <div class="field">
        <div class="field-label">
          <label for="entry-subcategory">Subcategory</label>
          <button v-if="form.category" type="button" class="link" @click="startAdd('subcategory')">New subcategory</button>
        </div>
        <Select
          v-model="form.subcategory"
          input-id="entry-subcategory"
          :options="subOptions"
          :placeholder="form.category ? 'Choose a subcategory' : 'Choose a category first'"
          :disabled="!form.category"
          :invalid="!!errors.subcategory"
          fluid
        />
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

      <label class="field">
        <span>Description <em class="muted">(optional)</em></span>
        <InputText id="entry-description" v-model="form.description" placeholder="e.g. Publix, Shell, Paycheck" fluid />
      </label>

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
.field-label label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink-2);
}
.field em {
  font-style: normal;
  font-weight: 400;
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
