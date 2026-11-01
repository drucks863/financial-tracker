<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import { SIMULATORS } from '../lib/simulators'

// The frame every Plan page (what-if simulator) sits in: a "What-if" header, a note that changes
// stay on the page, a Reset all button, and links between simulators once there's more than one.
const props = defineProps<{ id: string; changedCount: number }>()
const emit = defineEmits<{ reset: []; navigate: [id: string] }>()
const info = computed(() => SIMULATORS.find((simulator) => simulator.id === props.id)!)
</script>

<template>
  <div class="stack sim">
    <header class="sim-head">
      <div class="sim-title">
        <p class="sim-kicker"><i class="pi pi-sliders-h" aria-hidden="true"></i> Plan · what-if</p>
        <h1>{{ info.label }}</h1>
        <p class="muted">{{ info.blurb }}</p>
      </div>
      <nav v-if="SIMULATORS.length > 1" class="sim-switch" aria-label="Simulators">
        <button
          v-for="simulator in SIMULATORS"
          :key="simulator.id"
          type="button"
          :aria-current="simulator.id === id ? 'page' : undefined"
          @click="emit('navigate', simulator.id)"
        >
          <i :class="simulator.icon" aria-hidden="true"></i> {{ simulator.label }}
        </button>
      </nav>
    </header>

    <div class="sim-note" :class="{ changed: changedCount > 0 }">
      <i class="pi" :class="changedCount ? 'pi-pencil' : 'pi-link'" aria-hidden="true"></i>
      <p v-if="changedCount">
        <strong>{{ changedCount }} {{ changedCount === 1 ? 'number' : 'numbers' }} changed here.</strong>
        Your profile and data aren't touched.
      </p>
      <p v-else>Starts from your profile and real data. Change anything here; it never changes your profile.</p>
      <Button v-if="changedCount" label="Reset all" icon="pi pi-replay" size="small" text severity="secondary" @click="emit('reset')" />
    </div>

    <slot />
  </div>
</template>

<style scoped>
.sim-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.sim-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  padding: 2px 9px;
  border: 1px dashed var(--muted);
  border-radius: 999px;
  color: var(--ink-2);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.sim-kicker .pi {
  font-size: 0.6875rem;
}
.sim-title .muted {
  font-size: 0.875rem;
}
.sim-switch {
  display: flex;
  gap: 4px;
  overflow-x: auto;
}
.sim-switch button {
  border: 1px dashed var(--line);
  background: none;
  color: var(--ink-2);
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
}
.sim-switch button[aria-current='page'] {
  border-style: solid;
  border-color: var(--accent);
  color: var(--ink);
}
.sim-note {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 12px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--ink-2);
  font-size: 0.8125rem;
  line-height: 1.4;
  min-height: 44px;
}
.sim-note.changed {
  border-color: var(--muted);
}
.sim-note p {
  flex: 1;
  min-width: 0;
}
.sim-note strong {
  color: var(--ink);
  font-weight: 600;
}
.sim-note > .pi {
  color: var(--muted);
}
</style>
