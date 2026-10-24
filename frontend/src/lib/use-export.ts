import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { saveFile, entriesCsv, workbookBytes, netWorthCsv } from './io'
import type { SaveError } from './io'
import { localIso } from './format'

export type ExportKind = 'csv' | 'xlsx' | 'nw'

/** Export actions shared by the Overview download menu and the profile's Import & export tab. */
export function useExport() {
  const toast = useToast()
  const exporting = ref<ExportKind | null>(null)
  const stamp = () => localIso()

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

  return { exporting, doExport }
}
