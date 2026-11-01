<script setup lang="ts">
import { ref } from 'vue'
import Popover from 'primevue/popover'
import { useCloseOnScroll } from '../lib/close-on-scroll'

// Small link marker next to a profile field that other screens read from.
// Hover (or tap on phones) to see where the value is used.
defineProps<{ where: string[]; note?: string }>()

const pop = ref<InstanceType<typeof Popover> | null>(null)
const pinned = ref(false)
const show = (e: Event) => pop.value?.show(e)
const hide = () => !pinned.value && pop.value?.hide()
// Close on scroll, so an open popover doesn't float over the page on a phone.
const marker = ref<HTMLElement | null>(null)
const scrollClose = useCloseOnScroll(marker, () => pop.value?.hide())
function onHide() {
  pinned.value = false
  scrollClose.onHide()
}
function toggle(e: Event) {
  pinned.value = !pinned.value
  if (pinned.value) pop.value?.show(e)
  else pop.value?.hide()
}
</script>

<template>
  <!-- A span, not a <button>: this sits inside field <label>s, and a label forwards
       every tap on its text or on a non-input control (like Select) to its first
       labelable child. A button would catch those taps and open the popover. -->
  <span
    ref="marker"
    role="button"
    tabindex="0"
    class="used-by"
    aria-label="Used elsewhere in the app"
    aria-haspopup="true"
    @click.prevent.stop="toggle"
    @keydown.enter.prevent.stop="toggle"
    @keydown.space.prevent.stop="toggle"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
  >
    <i class="pi pi-link" aria-hidden="true"></i>
  </span>
  <Popover ref="pop" class="used-by-pop" @show="scrollClose.onShow" @hide="onHide">
    <p class="ub-title">Used elsewhere</p>
    <p v-if="note" class="ub-note">{{ note }}</p>
    <ul>
      <li v-for="w in where" :key="w">{{ w }}</li>
    </ul>
  </Popover>
</template>

<style scoped>
.used-by {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--muted);
  vertical-align: middle;
  cursor: help;
}
.used-by .pi {
  font-size: 0.6875rem;
}
.used-by:hover,
.used-by:focus-visible {
  color: var(--ink);
  background: var(--panel-2);
  outline: none;
}
</style>

<style>
/* Popover is teleported to <body>, so these can't be scoped. */
.used-by-pop {
  max-width: min(300px, calc(100vw - 32px));
  font-size: 0.8125rem;
}
.used-by-pop .ub-title {
  margin: 0 0 4px;
  font-weight: 600;
  color: var(--ink);
}
.used-by-pop .ub-note {
  margin: 0 0 6px;
  color: var(--ink-2);
}
/* Phones: keep it off the screen edges; the arrow would point wrong once moved, so drop it. */
@media (max-width: 600px) {
  .used-by-pop {
    left: 16px !important;
    max-width: calc(100vw - 32px);
  }
  .used-by-pop::before,
  .used-by-pop::after {
    display: none;
  }
}
.used-by-pop ul {
  margin: 0;
  padding-left: 16px;
  color: var(--ink-2);
  display: grid;
  gap: 3px;
}
</style>
