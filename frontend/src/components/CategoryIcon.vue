<script setup lang="ts">
import { computed } from 'vue'
import { categoryColor } from '../store/ui'
import { categoryIcon } from '../lib/category-icons'
import { isDark } from '../lib/theme-mode'
import type { EntryType } from '../types'

// A category's icon on a tile tinted with its chart color (income uses the income color),
// so the same category looks the same in the Add entry form, Cash flow and Overview.
const props = withDefaults(defineProps<{ name: string; type?: EntryType; size?: 'sm' | 'md' }>(), { type: 'expense', size: 'md' })
const color = computed(() => (props.type === 'income' ? 'var(--series-income)' : categoryColor(props.name, isDark.value)))
</script>

<template>
  <span class="cat-icon" :class="size" :style="{ '--cat': color }" aria-hidden="true">
    <i class="pi" :class="categoryIcon(name, type)"></i>
  </span>
</template>

<style scoped>
.cat-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--cat);
  background: color-mix(in srgb, var(--cat) 16%, transparent);
}
.cat-icon .pi {
  font-size: 0.95rem;
}
.cat-icon.sm {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}
.cat-icon.sm .pi {
  font-size: 0.75rem;
}
</style>
