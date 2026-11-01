import { onBeforeUnmount, type Ref } from 'vue'

// PrimeVue's Popover stays put when the page scrolls, so on a phone it floats away from the
// thing you tapped and covers the screen. This closes it as soon as anything that holds the
// anchor scrolls (the page, or a scroll area around it). Scrolling inside the popover itself,
// or a dropdown list it opened, doesn't count.
// Usage: const { onShow, onHide } = useCloseOnScroll(anchorRef, () => pop.value?.hide())
//        <Popover @show="onShow" @hide="onHide">
export function useCloseOnScroll(anchor: Ref<Element | null>, close: () => void) {
  const onScroll = (event: Event) => {
    const scrolled = event.target
    if (anchor.value && scrolled instanceof Node && scrolled.contains(anchor.value)) close()
  }
  const onHide = () => window.removeEventListener('scroll', onScroll, { capture: true })
  const onShow = () => window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  onBeforeUnmount(onHide)
  return { onShow, onHide }
}
