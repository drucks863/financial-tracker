import { computed, reactive, watch, type ComputedRef, type WritableComputedRef } from 'vue'

// Shared plumbing for the "Plan" pages (what-if simulators such as Retirement).
//
// A simulator starts from your real numbers (the financial profile, Net worth, Cash flow averages)
// and lets you tweak them without ever touching the saved data:
// - `fromReal()` builds the starting inputs fresh from the store each time it's read. It returns
//   plain numbers (copies), so nothing on the page can write back into the profile.
// - What you tweak is kept as overrides on top: a field you never touched keeps following your real
//   numbers when they change; a field you changed stays where you put it until you reset it.
// - Overrides are remembered in this browser only (localStorage), per simulator. They're scratch
//   work, not data, so they don't go to the server.

/** Numeric inputs only: simulators work on plain numbers, so a copy can't share objects with the store. */
export type ScenarioInputs = Record<string, number>

const STORAGE_PREFIX = 'financial-tracker.scenario.'
const SAME = 1e-9

/** The real inputs with the overrides applied. Overrides for fields no longer in the inputs are ignored. */
export function applyOverrides<T extends ScenarioInputs>(real: T, overrides: Partial<T>): T {
  const result = { ...real }
  for (const key of Object.keys(real) as (keyof T)[]) {
    const value = overrides[key]
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value as T[keyof T]
  }
  return result
}

/** Keeps the overrides that still differ from the real value (setting a field back to it clears the tweak). */
export function cleanOverrides<T extends ScenarioInputs>(real: T, overrides: Partial<T>): Partial<T> {
  const kept: Partial<T> = {}
  for (const key of Object.keys(real) as (keyof T)[]) {
    const value = overrides[key]
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value - real[key]) > SAME) kept[key] = value as T[keyof T]
  }
  return kept
}

function readSaved(key: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
  } catch {
    return {}
  }
}

function writeSaved(key: string, overrides: Record<string, number>): void {
  try {
    if (Object.keys(overrides).length) localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(overrides))
    else localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    /* storage blocked: tweaks just don't survive a reload */
  }
}

export interface Scenario<T extends ScenarioInputs> {
  /** your real numbers, live */
  real: ComputedRef<T>
  /** the real numbers with your tweaks: what the simulator runs on */
  inputs: ComputedRef<T>
  /** a v-model for one input; writing it records a tweak, never a profile change */
  field: (key: keyof T & string) => WritableComputedRef<number>
  changed: (key: keyof T & string) => boolean
  changedCount: ComputedRef<number>
  reset: (key?: keyof T & string) => void
}

/**
 * A what-if copy of your numbers for one simulator. `storageKey` names it in localStorage
 * ("retirement"); `fromReal` builds the starting inputs from the store.
 */
export function useScenario<T extends ScenarioInputs>(storageKey: string, fromReal: () => T): Scenario<T> {
  const real = computed(fromReal)
  const overrides = reactive<Record<string, number>>(readSaved(storageKey))
  const inputs = computed(() => applyOverrides(real.value, overrides as Partial<T>))
  const changed = (key: keyof T & string) => key in overrides && Math.abs(overrides[key] - real.value[key]) > SAME
  const changedCount = computed(() => Object.keys(cleanOverrides(real.value, overrides as Partial<T>)).length)

  const fields = new Map<string, WritableComputedRef<number>>()
  const field = (key: keyof T & string) => {
    let model = fields.get(key)
    if (!model) {
      model = computed<number>({
        get: () => inputs.value[key],
        set: (value) => {
          // a cleared number field gives null: treat it as going back to the real value
          if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value - real.value[key]) <= SAME) delete overrides[key]
          else overrides[key] = value
        }
      })
      fields.set(key, model)
    }
    return model
  }

  function reset(key?: keyof T & string): void {
    for (const name of key ? [key] : Object.keys(overrides)) delete overrides[name]
  }

  watch(overrides, () => writeSaved(storageKey, { ...overrides }), { deep: true })
  return { real, inputs, field, changed, changedCount, reset }
}
