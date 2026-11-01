<script setup lang="ts">
// One input on a Plan page. Shows where the starting value came from, and once you've changed it,
// a dot and a one-tap way back to your real number.
defineProps<{
  label: string
  /** you changed it on this page */
  changed: boolean
  /** the real value, formatted ("6%", "$92,000") */
  realText?: string
  /** where the real value comes from ("profile", "Net worth, Oct ’26") */
  source?: string
  hint?: string
}>()
const emit = defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="sim-field" :class="{ changed }">
    <label>
      <span class="label">
        <span v-if="changed" class="dot" aria-hidden="true"></span>
        {{ label }}
      </span>
      <slot />
    </label>
    <small v-if="changed" class="origin">
      Yours: {{ realText }}<template v-if="source"> ({{ source }})</template> ·
      <button type="button" class="back" @click="emit('reset')">Use it</button>
    </small>
    <small v-else-if="source" class="origin muted">From {{ source }}</small>
    <small v-if="hint" class="muted">{{ hint }}</small>
  </div>
</template>

<style scoped>
.sim-field {
  display: grid;
  gap: 4px;
  align-content: start;
  min-width: 0;
}
.sim-field label {
  display: grid;
  gap: 6px;
  align-content: start;
}
.label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ink-2);
}
.changed .label {
  color: var(--ink);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}
small {
  font-size: 0.75rem;
  line-height: 1.35;
}
.origin {
  color: var(--ink-2);
}
.back {
  border: 0;
  background: none;
  padding: 0;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
</style>
