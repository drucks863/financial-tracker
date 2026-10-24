<script setup lang="ts">
// The month tabs from the sheet, as a strip: each month shows its net cash flow as a
// small bar above (saved) or below (overspent) a shared baseline.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Select from 'primevue/select'
import { ui } from '../store/ui'
import { monthTotals, yearsAvailable } from '../store/finance'
import { MONTHS, signedMoney } from '../lib/format'

const rows = computed(() => monthTotals(ui.year))
const max = computed(() => Math.max(1, ...rows.value.map((r) => Math.abs(r.net))))
const years = computed(() => {
  const ys = yearsAvailable()
  if (!ys.includes(ui.year)) ys.unshift(ui.year)
  return ys.map((y) => ({ label: String(y), value: y }))
})

const strip = ref<HTMLElement | null>(null)
function scrollToActive() {
  nextTick(() => {
    const el = strip.value?.querySelector('[aria-pressed="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  })
}
onMounted(scrollToActive)
watch(() => [ui.month, ui.year], scrollToActive)
</script>

<template>
  <div class="month-strip">
    <Select v-model="ui.year" :options="years" option-label="label" option-value="value" class="year" aria-label="Year" size="small" />
    <div ref="strip" class="months" role="group" aria-label="Month">
      <button
        v-for="r in rows"
        :key="r.month"
        type="button"
        class="m"
        :class="{ empty: !r.count }"
        :aria-pressed="ui.month === r.month"
        :title="r.count ? `${MONTHS[r.month]}: net ${signedMoney(r.net)}` : `${MONTHS[r.month]}: no entries yet`"
        @click="ui.month = r.month"
      >
        <span class="bar-zone" aria-hidden="true">
          <span
            v-if="r.count"
            class="bar"
            :class="r.net >= 0 ? 'up' : 'down'"
            :style="{ height: `${Math.max(2, (Math.abs(r.net) / max) * 22)}px` }"
          ></span>
        </span>
        <span class="label">{{ MONTHS[r.month] }}</span>
        <span class="net num" :class="r.count ? (r.net >= 0 ? 'up' : 'down') : ''">{{ r.count ? signedMoney(r.net) : '—' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.month-strip {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}
.year {
  flex: none;
  align-self: center;
  width: 108px;
}
/* The year sits on its own line above the month scroller, so the months get the full width. */
.month-strip {
  flex-direction: column;
  gap: 6px;
}
.year {
  align-self: flex-start;
}
.months {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  min-width: 0;
  flex: 1;
  padding: 2px;
}
.months::-webkit-scrollbar {
  display: none;
}
.m {
  flex: 1 0 58px;
  scroll-snap-align: center;
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 6px 4px 7px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  cursor: pointer;
}
.m:hover {
  background: var(--accent-soft);
}
.m[aria-pressed='true'] {
  background: var(--panel);
  border-color: var(--accent);
  color: var(--ink);
}
.bar-zone {
  position: relative;
  width: 100%;
  height: 46px;
}
.bar-zone::after {
  content: '';
  position: absolute;
  left: 22%;
  right: 22%;
  top: 23px;
  height: 1px;
  background: var(--line);
}
.bar {
  position: absolute;
  left: 50%;
  width: 14px;
  margin-left: -7px;
  border-radius: 4px;
}
.bar.up {
  bottom: 23px;
  background: var(--good);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.bar.down {
  top: 24px;
  background: var(--bad);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.label {
  font-size: 0.8125rem;
  font-weight: 600;
}
.net {
  font-size: 0.6875rem;
  color: var(--muted);
}
.net.up {
  color: var(--good);
}
.net.down {
  color: var(--bad);
}
.m.empty .label {
  color: var(--muted);
  font-weight: 500;
}
</style>
