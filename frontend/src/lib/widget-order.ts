import { ref, type Ref } from 'vue'

// Drag-to-reorder for a set of dashboard widgets. Widgets keep their place in the DOM and are
// positioned with CSS `order`, so reordering never remounts charts. Pointer events cover mouse
// and touch; arrow keys on a handle move its widget for keyboard users. The order is a per-browser
// convenience (localStorage), not app data.

export interface WidgetOrder {
  order: Ref<string[]>
  dragging: Ref<string | null>
  /** CSS `order` value for a widget. */
  pos: (id: string) => number
  onHandleDown: (id: string, e: PointerEvent) => void
  onHandleKey: (id: string, e: KeyboardEvent) => void
  reset: () => void
}

function load(key: string, ids: string[]): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]') as unknown
    if (Array.isArray(saved)) {
      const known = saved.filter((id): id is string => ids.includes(id as string))
      return [...known, ...ids.filter((id) => !known.includes(id))]
    }
  } catch {
    // storage blocked or corrupt; fall back to the default order
  }
  return [...ids]
}

function save(key: string, order: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(order))
  } catch {
    // not critical
  }
}

export function useWidgetOrder(key: string, ids: string[]): WidgetOrder {
  const order = ref(load(key, ids))
  const dragging = ref<string | null>(null)

  const move = (id: string, to: number) => {
    const next = order.value.filter((x) => x !== id)
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id)
    order.value = next
  }

  const onHandleDown = (id: string, e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    dragging.value = id

    const onMove = (ev: PointerEvent) => {
      const over = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .map((el) => (el as HTMLElement).closest<HTMLElement>('[data-widget]'))
        .find((el) => el && el.dataset.widget !== id)
      if (!over) return
      const target = over.dataset.widget!
      const r = over.getBoundingClientRect()
      const from = order.value.indexOf(id)
      const at = order.value.indexOf(target)
      // Only swap once the pointer passes the target's midpoint, so it doesn't flicker on the edge.
      // Widgets side by side compare on x, stacked ones on y.
      const self = document.querySelector<HTMLElement>(`[data-widget="${id}"]`)?.getBoundingClientRect()
      const sideBySide = !!self && Math.abs(self.top - r.top) < 24
      const p = sideBySide ? ev.clientX : ev.clientY
      const mid = sideBySide ? r.left + r.width / 2 : r.top + r.height / 2
      if (at > from ? p > mid : p < mid) move(id, at)
      // Keep the dragged widget in view on long pages.
      if (ev.clientY < 60) window.scrollBy(0, -12)
      else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 12)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      dragging.value = null
      save(key, order.value)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const onHandleKey = (id: string, e: KeyboardEvent) => {
    const step = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    e.preventDefault()
    move(id, order.value.indexOf(id) + step)
    save(key, order.value)
  }

  const reset = () => {
    order.value = [...ids]
    save(key, order.value)
  }

  return { order, dragging, pos: (id) => order.value.indexOf(id), onHandleDown, onHandleKey, reset }
}
